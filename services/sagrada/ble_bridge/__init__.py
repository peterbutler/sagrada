"""BLE to MQTT Bridge - publishes BLE sensor data to MQTT."""

__version__ = "0.1.0"

from .bridge_service import BLEMQTTBridge


def main():
    """Entry point for BLE-MQTT bridge service."""
    from .config import load_config
    from sagrada.shared.logging import setup_logging

    config = load_config()
    setup_logging(config.log_level)

    from .bridge_service import run_bridge
    run_bridge()


__all__ = ["BLEMQTTBridge", "main"]
