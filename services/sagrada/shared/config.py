"""Configuration loading utilities."""

import os
from pathlib import Path
from typing import Optional, Union

import yaml
from dotenv import load_dotenv


def get_environment() -> str:
    """Get the current environment name.

    Returns:
        Environment name from SAGRADA_ENV or CLIMATE_ENV, defaults to 'sagrada'.
    """
    return os.getenv("SAGRADA_ENV") or os.getenv("CLIMATE_ENV", "sagrada")


def get_config_path(
    config_name: Optional[str] = None,
    config_dir: Optional[Union[str, Path]] = None,
) -> Path:
    """Get path to a configuration file.

    Args:
        config_name: Name of config file (without path). If None, uses
            config-{environment}.yaml based on SAGRADA_ENV.
        config_dir: Directory containing config files. If None, uses
            the 'config' directory at the repo root.

    Returns:
        Path to the configuration file.
    """
    if config_dir is None:
        # Default to repo_root/config/
        # This assumes we're installed in repo_root/services/
        package_dir = Path(__file__).parent.parent.parent.parent
        config_dir = package_dir / "config"

    config_dir = Path(config_dir)

    if config_name is None:
        env = get_environment()
        config_name = f"config-{env}.yaml"

    return config_dir / config_name


def load_yaml_config(
    config_path: Optional[Union[str, Path]] = None,
    load_env: bool = True,
) -> dict:
    """Load YAML configuration file.

    Args:
        config_path: Path to config file. If None, uses get_config_path().
        load_env: Whether to load .env file first.

    Returns:
        Configuration dictionary.

    Raises:
        FileNotFoundError: If config file doesn't exist.
        yaml.YAMLError: If config file is invalid YAML.
    """
    if load_env:
        # Try to load .env from config directory or repo root
        load_dotenv()

    if config_path is None:
        config_path = get_config_path()
    else:
        config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, "r") as f:
        return yaml.safe_load(f) or {}


def get_log_level(config: dict) -> str:
    """Extract log level from config, with sensible default.

    Args:
        config: Configuration dictionary.

    Returns:
        Log level string (e.g., 'INFO', 'DEBUG').
    """
    return config.get("log_level", "INFO").upper()
