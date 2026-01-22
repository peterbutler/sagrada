"""Network Monitor Service - Monitors network connectivity and attempts recovery."""

import asyncio
import json
import logging
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from .config import NetworkMonitorConfig

logger = logging.getLogger(__name__)


class NetworkState(Enum):
    """Network connectivity states."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"  # Some checks failing
    DOWN = "down"  # All checks failing
    RECOVERING = "recovering"  # Attempting recovery


class RecoveryLevel(Enum):
    """Escalating recovery actions."""
    NONE = 0
    ARP_FLUSH = 1
    WIFI_REASSOCIATE = 2
    NETWORK_RESTART = 3
    REBOOT = 4  # Last resort, disabled by default


@dataclass
class ConnectivityCheck:
    """Result of a connectivity check."""
    target: str
    success: bool
    latency_ms: Optional[float] = None
    error: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class NetworkStatus:
    """Current network status."""
    state: NetworkState
    gateway_reachable: bool
    internet_reachable: bool
    wifi_connected: bool
    consecutive_failures: int
    last_recovery_attempt: Optional[float]
    last_recovery_level: RecoveryLevel
    checks: List[ConnectivityCheck] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON/MQTT."""
        return {
            "state": self.state.value,
            "gateway_reachable": self.gateway_reachable,
            "internet_reachable": self.internet_reachable,
            "wifi_connected": self.wifi_connected,
            "consecutive_failures": self.consecutive_failures,
            "last_recovery_attempt": self.last_recovery_attempt,
            "last_recovery_level": self.last_recovery_level.name,
            "timestamp": self.timestamp,
        }


