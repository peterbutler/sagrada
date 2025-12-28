from typing import List, Optional
import logging
import pymysql
from datetime import datetime

from sagrada.shared.models import Reading
from sagrada.shared.database import DBConfig, ReadingsStorage
from .config.settings import SensorConfigs
from .readers.base import SensorReader

logger = logging.getLogger(__name__)

class DataCollector:
    _singleton_readers = {}
    
    # Define reader types and their corresponding classes
    READER_TYPES = {
        'kasa': '.readers.kasa.KasaPlugReader',
        'ble': '.readers.ble.BLEReader',
        'onewire': '.readers.onewire.OneWireReader',
        'mysql': '.readers.mysql.MySQLReader'
    }

    def __init__(self, sensor_configs: SensorConfigs, db_config: DBConfig):
        self.readers = {}
        self.storage = ReadingsStorage(db_config)
        self.db_config = db_config
        
        # Initialize readers based on configuration
        for reader_type, config in sensor_configs.__dict__.items():
            if config:  # Only process if configuration exists
                if reader_type not in self._singleton_readers:
                    self._singleton_readers[reader_type] = self._create_reader(reader_type, config)
                self.readers[reader_type] = self._singleton_readers[reader_type]
        
        logger.info(f"Initialized DataCollector with {len(self.readers)} readers")
    
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