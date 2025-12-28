import asyncio
import logging
import time
from typing import List, Dict
from datetime import datetime
from bleak import BleakScanner, BleakClient

from sagrada.shared.models import Reading
from sagrada.collector.config.settings import BLEConfig
from .base import SensorReader

logger = logging.getLogger(__name__)

class BLEDevice:
    CHARACTERISTICS = {
        "temperature": "cba1d466-344c-4be3-ab3f-189f80dd7518",
        "humidity": "cba1d466-344c-4be3-ab3f-189f80dd7519",
        "status": "cba1d466-344c-4be3-ab3f-189f80dd7520",
    }

    def __init__(self, name: str, address: str, rssi: int):
        self.name = name
        self.address = address
        self.rssi = rssi
        self._client = None

    async def read_values(self) -> Dict:
        """Read all sensor values from the device"""
        if not self._client:
            self._client = BleakClient(self.address, timeout=20.0)
            await self._client.connect()
            logger.debug(f"Connected to {self.name}")

        readings = {}
        try:
            for sensor, uuid in self.CHARACTERISTICS.items():
                try:
                    value = await self._client.read_gatt_char(uuid)
                    readings[sensor] = value.decode('utf-8').split(':')[1]
                    logger.debug(f"Read {sensor} from {self.name}: {readings[sensor]}")
                except Exception as e:
                    logger.error(f"Error reading {sensor} from {self.name}: {e}")
                    readings[sensor] = None
            readings['rssi'] = self.rssi
            return readings
        except Exception as e:
            logger.error(f"Error communicating with {self.name}: {e}")
            await self.disconnect()
            return {}

    async def disconnect(self):
        """Disconnect from the device"""
        if self._client:
            await self._client.disconnect()
            self._client = None
            logger.debug(f"Disconnected from {self.name}")

class BLEReader(SensorReader):
    def __init__(self, config: BLEConfig):
        """
        Initialize BLE reader with typed configuration
        Args:
            config: BLEConfig object containing devices and scan settings
        """
        self.device_configs = config.devices
        self._active_devices = {}
        self._scanning = False
        self._loop = asyncio.new_event_loop()
        self.scan_duration = config.scan_duration
        self.scan_interval = config.scan_interval
        self._last_scan_time = 0
        # Create the MAC address lookup once at initialization
        self._mac_device_map = {
            device.mac_address.upper(): (name, device)
            for name, device in self.device_configs.items()
        }
        logger.info(f"Initialized BLEReader with {len(config.devices)} devices")

    async def _should_scan(self) -> bool:
        """Check if we should perform a new scan based on interval"""
        logger.debug(f"Checking if we should scan, {self._active_devices}")
        now = time.time()
        if not self._active_devices:
            logger.debug("No active connections, initiating scan")
            return True
        
        time_since_scan = now - self._last_scan_time
        should_scan = time_since_scan >= self.scan_interval
        
        if should_scan:
            logger.debug(f"Scan interval elapsed ({time_since_scan:.1f}s), initiating new scan")
        else:
            logger.debug(f"Using existing connections, next scan in {self.scan_interval - time_since_scan:.1f}s")
        
        return should_scan

    async def _scan_for_devices(self):
        """Scan for configured BLE devices"""
        if self._scanning:
            logger.debug("Scan already in progress")
            return

        try:
            self._scanning = True
            logger.debug(f"Starting scan for {len(self.device_configs)} configured devices")
            
            scanner = BleakScanner()
            devices = await scanner.discover(timeout=self.scan_duration)
            
            # Process discovered devices
            for device in devices:
                device_addr = device.address.upper()
                if device_addr in self._mac_device_map:
                    name, device_info = self._mac_device_map[device_addr]
                    logger.info(f"Found {name} (RSSI: {device.rssi})")
                    self._active_devices[device_addr] = BLEDevice(
                        name=name,
                        address=device_addr,
                        rssi=device.rssi
                    )
            
        finally:
            self._scanning = False
            logger.debug(f"Scan completed, found {len(self._active_devices)} devices")

    async def _get_readings(self) -> List[Reading]:
        """Get readings from all connected devices"""
        logger.debug(f"BLE Getting readings, {self._active_devices}")
        if await self._should_scan():
            await self._scan_for_devices()
            self._last_scan_time = time.time()
        
        readings = []
        timestamp = datetime.now()

        for device in self._active_devices.values():
            values = await device.read_values()
            _, device_config = self._mac_device_map.get(device.address.upper(), (None, None))
            location = device_config.location if device_config else None
            
            for sensor_type, value in values.items():
                if value is not None:
                    if sensor_type == 'temperature':
                        reading_type = 'temperature_f'
                        try:
                            celsius = float(value)
                            value = str(round((celsius * 9/5) + 32, 1))
                        except ValueError as e:
                            logger.error(f"Failed to convert temperature value '{value}': {e}")
                            continue
                    else:
                        reading_type = sensor_type

                    readings.append(Reading(
                        timestamp=timestamp,
                        source_type='ble',
                        sensor_id=device.name,
                        metric=reading_type,
                        metric_type='numeric' if reading_type != 'status' else 'state',
                        value=value,
                        location=location
                    ))

        logger.info(f"Collected {len(readings)} readings from {len(self._active_devices)} devices")
        return readings

    def get_readings(self) -> List[Reading]:
        """Get readings synchronously"""
        return self._loop.run_until_complete(self._get_readings())

    async def _cleanup(self):
        """Clean up connections and scanner"""
        if self._scanner:
            await self._scanner.stop()
        for device in self._active_devices.values():
            await device.disconnect()

    def __del__(self):
        """Cleanup when object is destroyed"""
        self._loop.run_until_complete(self._cleanup())
        self._loop.close()

    def check_health(self) -> bool:
        """Check if we can scan for BLE devices"""
        try:
            # Try to perform a quick scan
            async def quick_scan():
                scanner = BleakScanner(loop=self._loop)
                devices = await scanner.discover(timeout=5.0)
                return len(devices) > 0

            return self._loop.run_until_complete(quick_scan())
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False 