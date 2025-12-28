"""MQTT Logger Service - subscribes to topics and logs readings to MySQL."""

import json
import logging
import signal
import sys
from datetime import datetime
from typing import Optional

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from .config import Config
from sagrada.shared.models import Reading
from sagrada.shared.database import ReadingsStorage

logger = logging.getLogger(__name__)


class MQTTLoggerService:
    """Service that subscribes to MQTT topics and logs readings to the database."""

    def __init__(self, config: Config):
        self.config = config
        self.storage = ReadingsStorage(config.db)
        self.client: Optional[mqtt.Client] = None
        self._running = False

    def _on_connect(self, client: mqtt.Client, userdata, flags, reason_code, properties):
        """Callback when connected to MQTT broker."""
        if reason_code == 0:
            logger.info(f"Connected to MQTT broker at {self.config.mqtt.broker}:{self.config.mqtt.port}")
            # Subscribe to all configured patterns
            for sub in self.config.subscriptions:
                client.subscribe(sub.pattern)
                logger.info(f"Subscribed to: {sub.pattern}")
        else:
            logger.error(f"Failed to connect to MQTT broker, reason: {reason_code}")

    def _on_disconnect(self, client: mqtt.Client, userdata, disconnect_flags, reason_code, properties):
        """Callback when disconnected from MQTT broker."""
        if reason_code != 0:
            logger.warning(f"Unexpected disconnection from MQTT broker (reason={reason_code})")
        else:
            logger.info("Disconnected from MQTT broker")

    def _on_message(self, client: mqtt.Client, userdata, msg: mqtt.MQTTMessage):
        """Callback when a message is received."""
        try:
            self._process_message(msg.topic, msg.payload)
        except Exception as e:
            logger.error(f"Error processing message from {msg.topic}: {e}")

    def _process_message(self, topic: str, payload: bytes):
        """Process an incoming MQTT message.

        Args:
            topic: The MQTT topic (e.g., "shed/ambient/desk/temperature")
            payload: The message payload (JSON bytes)
        """
        # Parse topic segments
        # Expected format: {building}/{system}/{location}/{metric}
        segments = topic.split("/")
        if len(segments) != 4:
            logger.debug(f"Ignoring topic with unexpected format: {topic}")
            return

        building, system, location_key, metric_type = segments

        # Construct location from system/location_key
        location = f"{system}/{location_key}"

        # Parse JSON payload
        try:
            data = json.loads(payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.warning(f"Failed to parse payload from {topic}: {e}")
            return

        # Extract required fields
        value = data.get("value")
        unit = data.get("unit", "")
        ts = data.get("ts")
        sensor_id = data.get("sensor", "unknown")

        if value is None or ts is None:
            logger.warning(f"Missing required fields in payload from {topic}: {data}")
            return

        # Convert timestamp from Unix epoch
        try:
            timestamp = datetime.fromtimestamp(ts)
        except (ValueError, TypeError, OSError) as e:
            logger.warning(f"Invalid timestamp {ts} from {topic}: {e}")
            return

        # Determine metric name (e.g., "temperature_c" for Celsius temperatures)
        if metric_type == "temperature":
            metric = f"temperature_{unit.lower()}" if unit else "temperature"
        else:
            metric = metric_type

        # Create reading
        reading = Reading(
            timestamp=timestamp,
            source_type="mqtt",
            sensor_id=sensor_id,
            location=location,
            metric=metric,
            metric_type="numeric",
            value=str(value),
        )

        # Store to database
        if self.storage.store_reading(reading):
            logger.debug(f"Logged: {location}/{metric} = {value} from {sensor_id}")
        else:
            logger.warning(f"Failed to store reading from {topic}")

    def _setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            signame = signal.Signals(signum).name
            logger.info(f"Received {signame}, shutting down...")
            self._running = False
            if self.client:
                self.client.disconnect()

        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)

    def run(self):
        """Run the MQTT logger service (blocking)."""
        self._setup_signal_handlers()
        self._running = True

        # Create MQTT client (paho-mqtt v2 API)
        self.client = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=self.config.mqtt.client_id,
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        logger.info(f"Connecting to MQTT broker at {self.config.mqtt.broker}:{self.config.mqtt.port}")

        try:
            self.client.connect(self.config.mqtt.broker, self.config.mqtt.port, keepalive=60)
            self.client.loop_forever()
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"MQTT error: {e}")
        finally:
            self.storage.close()
            logger.info("MQTT Logger service stopped")
