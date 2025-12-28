"""Configuration loading for BLE-MQTT bridge."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import yaml

from sagrada.shared.mqtt import MQTTConfig


@dataclass
class BLEConfig:
    """BLE scanning and connection configuration."""
    scan_duration: float = 10.0
    scan_interval: float = 300.0
    reconnect_delay: float = 5.0
    connection_timeout: float = 20.0
    device_pattern: str = "ST-FLORIAN*"


@dataclass
class CharacteristicConfig:
    """BLE characteristic configuration."""
    uuid: str
    unit: str
    scale: float = 1.0


@dataclass
class DefaultsConfig:
    """Default values for MQTT topics."""
    building: str = "shed"
    system: str = "ambient"


@dataclass
class LocationConfig:
    """Per-device location configuration."""
    system: str
    location: str


@dataclass
class Config:
    """Main configuration."""
    mqtt: MQTTConfig
    ble: BLEConfig
    location_mapping: Dict[str, LocationConfig]
    defaults: DefaultsConfig
    characteristics: Dict[str, CharacteristicConfig]
    log_level: str = "INFO"


def load_config(config_path: Optional[str] = None) -> Config:
    """Load configuration from YAML file.

    Args:
        config_path: Path to config file. If None, looks for config.yaml
                     in the package directory.

    Returns:
        Config object with loaded settings.
    """
    if config_path is None:
        # Look for ble-bridge.yaml in the repo's config directory
        repo_root = Path(__file__).parent.parent.parent.parent
        config_path = repo_root / "config" / "ble-bridge.yaml"
    else:
        config_path = Path(config_path)

    with open(config_path, "r") as f:
        data = yaml.safe_load(f)

    # Parse MQTT config
    mqtt_data = data.get("mqtt", {})
    mqtt_config = MQTTConfig(
        broker=mqtt_data.get("broker", "localhost"),
        port=mqtt_data.get("port", 1883),
        client_id=mqtt_data.get("client_id", "ble-mqtt-bridge"),
    )

    # Parse BLE config
    ble_data = data.get("ble", {})
    ble_config = BLEConfig(
        scan_duration=ble_data.get("scan_duration", 10.0),
        scan_interval=ble_data.get("scan_interval", 300.0),
        reconnect_delay=ble_data.get("reconnect_delay", 5.0),
        connection_timeout=ble_data.get("connection_timeout", 20.0),
        device_pattern=ble_data.get("device_pattern", "ST-FLORIAN*"),
    )

    # Parse defaults first (needed for location_mapping fallback)
    defaults_data = data.get("defaults", {})
    defaults = DefaultsConfig(
        building=defaults_data.get("building", "shed"),
        system=defaults_data.get("system", "ambient"),
    )

    # Parse location mapping - each entry must have system and location
    raw_location_mapping = data.get("location_mapping", {})
    location_mapping: Dict[str, LocationConfig] = {}
    for suffix, value in raw_location_mapping.items():
        if not isinstance(value, dict):
            raise ValueError(f"location_mapping['{suffix}'] must be a dict with 'system' and 'location'")
        location_mapping[suffix] = LocationConfig(
            system=value["system"],
            location=value["location"],
        )

    # Parse characteristics
    chars_data = data.get("characteristics", {})
    characteristics = {}
    for name, char_data in chars_data.items():
        characteristics[name] = CharacteristicConfig(
            uuid=char_data["uuid"],
            unit=char_data.get("unit", ""),
            scale=char_data.get("scale", 1.0),
        )

    return Config(
        mqtt=mqtt_config,
        ble=ble_config,
        location_mapping=location_mapping,
        defaults=defaults,
        characteristics=characteristics,
        log_level=data.get("log_level", "INFO"),
    )
