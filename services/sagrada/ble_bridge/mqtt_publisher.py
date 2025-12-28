"""MQTT publisher for BLE sensor data."""

import json
import logging
import threading
import time
from typing import Optional

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from .config import MQTTConfig

logger = logging.getLogger(__name__)


class MQTTPublisher:
    """Publishes sensor readings to MQTT broker."""

    def __init__(self, config: MQTTConfig):
        """Initialize MQTT publisher.

        Args:
            config: MQTT configuration.
        """
        self.config = config
        self.client: Optional[mqtt.Client] = None
        self._connected = False
        self._connect_event = threading.Event()

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        """Handle connection to broker."""
        if reason_code == 0:
            logger.info(
                f"Connected to MQTT broker at {self.config.broker}:{self.config.port}"
            )
            self._connected = True
        else:
            logger.error(f"Failed to connect to MQTT broker: {reason_code}")
            self._connected = False
        self._connect_event.set()

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        """Handle disconnection from broker."""
        self._connected = False
        if reason_code != 0:
            logger.warning(f"Unexpected MQTT disconnection (reason={reason_code})")
        else:
            logger.info("Disconnected from MQTT broker")

    def connect(self, timeout: float = 10.0) -> bool:
        """Connect to the MQTT broker.

        Args:
            timeout: Timeout in seconds to wait for connection.

        Returns:
            True if connected successfully, False otherwise.
        """
        self._connect_event.clear()

        self.client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=self.config.client_id,
            reconnect_on_failure=False,  # We'll handle reconnection manually
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

        logger.info(
            f"Connecting to MQTT broker at {self.config.broker}:{self.config.port}"
        )

        try:
            self.client.connect(self.config.broker, self.config.port, keepalive=60)
            self.client.loop_start()

            # Wait for connection callback
            if self._connect_event.wait(timeout=timeout):
                return self._connected
            else:
                logger.error("Timeout waiting for MQTT connection")
                return False
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")
            return False

    def disconnect(self):
        """Disconnect from the MQTT broker."""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None
            self._connected = False

    def publish_reading(
        self,
        building: str,
        system: str,
        location: str,
        metric: str,
        value: float,
        unit: str,
        sensor_id: str,
    ):
        """Publish a sensor reading to MQTT.

        Args:
            building: Building name (e.g., "shed").
            system: System name (e.g., "ambient").
            location: Location name (e.g., "workbench").
            metric: Metric type (e.g., "temperature").
            value: The sensor value.
            unit: Unit of measurement (e.g., "C").
            sensor_id: Sensor identifier (e.g., "ST-FLORIAN-2").
        """
        if not self._connected or not self.client:
            logger.warning("Not connected to MQTT broker, cannot publish")
            return

        topic = f"{building}/{system}/{location}/{metric}"
        payload = json.dumps({
            "value": value,
            "unit": unit,
            "ts": time.time(),
            "sensor": sensor_id,
        })

        result = self.client.publish(topic, payload, qos=1)
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            logger.debug(f"Published to {topic}: {payload}")
        else:
            logger.warning(f"Failed to publish to {topic}: rc={result.rc}")

    @property
    def is_connected(self) -> bool:
        """Check if connected to MQTT broker."""
        return self._connected