class NetworkMonitorService:
    """Service that monitors network connectivity and attempts recovery."""

    def __init__(self, config: NetworkMonitorConfig):
        self.config = config
        self.mqtt_client: Optional[mqtt.Client] = None
        self.running = False

        # State tracking
        self.consecutive_failures = 0
        self.last_recovery_attempt: Optional[float] = None
        self.last_recovery_level = RecoveryLevel.NONE
        self.last_state = NetworkState.HEALTHY
        self.state_changed_at = time.time()

    def _setup_mqtt(self) -> None:
        """Set up MQTT client for publishing status."""
        self.mqtt_client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=f"network-monitor-{int(time.time())}",
        )

        def on_connect(client, userdata, flags, reason_code, properties):
            if reason_code == 0:
                logger.info("Connected to MQTT broker")
            else:
                logger.error(f"MQTT connection failed: {reason_code}")

        def on_disconnect(client, userdata, flags, reason_code, properties):
            logger.warning(f"Disconnected from MQTT broker: {reason_code}")

        self.mqtt_client.on_connect = on_connect
        self.mqtt_client.on_disconnect = on_disconnect

        try:
            self.mqtt_client.connect(
                self.config.mqtt.broker,
                self.config.mqtt.port,
                self.config.mqtt.keepalive,
            )
            self.mqtt_client.loop_start()
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")
            self.mqtt_client = None

    def _ping(self, host: str, timeout: float = 2.0) -> ConnectivityCheck:
        """Ping a host and return connectivity check result."""
        try:
            start = time.time()
            result = subprocess.run(
                ["ping", "-c", "1", "-W", str(int(timeout)), host],
                capture_output=True,
                timeout=timeout + 1,
            )
            latency = (time.time() - start) * 1000

            if result.returncode == 0:
                return ConnectivityCheck(
                    target=host,
                    success=True,
                    latency_ms=latency,
                )
            else:
                return ConnectivityCheck(
                    target=host,
                    success=False,
                    error=f"ping returned {result.returncode}",
                )
        except subprocess.TimeoutExpired:
            return ConnectivityCheck(
                target=host,
                success=False,
                error="timeout",
            )
        except Exception as e:
            return ConnectivityCheck(
                target=host,
                success=False,
                error=str(e),
            )

    def _check_wifi_link(self) -> bool:
        """Check if WiFi interface has a link."""
        try:
            result = subprocess.run(
                ["cat", f"/sys/class/net/{self.config.wifi_interface}/operstate"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.stdout.strip() == "up"
        except Exception as e:
            logger.warning(f"Could not check WiFi link: {e}")
            return False

    def _get_wifi_ssid(self) -> Optional[str]:
        """Get currently connected WiFi SSID."""
        try:
            result = subprocess.run(
                ["iwgetid", "-r"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.stdout.strip() if result.returncode == 0 else None
        except Exception:
            return None

    def check_connectivity(self) -> NetworkStatus:
        """Run all connectivity checks and return status."""
        checks = []

        # Check gateway
        gateway_check = self._ping(self.config.gateway_ip, self.config.ping_timeout)
        checks.append(gateway_check)

        # Check internet (optional)
        internet_check = None
        if self.config.check_internet:
            internet_check = self._ping(self.config.internet_ip, self.config.ping_timeout)
            checks.append(internet_check)

        # Check WiFi link
        wifi_connected = self._check_wifi_link()

        # Determine overall state
        gateway_ok = gateway_check.success
        internet_ok = internet_check.success if internet_check else True

        if gateway_ok and internet_ok and wifi_connected:
            state = NetworkState.HEALTHY
            self.consecutive_failures = 0
        elif gateway_ok or wifi_connected:
            state = NetworkState.DEGRADED
            self.consecutive_failures += 1
        else:
            state = NetworkState.DOWN
            self.consecutive_failures += 1

        # Track state changes
        if state != self.last_state:
            logger.info(f"Network state changed: {self.last_state.value} -> {state.value}")
            self.last_state = state
            self.state_changed_at = time.time()

        return NetworkStatus(
            state=state,
            gateway_reachable=gateway_ok,
            internet_reachable=internet_ok if self.config.check_internet else True,
            wifi_connected=wifi_connected,
            consecutive_failures=self.consecutive_failures,
            last_recovery_attempt=self.last_recovery_attempt,
            last_recovery_level=self.last_recovery_level,
            checks=checks,
        )

    async def _run_recovery_action(self, level: RecoveryLevel) -> bool:
        """Execute a recovery action at the specified level."""
        logger.info(f"Attempting recovery action: {level.name}")
        self.last_recovery_attempt = time.time()
        self.last_recovery_level = level

        try:
            if level == RecoveryLevel.ARP_FLUSH:
                # Flush ARP cache
                result = subprocess.run(
                    ["sudo", "ip", "neigh", "flush", "all"],
                    capture_output=True,
                    timeout=10,
                )
                success = result.returncode == 0
                logger.info(f"ARP flush {'succeeded' if success else 'failed'}")
                return success

            elif level == RecoveryLevel.WIFI_REASSOCIATE:
                # Reassociate WiFi
                result = subprocess.run(
                    ["sudo", "wpa_cli", "-i", self.config.wifi_interface, "reassociate"],
                    capture_output=True,
                    timeout=15,
                )
                success = result.returncode == 0
                logger.info(f"WiFi reassociate {'succeeded' if success else 'failed'}")
                # Wait for connection to establish
                if success:
                    await asyncio.sleep(5)
                return success

            elif level == RecoveryLevel.NETWORK_RESTART:
                # Full network restart
                logger.warning("Restarting network service...")
                # Try NetworkManager first, fall back to dhcpcd
                result = subprocess.run(
                    ["sudo", "systemctl", "restart", "NetworkManager"],
                    capture_output=True,
                    timeout=30,
                )
                if result.returncode != 0:
                    result = subprocess.run(
                        ["sudo", "systemctl", "restart", "dhcpcd"],
                        capture_output=True,
                        timeout=30,
                    )
                success = result.returncode == 0
                logger.info(f"Network restart {'succeeded' if success else 'failed'}")
                if success:
                    await asyncio.sleep(10)
                return success

            elif level == RecoveryLevel.REBOOT:
                if not self.config.enable_reboot:
                    logger.warning("Reboot requested but disabled in config")
                    return False
                logger.critical("Initiating system reboot...")
                subprocess.run(["sudo", "reboot"], timeout=5)
                return True

        except subprocess.TimeoutExpired:
            logger.error(f"Recovery action {level.name} timed out")
            return False
        except Exception as e:
            logger.error(f"Recovery action {level.name} failed: {e}")
            return False

        return False

    async def attempt_recovery(self, status: NetworkStatus) -> None:
        """Attempt recovery based on current status and failure count."""
        if status.state == NetworkState.HEALTHY:
            return

        # Check if we should attempt recovery
        if self.last_recovery_attempt:
            time_since_last = time.time() - self.last_recovery_attempt
            if time_since_last < self.config.recovery_cooldown:
                logger.debug(
                    f"Recovery cooldown active ({time_since_last:.0f}s < {self.config.recovery_cooldown}s)"
                )
                return

        # Determine recovery level based on consecutive failures
        if self.consecutive_failures >= self.config.failures_before_network_restart:
            level = RecoveryLevel.NETWORK_RESTART
        elif self.consecutive_failures >= self.config.failures_before_wifi_reassociate:
            level = RecoveryLevel.WIFI_REASSOCIATE
        elif self.consecutive_failures >= self.config.failures_before_arp_flush:
            level = RecoveryLevel.ARP_FLUSH
        else:
            return

        # Don't repeat the same level too quickly
        if level == self.last_recovery_level:
            # Escalate if same level failed recently
            if self.last_recovery_attempt and (time.time() - self.last_recovery_attempt) < 120:
                next_level = RecoveryLevel(min(level.value + 1, RecoveryLevel.NETWORK_RESTART.value))
                if next_level != level:
                    logger.info(f"Escalating recovery: {level.name} -> {next_level.name}")
                    level = next_level

        await self._run_recovery_action(level)

    def _publish_metric(self, metric: str, value: any, unit: str = None) -> None:
        """Publish a single metric to MQTT in sensor format."""
        if not self.mqtt_client:
            return

        topic = f"{self.config.mqtt_topic}/{metric}"
        payload = json.dumps({
            "value": value,
            "unit": unit,
            "ts": time.time(),
            "sensor": "network-monitor",
        })
        self.mqtt_client.publish(topic, payload, qos=1)

    def publish_status(self, status: NetworkStatus) -> None:
        """Publish network status to MQTT."""
        if not self.mqtt_client:
            return

        try:
            # Publish combined status (for dashboard)
            payload = json.dumps(status.to_dict())
            self.mqtt_client.publish(
                self.config.mqtt_topic,
                payload,
                qos=1,
            )

            # Publish individual metrics (for logging to MySQL)
            # State as numeric: 0=healthy, 1=degraded, 2=down
            state_value = {"healthy": 0, "degraded": 1, "down": 2}.get(status.state.value, -1)
            self._publish_metric("state", state_value, "state")

            # Gateway latency (from first check)
            if status.checks:
                gateway_check = status.checks[0]
                if gateway_check.success and gateway_check.latency_ms is not None:
                    self._publish_metric("gateway_latency", round(gateway_check.latency_ms, 1), "ms")

                # Internet latency (from second check if present)
                if len(status.checks) > 1:
                    internet_check = status.checks[1]
                    if internet_check.success and internet_check.latency_ms is not None:
                        self._publish_metric("internet_latency", round(internet_check.latency_ms, 1), "ms")

            # Failure count
            self._publish_metric("failures", status.consecutive_failures, "count")

            logger.debug(f"Published status: {status.state.value}")
        except Exception as e:
            logger.error(f"Failed to publish status: {e}")

    async def run_loop(self) -> None:
        """Main monitoring loop."""
        logger.info(
            f"Starting network monitor (gateway={self.config.gateway_ip}, "
            f"interval={self.config.check_interval}s)"
        )

        while self.running:
            try:
                # Check connectivity
                status = self.check_connectivity()

                # Log status changes or periodic status
                if status.state != NetworkState.HEALTHY:
                    logger.warning(
                        f"Network {status.state.value}: gateway={status.gateway_reachable}, "
                        f"wifi={status.wifi_connected}, failures={status.consecutive_failures}"
                    )

                # Publish to MQTT
                self.publish_status(status)

                # Attempt recovery if needed
                if self.config.enable_recovery:
                    await self.attempt_recovery(status)

            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")

            await asyncio.sleep(self.config.check_interval)

    def run(self) -> None:
        """Start the monitoring service."""
        self.running = True
        self._setup_mqtt()

        try:
            asyncio.run(self.run_loop())
        except KeyboardInterrupt:
            logger.info("Shutting down network monitor...")
        finally:
            self.running = False
            if self.mqtt_client:
                self.mqtt_client.loop_stop()
                self.mqtt_client.disconnect()
