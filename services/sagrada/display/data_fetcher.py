"""
Data Fetcher for Display Monitor
Handles data retrieval with graceful error handling and caching.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from sagrada.shared.database import DBConfig, ReadingsStorage
from sagrada.shared.models import Reading

logger = logging.getLogger(__name__)

@dataclass
class SensorStatus:
    """Status information for a sensor"""
    location: str
    value: Optional[float]
    last_update: Optional[datetime]
    is_online: bool
    status_text: str  # "72.3°F" or "OFFLINE (2m ago)"
    rate_of_change: Optional[float] = None  # °F/hour

@dataclass
class ComponentState:
    """State information for a heating component"""
    name: str
    is_on: bool
    last_toggle: Optional[datetime]
    status_text: str  # "ON (2m ago)" or "OFF (15m ago)"

@dataclass
class SystemStatus:
    """Overall system status"""
    database_connected: bool
    sensors: Dict[str, SensorStatus]
    components: Dict[str, ComponentState]
    target_temp: Optional[float]
    control_mode: str
    control_reason: str
    alerts: List[str]

class DataFetcher:
    """Fetches and caches system data with graceful error handling"""
    
    # System locations we want to monitor (format: {system}/{location})
    TEMPERATURE_LOCATIONS = [
        'heating/tank', 'ambient/desk', 'heating/floor', 'heating/heater-input',
        'heating/heater-output', 'heating/pre-tank', 'outside/main',
        'ambient/workbench', 'ambient/door', 'shed'
    ]
    
    COMPONENT_LOCATIONS = ['heater', 'pump', 'fan']
    
    # Temperature thresholds for alerts
    FREEZE_WARNING_TEMP = 40.0
    CRITICAL_TEMP_DIFF = 5.0
    
    def __init__(self, db_config: DBConfig):
        self.db_config = db_config
        self.storage = ReadingsStorage(db_config)
        self.last_successful_fetch = None
        self.cached_status = None
        
    def get_system_status(self) -> SystemStatus:
        """Get current system status with error handling"""
        try:
            return self._fetch_current_status()
        except Exception as e:
            logger.error(f"Failed to fetch system status: {e}")
            return self._get_fallback_status(str(e))
    
    def _fetch_current_status(self) -> SystemStatus:
        """Fetch current status from database"""
        # Test database connection
        try:
            self.storage._get_connection().close()
            db_connected = True
        except Exception:
            db_connected = False
            raise Exception("Database connection failed")
        
        # Fetch temperature readings
        sensors = self._fetch_sensor_status()
        
        # Fetch component states
        components = self._fetch_component_status()
        
        # Get target temperature
        target_temp = self._fetch_target_temperature()
        
        # Determine control mode and reasoning
        control_mode, control_reason = self._determine_control_logic(sensors, target_temp)
        
        # Generate alerts
        alerts = self._generate_alerts(sensors, components)
        
        status = SystemStatus(
            database_connected=db_connected,
            sensors=sensors,
            components=components,
            target_temp=target_temp,
            control_mode=control_mode,
            control_reason=control_reason,
            alerts=alerts
        )
        
        # Cache successful fetch
        self.last_successful_fetch = datetime.now()
        self.cached_status = status
        
        return status
    
    def _calculate_temperature_rate_of_change(self, location: str, current_value: float, current_time: datetime) -> Optional[float]:
        """Calculate rate of change for temperature in °F/hour"""
        try:
            # Get historical data for the last 15 minutes
            historical_readings = self.storage.get_historical_readings(
                locations=[location],
                metrics=['temperature_f'],
                minutes_back=15
            )
            
            if len(historical_readings) < 2:
                return None
                
            # Filter to valid numeric readings and sort by timestamp
            valid_readings = []
            for reading in historical_readings:
                if (reading.value and reading.value.lower() != 'null' and 
                    reading.timestamp and reading.timestamp != current_time):
                    try:
                        temp_value = float(reading.value)
                        valid_readings.append((reading.timestamp, temp_value))
                    except (ValueError, TypeError):
                        continue
            
            if len(valid_readings) < 1:
                return None
                
            # Sort by timestamp (oldest first for calculation)
            valid_readings.sort(key=lambda x: x[0])
            
            # Use the oldest available reading for rate calculation
            oldest_time, oldest_temp = valid_readings[0]
            
            # Calculate time difference in hours
            time_diff = (current_time - oldest_time).total_seconds() / 3600.0
            
            if time_diff <= 0:
                return None
                
            # Calculate rate of change in °F/hour
            temp_diff = current_value - oldest_temp
            rate_of_change = temp_diff / time_diff
            
            return rate_of_change
            
        except Exception as e:
            logger.error(f"Failed to calculate rate of change for {location}: {e}")
            return None
    
    def _fetch_sensor_status(self) -> Dict[str, SensorStatus]:
        """Fetch current temperature sensor readings"""
        sensors = {}
        
        try:
            # Get recent readings for all temperature locations
            readings = self.storage.get_current_readings(
                locations=self.TEMPERATURE_LOCATIONS,
                metrics=['temperature_f']
            )
            
            # Convert to sensor status objects
            readings_by_location = {r.location: r for r in readings}
            
            for location in self.TEMPERATURE_LOCATIONS:
                reading = readings_by_location.get(location)
                
                if reading and reading.value and reading.value.lower() != 'null':
                    try:
                        temp_value = float(reading.value)
                        is_online = self._is_reading_recent(reading.timestamp)
                        
                        # Calculate rate of change
                        rate_of_change = None
                        if is_online and reading.timestamp:
                            rate_of_change = self._calculate_temperature_rate_of_change(
                                location, temp_value, reading.timestamp
                            )
                        
                        if is_online:
                            status_text = f"{temp_value:.1f}°F"
                        else:
                            age_text = self._format_time_ago(reading.timestamp)
                            status_text = f"STALE ({age_text})"
                        
                        sensors[location] = SensorStatus(
                            location=location,
                            value=temp_value,
                            last_update=reading.timestamp,
                            is_online=is_online,
                            status_text=status_text,
                            rate_of_change=rate_of_change
                        )
                    except (ValueError, TypeError):
                        sensors[location] = self._create_offline_sensor(location, "Invalid data")
                else:
                    sensors[location] = self._create_offline_sensor(location, "No data")
                    
        except Exception as e:
            logger.error(f"Failed to fetch sensor readings: {e}")
            # Create offline status for all sensors
            for location in self.TEMPERATURE_LOCATIONS:
                sensors[location] = self._create_offline_sensor(location, "Fetch failed")
        
        return sensors
    
    def _fetch_component_status(self) -> Dict[str, ComponentState]:
        """Fetch heating component states"""
        components = {}
        
        try:
            # Get recent component state readings
            readings = self.storage.get_current_readings(
                locations=self.COMPONENT_LOCATIONS,
                metrics=['control_state_heater', 'control_state_pump', 'control_state_fan']
            )
            
            # Group readings by component
            component_readings = {}
            for reading in readings:
                # Extract component name from metric (e.g., 'control_state_pump' -> 'pump')
                if 'control_state_' in reading.metric:
                    component = reading.metric.replace('control_state_', '')
                    if component in self.COMPONENT_LOCATIONS:
                        component_readings[component] = reading
            
            # Create component status objects
            for component in self.COMPONENT_LOCATIONS:
                reading = component_readings.get(component)
                
                if reading:
                    is_on = reading.value and reading.value.lower() == 'on'
                    age_text = self._format_time_ago(reading.timestamp)
                    status_text = f"{'ON' if is_on else 'OFF'} ({age_text})"
                    
                    components[component] = ComponentState(
                        name=component,
                        is_on=is_on,
                        last_toggle=reading.timestamp,
                        status_text=status_text
                    )
                else:
                    components[component] = ComponentState(
                        name=component,
                        is_on=False,
                        last_toggle=None,
                        status_text="UNKNOWN"
                    )
                    
        except Exception as e:
            logger.error(f"Failed to fetch component status: {e}")
            for component in self.COMPONENT_LOCATIONS:
                components[component] = ComponentState(
                    name=component,
                    is_on=False,
                    last_toggle=None,
                    status_text="ERROR"
                )
        
        return components
    
    def _fetch_target_temperature(self) -> Optional[float]:
        """Fetch target temperature from thermostat"""
        try:
            readings = self.storage.get_current_readings(
                locations=['shed'],
                metrics=['target_temp_f']
            )
            
            if readings and readings[0].value and readings[0].value.lower() != 'null':
                return float(readings[0].value)
        except Exception as e:
            logger.error(f"Failed to fetch target temperature: {e}")
        
        return None
    
    def _determine_control_logic(self, sensors: Dict[str, SensorStatus], target_temp: Optional[float]) -> Tuple[str, str]:
        """Determine current control mode and reasoning"""
        desk_sensor = sensors.get('desk')
        tank_sensor = sensors.get('tank')
        
        if not target_temp:
            return "No Target", "Target temperature not set"
        
        if not desk_sensor or not desk_sensor.is_online or desk_sensor.value is None:
            return "Sensor Error", "Desk temperature sensor offline"
        
        if not tank_sensor or not tank_sensor.is_online or tank_sensor.value is None:
            return "Sensor Error", "Tank temperature sensor offline"
        
        desk_temp = desk_sensor.value
        tank_temp = tank_sensor.value
        
        # Determine control mode based on temperatures
        if desk_temp < target_temp - 1.0:  # Below target with deadband
            if tank_temp >= 130.0:  # Tank has heat to give
                return "Comfort Heat", f"Room {desk_temp:.1f}°F below target {target_temp:.1f}°F"
            else:
                return "Tank Heating", f"Tank {tank_temp:.1f}°F too low for heating"
        elif any(s.value and s.value < self.FREEZE_WARNING_TEMP for s in sensors.values() if s.is_online):
            return "Freeze Prevention", "Temperatures approaching freeze threshold"
        else:
            return "Maintaining", f"Room {desk_temp:.1f}°F at target {target_temp:.1f}°F"
    
    def _generate_alerts(self, sensors: Dict[str, SensorStatus], components: Dict[str, ComponentState]) -> List[str]:
        """Generate system alerts"""
        alerts = []
        
        # Check for offline sensors
        offline_sensors = [name for name, sensor in sensors.items() if not sensor.is_online]
        if offline_sensors:
            alerts.append(f"⚠ Offline sensors: {', '.join(offline_sensors)}")
        
        # Check for freeze warnings
        freeze_sensors = [
            name for name, sensor in sensors.items() 
            if sensor.is_online and sensor.value and sensor.value < self.FREEZE_WARNING_TEMP
        ]
        if freeze_sensors:
            alerts.append(f"🥶 Freeze risk: {', '.join(freeze_sensors)}")
        
        # Check tank temperature
        tank_sensor = sensors.get('tank')
        if tank_sensor and tank_sensor.is_online and tank_sensor.value:
            if tank_sensor.value < 90.0:
                alerts.append(f"❄ Tank critical: {tank_sensor.value:.1f}°F")
            elif tank_sensor.value < 120.0:
                alerts.append(f"⚠ Tank low: {tank_sensor.value:.1f}°F")
        
        return alerts
    
    def _create_offline_sensor(self, location: str, reason: str) -> SensorStatus:
        """Create offline sensor status"""
        return SensorStatus(
            location=location,
            value=None,
            last_update=None,
            is_online=False,
            status_text=f"OFFLINE ({reason})",
            rate_of_change=None
        )
    
    def _is_reading_recent(self, timestamp: datetime, max_age_minutes: int = 5) -> bool:
        """Check if a reading is recent enough to be considered current"""
        if not timestamp:
            return False
        age = datetime.now() - timestamp
        return age.total_seconds() < (max_age_minutes * 60)
    
    def _format_time_ago(self, timestamp: Optional[datetime]) -> str:
        """Format time ago string"""
        if not timestamp:
            return "unknown"
        
        age = datetime.now() - timestamp
        if age.total_seconds() < 60:
            return f"{int(age.total_seconds())}s ago"
        elif age.total_seconds() < 3600:
            return f"{int(age.total_seconds() / 60)}m ago"
        else:
            return f"{int(age.total_seconds() / 3600)}h ago"
    
    def _get_fallback_status(self, error_msg: str) -> SystemStatus:
        """Return fallback status when data fetch fails"""
        # Use cached status if available and recent
        if (self.cached_status and self.last_successful_fetch and 
            datetime.now() - self.last_successful_fetch < timedelta(minutes=5)):
            
            # Update the status to show it's cached
            cached_status = self.cached_status
            cached_status.database_connected = False
            cached_status.alerts = [f"⚠ Database error: {error_msg}"] + cached_status.alerts
            return cached_status
        
        # Return minimal error status
        return SystemStatus(
            database_connected=False,
            sensors={loc: self._create_offline_sensor(loc, error_msg) for loc in self.TEMPERATURE_LOCATIONS},
            components={comp: ComponentState(comp, False, None, "ERROR") for comp in self.COMPONENT_LOCATIONS},
            target_temp=None,
            control_mode="System Error",
            control_reason=error_msg,
            alerts=[f"🚨 System Error: {error_msg}"]
        )