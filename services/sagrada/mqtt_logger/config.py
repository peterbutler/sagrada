"""Configuration loading for MQTT Logger service."""

import os
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml
from dotenv import load_dotenv

from sagrada.shared.database import DBConfig
from sagrada.shared.mqtt import MQTTConfig

logger = logging.getLogger(__name__)


@dataclass
class Subscription:
    """MQTT subscription pattern configuration."""
    pattern: str
    type: str  # e.g., "temperature"


@dataclass
class Config:
    """Main configuration container."""
    mqtt: MQTTConfig
    db: DBConfig
    subscriptions: List[Subscription]
    log_level: str = "INFO"


def load_config(config_path: Optional[str] = None) -> Config:
    """Load configuration from YAML file and environment variables.

    Args:
        config_path: Path to config.yaml. If not provided, looks for config.yaml
                    in the mqtt-logger directory.

    Returns:
        Config object with all settings loaded.
    """
    # Load .env file for database credentials
    load_dotenv()

    # Determine config file path
    if config_path is None:
        # Look for mqtt-logger.yaml in the repo's config directory
        repo_root = Path(__file__).parent.parent.parent.parent
        config_path = repo_root / "config" / "mqtt-logger.yaml"
    else:
        config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    # Load YAML config
    with open(config_path) as f:
        config_data = yaml.safe_load(f)

    # Build MQTT config
    mqtt_data = config_data.get("mqtt", {})
    mqtt_config = MQTTConfig.from_dict(mqtt_data)

    # Build DB config from environment variables
    db_config = DBConfig.from_env()

    # Build subscriptions
    subscriptions = []
    for sub_data in config_data.get("subscriptions", []):
        subscriptions.append(Subscription(
            pattern=sub_data["pattern"],
            type=sub_data["type"],
        ))

    # Get log level
    log_level = config_data.get("log_level", "INFO")

    return Config(
        mqtt=mqtt_config,
        db=db_config,
        subscriptions=subscriptions,
        log_level=log_level,
    )
