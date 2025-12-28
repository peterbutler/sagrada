import asyncio
import logging
from typing import List, Dict
from datetime import datetime
import kasa

from sagrada.shared.models import Reading
from sagrada.collector.config.settings import KasaConfig
from .base import SensorReader

logger = logging.getLogger(__name__)

class KasaPlugReader(SensorReader):
    def __init__(self, config: KasaConfig):
        """
        Initialize KasaPlug reader
        Args:
            config: KasaConfig object containing device configurations
        """
        if not isinstance(config, KasaConfig):
            raise ValueError(f"Expected KasaConfig, got {type(config)}")
            
        self.device_configs = config.devices  # This is the Dict[str, KasaDevice]
        self.devices = {}
        self._loop = None
        logger.info(f"Initialized KasaPlugReader with {len(self.device_configs)} devices")

    def _get_loop(self):
        """Get or create an event loop"""
        if self._loop is None:
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
        return self._loop

    async def _init_devices(self):
        """Initialize connections to all configured devices"""
        if not self.devices:
            devices = await kasa.Discover.discover()
            for device_id, device_config in self.device_configs.items():
                for addr, dev in devices.items():
                    if dev.alias == device_config.alias:
                        device = kasa.SmartPlug(addr)
                        self.devices[device_id] = (device, device_config.location)
                        logger.info(f"Found {device_config.alias} at {addr}")

    async def _get_readings(self) -> List[Reading]:
        """Get readings from all devices"""
        await self._init_devices()
        readings = []
        now = datetime.now()

        for device_id, (device, location) in self.devices.items():
            try:
                await device.update()
                
                # Power reading
                readings.append(Reading(
                    timestamp=now,
                    source_type='kasa',
                    sensor_id=device.mac,
                    metric='power',
                    metric_type='numeric',
                    value=str(device.emeter_realtime.power),
                    location=location
                ))
                
                # Voltage reading
                readings.append(Reading(
                    timestamp=now,
                    source_type='kasa',
                    sensor_id=device.mac,
                    metric='voltage',
                    metric_type='numeric',
                    value=str(device.emeter_realtime.voltage),
                    location=location
                ))
                
                # Current reading
                readings.append(Reading(
                    timestamp=now,
                    source_type='kasa',
                    sensor_id=device.mac,
                    metric='current',
                    metric_type='numeric',
                    value=str(device.emeter_realtime.current),
                    location=location
                ))
                
                # State reading
                readings.append(Reading(
                    timestamp=now,
                    source_type='kasa',
                    sensor_id=device.mac,
                    metric='state',
                    metric_type='state',
                    value=str(device.is_on).lower(),
                    location=location
                ))
                
            except Exception as e:
                logger.error(f"Failed to read Kasa plug {device_id}: {e}")

        return readings

    def get_readings(self) -> List[Reading]:
        """Synchronously get readings from all devices"""
        loop = self._get_loop()
        return loop.run_until_complete(self._get_readings())

    def check_health(self) -> bool:
        """Check if we can connect to at least one device"""
        try:
            loop = self._get_loop()
            devices = loop.run_until_complete(kasa.Discover.discover())
            return len(devices) > 0
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
