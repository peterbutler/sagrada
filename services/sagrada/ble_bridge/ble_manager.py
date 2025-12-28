"""BLE device manager with notification support."""

import asyncio
import fnmatch
import logging
import struct
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Set

from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice

from .config import BLEConfig, CharacteristicConfig, LocationConfig

logger = logging.getLogger(__name__)


@dataclass
class DiscoveredDevice:
    """A discovered BLE device."""
    name: str
    address: str
    rssi: int
    location_config: Optional[LocationConfig] = None


class BLEManager:
    """Manages BLE device connections and notifications."""

    def __init__(
        self,
        config: BLEConfig,
        characteristics: Dict[str, CharacteristicConfig],
        location_mapping: Dict[str, LocationConfig],
        on_reading_callback: Callable[[str, str, str, str, float, str], None],
    ):
        """Initialize BLE manager.

        Args:
            config: BLE configuration.
            characteristics: Dictionary of characteristic configs.
            location_mapping: Mapping from device suffix to LocationConfig.
            on_reading_callback: Callback for readings.
                Args: (device_name, metric_name, system, location, value, unit)
        """
        self.config = config
        self.characteristics = characteristics
        self.location_mapping = location_mapping
        self.on_reading_callback = on_reading_callback

        self._clients: Dict[str, BleakClient] = {}
        self._devices: Dict[str, DiscoveredDevice] = {}
        self._running = False
        self._connection_tasks: Dict[str, asyncio.Task] = {}

    def _get_location_config(self, device_name: str) -> Optional[LocationConfig]:
        """Get location config for a device based on its name suffix.

        Args:
            device_name: Device name like "ST-FLORIAN-2".

        Returns:
            LocationConfig or None if not mapped.
        """
        # Extract suffix (everything after last hyphen)
        parts = device_name.split("-")
        if len(parts) > 1:
            suffix = parts[-1]
            return self.location_mapping.get(suffix)
        return None

    def _parse_characteristic_value(
        self,
        char_config: CharacteristicConfig,
        data: bytes,
    ) -> Optional[float]:
        """Parse raw characteristic data to a float value.

        Args:
            char_config: Characteristic configuration.
            data: Raw bytes from BLE.

        Returns:
            Parsed float value, or None on error.
        """
        try:
            # Standard BLE Environmental Sensing uses int16 LE for temp/humidity
            if len(data) == 2:
                raw_value = struct.unpack("<h", data)[0]
                return raw_value * char_config.scale
            elif len(data) == 1:
                # uint8 for things like battery
                raw_value = data[0]
                return raw_value * char_config.scale
            else:
                logger.warning(f"Unexpected data length: {len(data)} bytes")
                return None
        except Exception as e:
            logger.error(f"Error parsing characteristic data: {e}")
            return None

    def _make_notification_handler(
        self,
        device_name: str,
        metric_name: str,
        char_config: CharacteristicConfig,
        location_config: LocationConfig,
    ):
        """Create a notification handler for a specific characteristic.

        Args:
            device_name: Name of the device.
            metric_name: Name of the metric (e.g., "temperature").
            char_config: Characteristic configuration.
            location_config: LocationConfig with system and location.

        Returns:
            Notification handler function.
        """
        def handler(sender, data: bytearray):
            value = self._parse_characteristic_value(char_config, bytes(data))
            if value is not None:
                logger.debug(
                    f"Notification from {device_name}: {metric_name}={value}{char_config.unit}"
                )
                self.on_reading_callback(
                    device_name, metric_name, location_config.system,
                    location_config.location, value, char_config.unit
                )

        return handler

    async def scan_for_devices(self) -> List[DiscoveredDevice]:
        """Scan for BLE devices matching the configured pattern.

        Returns:
            List of discovered devices.
        """
        logger.info(
            f"Scanning for devices matching '{self.config.device_pattern}' "
            f"for {self.config.scan_duration}s..."
        )

        scanner = BleakScanner()
        await scanner.start()
        await asyncio.sleep(self.config.scan_duration)
        await scanner.stop()

        # Get devices with advertisement data (includes rssi)
        devices_and_ads = scanner.discovered_devices_and_advertisement_data

        discovered = []
        for address, (device, adv_data) in devices_and_ads.items():
            if device.name and fnmatch.fnmatch(device.name, self.config.device_pattern):
                location_config = self._get_location_config(device.name)
                rssi = adv_data.rssi if adv_data else -100
                disc_device = DiscoveredDevice(
                    name=device.name,
                    address=device.address,
                    rssi=rssi,
                    location_config=location_config,
                )
                discovered.append(disc_device)
                loc_str = f"{location_config.system}/{location_config.location}" if location_config else "unknown"
                logger.info(
                    f"Found device: {device.name} ({device.address}) "
                    f"RSSI: {rssi}, Location: {loc_str}"
                )

        logger.info(f"Scan complete. Found {len(discovered)} matching devices.")
        return discovered

    async def _connect_and_subscribe(self, device: DiscoveredDevice):
        """Connect to a device, subscribe to notifications, and poll periodically.

        Args:
            device: The device to connect to.
        """
        if not device.location_config:
            logger.warning(
                f"Skipping {device.name}: no location mapping for this device"
            )
            return

        while self._running:
            try:
                logger.info(f"Connecting to {device.name} ({device.address})...")
                client = BleakClient(
                    device.address,
                    timeout=self.config.connection_timeout,
                )
                await client.connect()

                if not client.is_connected:
                    raise Exception("Connection failed")

                logger.info(f"Connected to {device.name}")
                self._clients[device.address] = client

                # Subscribe to all configured characteristics
                for metric_name, char_config in self.characteristics.items():
                    try:
                        handler = self._make_notification_handler(
                            device.name, metric_name, char_config, device.location_config
                        )
                        await client.start_notify(char_config.uuid, handler)
                        logger.info(
                            f"Subscribed to {metric_name} notifications on {device.name}"
                        )
                    except Exception as e:
                        logger.warning(
                            f"Could not subscribe to {metric_name} on {device.name}: {e}"
                        )

                # Poll periodically while connected (in case notifications are infrequent)
                poll_interval = 30.0  # seconds

                # Small delay before first poll to let device settle
                await asyncio.sleep(2.0)

                while self._running and client.is_connected:
                    # Read all characteristics
                    for metric_name, char_config in self.characteristics.items():
                        try:
                            data = await client.read_gatt_char(char_config.uuid)
                            if len(data) == 0:
                                logger.warning(f"Empty data from {device.name}/{metric_name}")
                                continue
                            value = self._parse_characteristic_value(char_config, data)
                            if value is not None:
                                logger.info(
                                    f"Poll {device.name}: {metric_name}={value:.2f}{char_config.unit}"
                                )
                                self.on_reading_callback(
                                    device.name, metric_name, device.location_config.system,
                                    device.location_config.location, value, char_config.unit
                                )
                        except Exception as e:
                            logger.warning(f"Error reading {metric_name} from {device.name}: {e}")

                    await asyncio.sleep(poll_interval)

                logger.warning(f"Lost connection to {device.name}")

            except Exception as e:
                logger.warning(f"Error connecting to {device.name}: {e}")

            # Clean up
            if device.address in self._clients:
                try:
                    await self._clients[device.address].disconnect()
                except Exception:
                    pass
                del self._clients[device.address]

            # Wait before reconnecting
            if self._running:
                logger.info(
                    f"Reconnecting to {device.name} in {self.config.reconnect_delay}s..."
                )
                await asyncio.sleep(self.config.reconnect_delay)

    async def start(self):
        """Start the BLE manager - scan and connect to devices."""
        self._running = True

        # Initial scan
        devices = await self.scan_for_devices()
        self._devices = {d.address: d for d in devices}

        # Start connection tasks for each device
        for device in devices:
            if device.location_config:  # Only connect to devices with known locations
                task = asyncio.create_task(self._connect_and_subscribe(device))
                self._connection_tasks[device.address] = task
            else:
                logger.warning(
                    f"Device {device.name} has no location mapping - skipping"
                )

        # Periodic rescan for new devices
        asyncio.create_task(self._periodic_scan())

    async def _periodic_scan(self):
        """Periodically scan for new devices."""
        while self._running:
            await asyncio.sleep(self.config.scan_interval)

            if not self._running:
                break

            logger.info("Starting periodic device scan...")
            devices = await self.scan_for_devices()

            # Check for new devices
            for device in devices:
                if device.address not in self._devices and device.location_config:
                    logger.info(f"New device found: {device.name}")
                    self._devices[device.address] = device
                    task = asyncio.create_task(self._connect_and_subscribe(device))
                    self._connection_tasks[device.address] = task

    async def stop(self):
        """Stop the BLE manager and disconnect all devices."""
        self._running = False

        # Cancel all connection tasks
        for task in self._connection_tasks.values():
            task.cancel()

        # Disconnect all clients
        for address, client in list(self._clients.items()):
            try:
                await client.disconnect()
                logger.info(f"Disconnected from {address}")
            except Exception as e:
                logger.warning(f"Error disconnecting from {address}: {e}")

        self._clients.clear()
        self._connection_tasks.clear()

    @property
    def connected_devices(self) -> List[str]:
        """Get list of currently connected device addresses."""
        return [addr for addr, client in self._clients.items() if client.is_connected]
