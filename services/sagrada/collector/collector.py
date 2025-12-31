from typing import List, Optional
import logging
import json
import time

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from sagrada.shared.models import Reading
from sagrada.shared.database import DBConfig, ReadingsStorage
from .config.settings import SensorConfigs, MQTTConfig
from .readers.base import SensorReader

logger = logging.getLogger(__name__)

class DataCollector:
    _singleton_readers = {}

    # Define reader types and their corresponding classes
    READER_TYPES = {
        'kasa': '.readers.kasa.KasaPlugReader',
        'mysql': '.readers.mysql.MySQLReader'
    }

    def __init__(self, sensor_configs: SensorConfigs, db_config: DBConfig, mqtt_config: Optional[MQTTConfig] = None):
        self.readers = {}
        self.storage = ReadingsStorage(db_config)
        self.db_config = db_config
        self.mqtt_client: Optional[mqtt.Client] = None
        self._mqtt_connected = False

        # Initialize MQTT client if config provided
        if mqtt_config:
            self._init_mqtt(mqtt_config)

        # Initialize readers based on configuration
        for reader_type, config in sensor_configs.__dict__.items():
            if config:  # Only process if configuration exists
                if reader_type not in self._singleton_readers:
                    self._singleton_readers[reader_type] = self._create_reader(reader_type, config)
                self.readers[reader_type] = self._singleton_readers[reader_type]

        logger.info(f"Initialized DataCollector with {len(self.readers)} readers")

    def _init_mqtt(self, config: MQTTConfig):
        """Initialize MQTT client for publishing readings."""
        try:
            self.mqtt_client = mqtt.Client(
                callback_api_version=CallbackAPIVersion.VERSION2,
                client_id="sagrada-collector"
            )

            def on_connect(client, userdata, flags, reason_code, properties):
                if reason_code == 0:
                    logger.info(f"Connected to MQTT broker at {config.broker}:{config.port}")
                    self._mqtt_connected = True
                else:
                    logger.error(f"Failed to connect to MQTT: {reason_code}")

            def on_disconnect(client, userdata, disconnect_flags, reason_code, properties):
                self._mqtt_connected = False
                if reason_code != 0:
                    logger.warning(f"MQTT disconnected: {reason_code}")

            self.mqtt_client.on_connect = on_connect
            self.mqtt_client.on_disconnect = on_disconnect

            self.mqtt_client.connect(config.broker, config.port, keepalive=60)
            self.mqtt_client.loop_start()

        except Exception as e:
            logger.error(f"Failed to initialize MQTT: {e}")
            self.mqtt_client = None
    
    def _create_reader(self, reader_type: str, config):
        """Create a new reader instance based on type"""
        if reader_type not in self.READER_TYPES:
            raise ValueError(f"Unsupported reader type: {reader_type}")
            
        # Import and instantiate the reader class dynamically
        module_path = self.READER_TYPES[reader_type]
        module_name, class_name = module_path.rsplit('.', 1)

        full_module_path = f"sagrada.collector{module_name}"
        reader_class = getattr(__import__(full_module_path, fromlist=[class_name]), class_name)
        
        # Pass db_config to MySQL reader
        if reader_type == 'mysql':
            return reader_class(config, self.db_config)
        return reader_class(config)

    def _publish_readings_to_mqtt(self, readings: List[Reading]):
        """Publish readings to MQTT for real-time UI updates."""
        if not self._mqtt_connected or not self.mqtt_client:
            return

        for reading in readings:
            # Determine topic based on source type
            if reading.source_type == 'kasa':
                # Kasa devices: kasa/{location}/{metric}
                topic = f"kasa/{reading.location}/{reading.metric}"
            elif reading.source_type == 'mysql':
                # MySQL readings (like target_temp): shed/control/{location}/{metric}
                topic = f"shed/control/{reading.location}/{reading.metric}"
            else:
                # Skip unknown source types
                continue

            # Format payload based on metric type
            if reading.metric == 'state':
                # Convert "true"/"false" to "on"/"off"
                payload = 'on' if reading.value.lower() == 'true' else 'off'
            else:
                # Numeric values as JSON
                try:
                    payload = json.dumps({
                        "value": float(reading.value),
                        "ts": time.time()
                    })
                except (ValueError, TypeError):
                    # Skip non-numeric values
                    continue

            result = self.mqtt_client.publish(topic, payload, qos=0)
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.debug(f"Published to {topic}: {payload}")
            else:
                logger.warning(f"Failed to publish to {topic}: rc={result.rc}")

    def collect_and_store(self):
        all_readings = []

        # Collect from all readers
        for name, reader in self.readers.items():
            logger.info(f"Collecting from {name}")
            try:
                if not reader.check_health():
                    logger.warning(f"Reader {reader.__class__.__name__} failed health check")
                    continue

                readings = reader.get_readings()
                logger.debug(f"Got {len(readings)} readings from {reader.__class__.__name__}")
                all_readings.extend(readings)
            except Exception as e:
                logger.error(f"Failed to collect from {reader.__class__.__name__}: {e}")

        if all_readings:
            try:
                self.storage.store_readings(all_readings)
                logger.info(f"Stored {len(all_readings)} readings")
            except Exception as e:
                logger.error(f"Failed to store readings: {e}")

            # Publish readings to MQTT for real-time updates
            self._publish_readings_to_mqtt(all_readings)