from typing import List
import logging
import aiohttp
import asyncio
from datetime import datetime
from ..core.base import SensorReader
from ..core.models import Reading

logger = logging.getLogger(__name__)

class SmartPlugReader(SensorReader):
    def __init__(self, device_ips: List[str]):
        self.device_ips = device_ips
        logger.info(f"Initialized SmartPlugReader with {len(device_ips)} devices")
    
    async def _get_plug_data(self, ip: str) -> dict:
        # Implementation depends on your smart plug API
        # This is a placeholder
        async with aiohttp.ClientSession() as session:
            async with session.get(f"http://{ip}/status") as response:
                return await response.json()
    
    def get_readings(self) -> List[Reading]:
        readings = []
        now = datetime.now()
        
        # Run all API calls concurrently
        loop = asyncio.get_event_loop()
        plug_data = loop.run_until_complete(asyncio.gather(
            *[self._get_plug_data(ip) for ip in self.device_ips],
            return_exceptions=True
        ))
        
        for ip, data in zip(self.device_ips, plug_data):
            try:
                if isinstance(data, Exception):
                    raise data
                
                readings.extend([
                    Reading(
                        timestamp=now,
                        sensor_id=f"plug_{ip}_power",
                        type='power',
                        value=str(data['power_mw'] / 1000.0)  # convert to watts
                    ),
                    Reading(
                        timestamp=now,
                        sensor_id=f"plug_{ip}_state",
                        type='state',
                        value=str(data['state']).lower()
                    )
                ])
            except Exception as e:
                logger.error(f"Failed to read smart plug {ip}: {e}")
        
        return readings
    
    def check_health(self) -> bool:
        # Consider healthy if we can reach at least one plug
        loop = asyncio.get_event_loop()
        results = loop.run_until_complete(asyncio.gather(
            *[self._get_plug_data(ip) for ip in self.device_ips],
            return_exceptions=True
        ))
        return any(not isinstance(r, Exception) for r in results)