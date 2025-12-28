import os
from datetime import datetime
from typing import List
import logging

from sagrada.shared.models import Reading
from sagrada.collector.config.settings import OneWireConfig
from .base import SensorReader

logger = logging.getLogger(__name__)

class OneWireReader(SensorReader):
    def __init__(self, config: OneWireConfig):
        """
        Initialize OneWire reader with typed configuration
        Args:
            config: OneWireConfig object containing device configurations
        """

        if not isinstance(config, OneWireConfig):
            raise ValueError(f"Expected OneWireConfig, got {type(config)}")
            
        self.config = config
        self.device_paths = {}
        
        # Iterate through configured devices
        for device_id, device in self.config.devices.items():
            filepath = f"/sys/bus/w1/devices/{device.address}/w1_slave"
            if os.path.exists(filepath):
                self.device_paths[device_id] = {
                    'filepath': filepath,
                    'address': device.address,
                    'location': device.location,
                    'type': device.type
                }
            else:
                logger.error(f"Sensor {device_id} not found at {filepath}")

        logger.info(f"Initialized OneWireReader with {len(self.device_paths)} live devices")

    def get_readings(self) -> List[Reading]:
        readings = []
        now = datetime.now()

        for device_id, device_info in self.device_paths.items():
            filepath = device_info['filepath']
            location = device_info['location']
            address = device_info['address']
            sensor_type = device_info['type']
            
            try:
                with open(filepath, 'r') as f:
                    data = f.read()

                if 'YES' in data and 't=' in data:
                    temp_str = data.split('t=')[1]
                    temp_c = float(temp_str) / 1000.0
                    temp_f = temp_c * 9.0 / 5.0 + 32.0
                    readings.append(Reading(
                        timestamp=now,
                        source_type='onewire',
                        sensor_id=address,
                        metric='temperature_f',
                        metric_type='numeric',
                        value=str(temp_f),
                        location=location
                    ))
            except Exception as e:
                logger.error(f"Failed to read sensor {device_id} at {filepath}: {e}")

        return readings
    
    def check_health(self) -> bool:
        """Check if we have any accessible devices"""
        return len(self.device_paths) > 0
