"""Core data models for sensor readings."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Reading:
    """Represents a single sensor reading.

    All values are stored as strings for flexibility in the database.
    """
    timestamp: datetime
    source_type: str
    sensor_id: str
    location: str
    metric: str
    metric_type: str
    value: str

    def is_valid(self) -> bool:
        """Check if the reading has a valid value."""
        return self.value is not None and self.value.lower() != 'null'

    def as_float(self) -> Optional[float]:
        """Try to convert value to float, return None if not possible."""
        if not self.is_valid():
            return None
        try:
            return float(self.value)
        except (ValueError, TypeError):
            return None
