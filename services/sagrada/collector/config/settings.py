from dataclasses import dataclass
from typing import List, Optional, Dict, Any
import yaml
import os
from pathlib import Path
from dotenv import load_dotenv

from sagrada.shared.database import DBConfig

@dataclass
class KasaDevice:
    alias: str
    location: str
    # Could add other common Kasa device properties here if needed
    # e.g., polling_interval: int = 60

@dataclass
class KasaConfig:
    devices: Dict[str, KasaDevice]
    
    def get_device(self, device_id: str) -> Optional[KasaDevice]:
        """Get a device by its ID."""
        return self.devices.get(device_id)


@dataclass
class MySQLQuery:
    query: str
    sensor_id: str
    metric: str
    metric_type: str
    value_column: str
    location: Optional[str] = None
    params: Optional[List[Any]] = None

@dataclass
class MySQLConfig:
    queries: List[MySQLQuery]

@dataclass
class SensorConfigs:
    kasa: Optional[KasaConfig] = None
    mysql: Optional[MySQLConfig] = None

@dataclass
class Config:
    db_config: DBConfig
    sensors: SensorConfigs
    collection_interval: int
    log_level: str = "INFO"

def get_environment() -> str:
    """Get the current environment name from .env or environment variables"""
    repo_root = Path(__file__).parent.parent.parent.parent.parent
    env_path = repo_root / "config" / ".env"
    load_dotenv(env_path)
    return os.getenv('CLIMATE_ENV', 'sagrada')

def load_config(path: Optional[str] = None) -> Config:
    """Load configuration from YAML file with environment variable support"""
    # Load environment variables from repo config directory
    repo_root = Path(__file__).parent.parent.parent.parent.parent
    env_path = repo_root / "config" / ".env"
    load_dotenv(env_path)

    env = get_environment()

    if path is None:
        # Look for config in the repo's config directory
        # repo_root/config/config-{env}.yaml
        repo_root = Path(__file__).parent.parent.parent.parent.parent
        config_path = repo_root / "config" / f"config-{env}.yaml"

        if not config_path.exists():
            # Fallback to current directory
            config_path = Path(f'config-{env}.yaml')

        if not config_path.exists():
            raise FileNotFoundError(
                f"No config file found at {config_path}. "
                f"Create a config-{env}.yaml file for this installation."
            )
        path = str(config_path)
    
    # Load main config
    with open(path) as f:
        config_data = yaml.safe_load(f)
    
    # Add database config from environment variables
    config_data['db_config'] = DBConfig.from_env()

    # Convert sensor configs
    sensor_data = config_data.get('sensors', {})
    
    # Initialize sensor configs
    sensor_configs = SensorConfigs()
    
    # Handle Kasa devices if present
    if 'kasa' in sensor_data:
        kasa_data = sensor_data['kasa']
        kasa_devices = {
            device_id: KasaDevice(**device_config)
            for device_id, device_config in kasa_data['devices'].items()
        }
        sensor_configs.kasa = KasaConfig(devices=kasa_devices)
    
    # Handle MySQL queries if present
    if 'mysql' in sensor_data:
        mysql_data = sensor_data['mysql']
        mysql_queries = [
            MySQLQuery(**query_config)
            for query_config in mysql_data['queries']
        ]
        sensor_configs.mysql = MySQLConfig(queries=mysql_queries)
    
    return Config(
        db_config=config_data['db_config'],
        sensors=sensor_configs,
        collection_interval=config_data['collection_interval'],
        log_level=config_data.get('log_level', 'INFO')
    )