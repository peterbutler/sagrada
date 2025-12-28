import random
from datetime import datetime
from typing import List, Dict
import logging

from sagrada.shared.models import Reading
from .base import SensorReader

logger = logging.getLogger(__name__)

class DummyReader(SensorReader):
    def __init__(self, config: Dict[str, List[str]]):
        """
        config should be a dict like:
        {
            'temperature': ['shed', 'outside', 'tank'],
            'humidity': ['shed', 'outside'],
            'state': ['pump', 'heater', 'fan']
        }
        """
        self.config = config
        logger.info(f"Initialized DummyReader with {sum(len(v) for v in config.values())} simulated sensors")
        
        # Keep state for boolean sensors so we don't flip too often
        self.boolean_states = {
            f"{location}": random.choice([True, False])
            for location in config.get('state', [])
        }
        
        # Keep last values for numeric sensors to avoid wild jumps
        self.last_values = {}
    
    def _get_numeric_value(self, sensor_id: str, base_value: float, variation: float) -> float:
        """Generate a somewhat realistic varying value"""
        if sensor_id not in self.last_values:
            self.last_values[sensor_id] = base_value
            
        # Random walk with mean reversion
        current = self.last_values[sensor_id]
        change = random.uniform(-variation, variation)
        new_value = current + change
        
        # Mean reversion
        new_value = new_value * 0.9 + base_value * 0.1
        
        self.last_values[sensor_id] = new_value
        return new_value
    
    def get_readings(self) -> List[Reading]:
        readings = []
        now = datetime.now()
        
        # Generate temperature readings
        for location in self.config.get('temperature', []):
            value = self._get_numeric_value(
                f"temp_{location}",
                base_value=22.0,  # room temperature in Celsius
                variation=0.5
            )
            readings.append(Reading(
                timestamp=now,
                source_type='dummy',
                sensor_id=location,
                metric='temperature',
                metric_type='numeric',
                value=str(round(value, 1)),
                location=None
            ))
        
        # Generate humidity readings
        for location in self.config.get('humidity', []):
            value = self._get_numeric_value(
                f"humidity_{location}",
                base_value=50.0,  # 50% humidity
                variation=2.0
            )
            readings.append(Reading(
                timestamp=now,
                source_type='dummy',
                sensor_id=location,
                metric='humidity',
                metric_type='numeric',
                value=str(round(value, 1)),
                location=None
            ))
        
        # Generate boolean state readings
        for location in self.config.get('state', []):
            # 10% chance to change state
            if random.random() < 0.1:
                self.boolean_states[location] = not self.boolean_states[location]
            
            readings.append(Reading(
                timestamp=now,
                source_type='dummy',
                sensor_id=location,
                metric='state',
                metric_type='state',
                value=str(self.boolean_states[location]).lower(),
                location=None
            ))
        
        return readings
    
    def check_health(self) -> bool:
        # Dummy reader is always healthy
        return True