"""MQTT configuration and utilities."""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class MQTTConfig:
    """MQTT broker configuration."""
    broker: str = "localhost"
    port: int = 1883
    client_id: str = "sagrada-client"
    keepalive: int = 60
    qos: int = 1

    @classmethod
    def from_dict(cls, data: dict) -> "MQTTConfig":
        """Create config from dictionary."""
        return cls(
            broker=data.get("broker", "localhost"),
            port=data.get("port", 1883),
            client_id=data.get("client_id", "sagrada-client"),
            keepalive=data.get("keepalive", 60),
            qos=data.get("qos", 1),
        )


def create_sensor_payload(
    value: float,
    unit: str,
    sensor_id: str,
    timestamp: Optional[float] = None,
) -> str:
    """Create a standardized MQTT payload for sensor readings.

    Args:
        value: The sensor value.
        unit: Unit of measurement (e.g., 'C', '%').
        sensor_id: Identifier for the sensor.
        timestamp: Unix timestamp (defaults to current time).

    Returns:
        JSON string payload.
    """
    return json.dumps({
        "value": value,
        "unit": unit,
        "ts": timestamp or time.time(),
        "sensor": sensor_id,
    })


def parse_sensor_payload(payload: str) -> Optional[Dict[str, Any]]:
    """Parse a sensor payload from MQTT message.

    Args:
        payload: JSON string or plain value.

    Returns:
        Dictionary with 'value', 'unit', 'ts', 'sensor' keys,
        or None if parsing fails.
    """
    try:
        data = json.loads(payload)
        if isinstance(data, dict):
            return data
        # Plain numeric value
        return {"value": float(data), "unit": None, "ts": time.time(), "sensor": None}
    except (json.JSONDecodeError, ValueError, TypeError):
        # Try plain numeric
        try:
            return {"value": float(payload), "unit": None, "ts": time.time(), "sensor": None}
        except (ValueError, TypeError):
            logger.warning(f"Could not parse MQTT payload: {payload}")
            return None
