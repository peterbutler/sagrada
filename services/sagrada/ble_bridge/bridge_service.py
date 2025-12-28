"""BLE to MQTT Bridge Service - main orchestrator."""

import asyncio
import logging
import signal
import sys
from typing import Optional

from .ble_manager import BLEManager
from .config import Config, load_config
from .mqtt_publisher import MQTTPublisher

logger = logging.getLogger(__name__)


class BLEMQTTBridge:
    """Main service that bridges BLE sensors to MQTT."""

    def __init__(self, config: Config):
        """Initialize the bridge service.

        Args:
            config: Configuration object.
        """
        self.config = config
        self.mqtt_publisher: Optional[MQTTPublisher] = None
        self.ble_manager: Optional[BLEManager] = None
        self._running = False

    def _on_sensor_reading(
        self,
        device_name: str,
        metric_name: str,
        system: str,
        location: str,
        value: float,
        unit: str,
    ):
        """Handle a sensor reading from BLE.

        Args:
            device_name: Name of the BLE device.
            metric_name: Name of the metric (e.g., "temperature").
            system: System for MQTT topic (e.g., "ambient", "outside").
            location: Location for MQTT topic (e.g., "workbench", "main").
            value: The sensor value.
            unit: Unit of measurement.
        """
        if self.mqtt_publisher and self.mqtt_publisher.is_connected:
            self.mqtt_publisher.publish_reading(
                building=self.config.defaults.building,
                system=system,
                location=location,
                metric=metric_name,
                value=value,
                unit=unit,
                sensor_id=device_name,
            )
        else:
            logger.warning(
                f"MQTT not connected, dropping reading: {device_name}/{metric_name}={value}"
            )

    def _setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            signame = signal.Signals(signum).name
            logger.info(f"Received {signame}, shutting down...")
            self._running = False

        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)

    async def run(self):
        """Run the bridge service (blocking)."""
        self._setup_signal_handlers()
        self._running = True

        # Initialize MQTT publisher
        self.mqtt_publisher = MQTTPublisher(self.config.mqtt)
        if not self.mqtt_publisher.connect():
            logger.error("Failed to connect to MQTT broker")
            return

        # Initialize BLE manager
        self.ble_manager = BLEManager(
            config=self.config.ble,
            characteristics=self.config.characteristics,
            location_mapping=self.config.location_mapping,
            on_reading_callback=self._on_sensor_reading,
        )

        # Start BLE manager
        await self.ble_manager.start()

        # Main loop
        logger.info("BLE-MQTT Bridge is running. Press Ctrl+C to stop.")
        try:
            while self._running:
                await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            pass

        # Shutdown
        logger.info("Shutting down BLE-MQTT Bridge...")

        if self.ble_manager:
            await self.ble_manager.stop()

        if self.mqtt_publisher:
            self.mqtt_publisher.disconnect()

        logger.info("BLE-MQTT Bridge stopped.")


def run_bridge(config_path: Optional[str] = None):
    """Run the BLE-MQTT bridge service.

    Args:
        config_path: Optional path to config file.
    """
    # Load configuration
    config = load_config(config_path)

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Reduce verbosity of some loggers
    logging.getLogger("bleak").setLevel(logging.WARNING)

    logger.info("Starting BLE-MQTT Bridge...")

    # Create and run bridge
    bridge = BLEMQTTBridge(config)

    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Error: {e}")
        sys.exit(1)
