"""MQTT Logger Service - Subscribes to MQTT topics and logs readings to MySQL."""

__version__ = "0.1.0"

from .logger_service import MQTTLoggerService


def main():
    """Entry point for MQTT logger service."""
    from .config import load_config
    from sagrada.shared.logging import setup_logging

    config = load_config()
    setup_logging(config.log_level)

    service = MQTTLoggerService(config)
    service.run()


__all__ = ["MQTTLoggerService", "main"]
