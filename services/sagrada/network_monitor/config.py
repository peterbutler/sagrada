"""Configuration for Network Monitor Service."""

import os
from dataclasses import dataclass, field
from typing import Optional

import yaml

from sagrada.shared.mqtt import MQTTConfig


@dataclass
class NetworkMonitorConfig:
    """Configuration for network monitoring."""

    # Network check settings
    gateway_ip: str = "10.0.0.1"
    internet_ip: str = "8.8.8.8"
    wifi_interface: str = "wlan0"
    check_internet: bool = True
    check_interval: float = 30.0  # seconds
    ping_timeout: float = 2.0  # seconds

    # Recovery settings
    enable_recovery: bool = True
    enable_reboot: bool = False  # Dangerous, disabled by default
    recovery_cooldown: float = 60.0  # seconds between recovery attempts

    # Failure thresholds for escalating recovery
    failures_before_arp_flush: int = 3
    failures_before_wifi_reassociate: int = 5
    failures_before_network_restart: int = 10

    # MQTT settings
    mqtt: MQTTConfig = field(default_factory=MQTTConfig)
    mqtt_topic: str = "shed/system/network"

    # Logging
    log_level: str = "INFO"

    @classmethod
    def from_dict(cls, data: dict) -> "NetworkMonitorConfig":
        """Create config from dictionary."""
        mqtt_data = data.get("mqtt", {})

        return cls(
            gateway_ip=data.get("gateway_ip", "10.0.0.1"),
            internet_ip=data.get("internet_ip", "8.8.8.8"),
            wifi_interface=data.get("wifi_interface", "wlan0"),
            check_internet=data.get("check_internet", True),
            check_interval=data.get("check_interval", 30.0),
            ping_timeout=data.get("ping_timeout", 2.0),
            enable_recovery=data.get("enable_recovery", True),
            enable_reboot=data.get("enable_reboot", False),
            recovery_cooldown=data.get("recovery_cooldown", 60.0),
            failures_before_arp_flush=data.get("failures_before_arp_flush", 3),
            failures_before_wifi_reassociate=data.get("failures_before_wifi_reassociate", 5),
            failures_before_network_restart=data.get("failures_before_network_restart", 10),
            mqtt=MQTTConfig.from_dict(mqtt_data),
            mqtt_topic=data.get("mqtt_topic", "shed/system/network"),
            log_level=data.get("log_level", "INFO"),
        )


def load_config(config_path: Optional[str] = None) -> NetworkMonitorConfig:
    """Load configuration from YAML file or environment.

    Args:
        config_path: Path to YAML config file. If not provided,
                    looks for NETWORK_MONITOR_CONFIG env var,
                    then falls back to default config.

    Returns:
        NetworkMonitorConfig instance.
    """
    if config_path is None:
        config_path = os.environ.get("NETWORK_MONITOR_CONFIG")

    if config_path and os.path.exists(config_path):
        with open(config_path) as f:
            data = yaml.safe_load(f)
            return NetworkMonitorConfig.from_dict(data or {})

    # Environment variable overrides
    config = NetworkMonitorConfig()

    if gateway := os.environ.get("NETWORK_GATEWAY_IP"):
        config.gateway_ip = gateway
    if interface := os.environ.get("NETWORK_WIFI_INTERFACE"):
        config.wifi_interface = interface
    if mqtt_broker := os.environ.get("MQTT_BROKER"):
        config.mqtt.broker = mqtt_broker
    if log_level := os.environ.get("LOG_LEVEL"):
        config.log_level = log_level

    return config
