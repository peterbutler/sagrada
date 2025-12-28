"""Base class for sensor readers."""

from abc import ABC, abstractmethod
from typing import List
import logging

from sagrada.shared.models import Reading

logger = logging.getLogger(__name__)


class SensorReader(ABC):
    """Base class for all sensor readers."""

    @abstractmethod
    def get_readings(self) -> List[Reading]:
        """Get current readings from all sensors managed by this reader."""
        pass

    @abstractmethod
    def check_health(self) -> bool:
        """Basic health check - can we talk to our sensors?"""
        pass
