from typing import Dict, Optional
import logging
from datetime import datetime
import asyncio
import time
import kasa
import pymysql

from sagrada.shared.models import Reading
from sagrada.shared.database import DBConfig, ReadingsStorage
from sagrada.collector.config.settings import KasaConfig

logger = logging.getLogger(__name__)

class KasaDevice:
    def __init__(self, device_name: str):
        self.device = None
        self.device_name = device_name
        self.switch_status = None
        self.time_last_toggled_ns = 0
        self.time_updated_ns = 0
        self.time_attempted_update_ns = 0

    async def get_device(self, attempt: int = 0):
        """Discover and connect to the Kasa device"""
        logger.info(f"Discovering Kasa devices, looking for {self.device_name}")
        devices = await kasa.Discover.discover()
        logger.debug(f"Found {len(devices)} devices")
        
        for addr, dev in devices.items():
            if dev.alias == self.device_name:
                self.device = kasa.SmartPlug(addr)
                logger.info(f"Found {self.device_name} at {addr}")
                await self.update()
                return
                
        if self.device is None:
            logger.warning(f"Failed to find {self.device_name}, retrying in 5 seconds")
            await asyncio.sleep(5)
            if attempt < 3:  # Limit retries
                await self.get_device(attempt + 1)

    async def switch_on(self) -> bool:
        """Turn the device on, respecting cooldown period"""
        if self.switch_status:
            return True

        seconds_since_last_toggle = (time.time_ns() - self.time_last_toggled_ns) / 1e9
        if seconds_since_last_toggle < 180:  # 3 minute cooldown
            logger.info(f"Not toggling {self.device_name}, last toggle {seconds_since_last_toggle:.1f}s ago")
            return False
            
        try:
            logger.info(f"Turning on {self.device_name}")
            self.time_last_toggled_ns = time.time_ns()
            await self.device.turn_on()
            await self.update()
            return True
        except Exception as e:
            logger.error(f"Failed to turn on {self.device_name}: {e}")
            return False

    async def switch_off(self) -> bool:
        """Turn the device off, respecting cooldown period"""
        if self.switch_status is False:
            return True

        seconds_since_last_toggle = (time.time_ns() - self.time_last_toggled_ns) / 1e9
        if seconds_since_last_toggle < 600:  # 10 minute cooldown
            logger.info(f"Not toggling {self.device_name}, last toggle {seconds_since_last_toggle:.1f}s ago")
            return False
            
        try:
            logger.info(f"Turning off {self.device_name}")
            self.time_last_toggled_ns = time.time_ns()
            await self.device.turn_off()
            await self.update()
            return True
        except Exception as e:
            logger.error(f"Failed to turn off {self.device_name}: {e}")
            return False

    async def update(self):
        """Update device status"""
        try:
            await self.device.update()
            self.time_updated_ns = time.time_ns()
            self.switch_status = self.device.is_on
            return True
        except Exception as e:
            logger.error(f"Failed to update {self.device_name}: {e}")
            # Try to reconnect if we haven't updated in 30 seconds
            if (time.time_ns() - self.time_updated_ns > 30e9 and 
                self.time_attempted_update_ns < time.time_ns() - 30e9):
                logger.info(f"Attempting to reconnect to {self.device_name}")
                self.time_attempted_update_ns = time.time_ns()
                await self.get_device()
            return False

class HeatingController:
    # System locations (format: {system}/{location})
    LOCATION_TANK = 'heating/tank'
    LOCATION_DESK = 'ambient/desk'
    LOCATION_HEATER_INPUT = 'heating/heater-input'
    LOCATION_HEATER_OUTPUT = 'heating/heater-output'
    LOCATION_FLOOR = 'heating/floor'
    LOCATION_PRE_TANK = 'heating/pre-tank'
    LOCATION_ROOM = 'shed'
    LOCATION_SYSTEM = 'system'

    # Base metric names
    METRIC_TEMPERATURE = 'temperature_f'
    METRIC_CONTROL_STATE = 'control_state'
    METRIC_TARGET_TEMP = 'target_temp_f'

    # Source IDs
    SOURCE_CONTROLLER = 'controller'
    SOURCE_THERMOSTAT = 'thermostat_control'

    # Groupings of locations for different purposes
    PIPE_LOCATIONS = [
        LOCATION_HEATER_INPUT,
        LOCATION_FLOOR,
        LOCATION_HEATER_OUTPUT,
        LOCATION_PRE_TANK
    ]

    CRITICAL_LOCATIONS = [
        LOCATION_TANK,
        LOCATION_DESK
    ]

    ALL_MONITORED_LOCATIONS = PIPE_LOCATIONS + CRITICAL_LOCATIONS

    def __init__(self, db_config: DBConfig, kasa_config: KasaConfig):
        self.db_config = db_config
        self.kasa_config = kasa_config
        self.storage = ReadingsStorage(db_config)
        
        # Initialize component states
        self.pump_state = False
        self.heater_state = False
        self.fan_state = False
        
        # Initialize Kasa devices
        self.devices = {}
        
        # Target temperatures and thresholds
        self.default_desk_temp = 40  # Add a default temperature
        self.target_desk_temp = self.default_desk_temp  # Initialize with default
        self.target_tank_temp = 140  # Target tank temperature when heating
        self.temp_threshold = 1.0  # Temperature threshold for control decisions
        self.freeze_prevention_temp = 40  # Temperature at which to start freeze prevention

    @property
    def critical_tank_temp(self) -> float:
        """The minimum temperature we'll allow the tank to reach.
        This is the freeze prevention temperature - we never want to go below this."""
        return self.freeze_prevention_temp

    def get_control_sensor_id(self, location: str) -> str:
        """Generate a unique sensor ID for control metrics"""
        return f"{self.SOURCE_CONTROLLER}_{location}"

    def get_control_metric(self, base_metric: str, component: str) -> str:
        """Generate a unique metric name for control values"""
        return f"{base_metric}_{component}"

    async def initialize_devices(self):
        """Initialize all Kasa devices"""
        for component in ['pump', 'heater', 'fan']:
            device_config = self.kasa_config.get_device(component)
            if device_config:
                self.devices[component] = KasaDevice(device_config.alias)
                await self.devices[component].get_device()
                # Initialize our internal state from the actual device state
                if self.devices[component].switch_status is not None:
                    if component == 'pump':
                        self.pump_state = self.devices[component].switch_status
                    elif component == 'heater':
                        self.heater_state = self.devices[component].switch_status
                    elif component == 'fan':
                        self.fan_state = self.devices[component].switch_status
                    logger.info(f"Initialized {component} state to {self.devices[component].switch_status}")
            else:
                logger.error(f"No configuration found for {component}")

    async def control_component(self, component: str, desired_state: bool):
        """Control a Kasa component's state and log the action"""
        try:
            # Get the device config and device
            device_config = self.kasa_config.get_device(component)
            device = self.devices.get(component)
            
            if not device_config or not device:
                logger.error(f"No configuration or device found for component: {component}")
                return
            
            # Control the device
            success = await device.switch_on() if desired_state else await device.switch_off()
            if not success:
                return
                
            # Log the control action with unique sensor_id and metric
            reading = Reading(
                timestamp=datetime.now(),
                source_type='controller',
                sensor_id=self.get_control_sensor_id(device_config.location),
                location=device_config.location,
                metric=self.get_control_metric(self.METRIC_CONTROL_STATE, component),
                metric_type='state',
                value='on' if desired_state else 'off'
            )
            self.storage.store_readings([reading])
            
            # Update internal state
            setattr(self, f"{component}_state", desired_state)
            logger.info(f"Set {component} to {'on' if desired_state else 'off'}")
            
        except Exception as e:
            logger.error(f"Failed to control {component}: {e}")

    def _get_connection(self):
        """Create and return a new database connection"""
        return pymysql.connect(
            host=self.db_config.host,
            user=self.db_config.user,
            password=self.db_config.password,
            database=self.db_config.database,
            cursorclass=pymysql.cursors.DictCursor
        )
        
    def get_current_readings(self) -> Dict[str, float]:
        """Get current temperature readings from the database"""
        try:
            logger.info(f"Getting current readings for {self.ALL_MONITORED_LOCATIONS} with metrics {self.METRIC_TEMPERATURE}")
            readings = self.storage.get_current_readings(
                locations=self.ALL_MONITORED_LOCATIONS,
                metrics=[self.METRIC_TEMPERATURE]
            )
            
            # Convert to dictionary of location: value
            readings_dict = {
                reading.location: float(reading.value) 
                for reading in readings
                if reading.value and reading.value.lower() != 'null'  # Skip null values
            }
            
            # Get target temperature from thermostat
            thermostat_readings = self.storage.get_current_readings(
                locations=[self.LOCATION_ROOM],
                metrics=[self.METRIC_TARGET_TEMP]
            )
            
            # Use default if no valid reading
            if thermostat_readings and thermostat_readings[0].value and thermostat_readings[0].value.lower() != 'null':
                try:
                    self.target_desk_temp = float(thermostat_readings[0].value)
                except (ValueError, TypeError):
                    logger.warning(f"Invalid target temperature value: {thermostat_readings[0].value}, using default {self.default_desk_temp}F")
                    self.target_desk_temp = self.default_desk_temp
            else:
                if self.target_desk_temp != self.default_desk_temp:
                    logger.info(f"No target temperature set, using default {self.default_desk_temp}F")
                self.target_desk_temp = self.default_desk_temp
                
            return readings_dict
            
        except Exception as e:
            logger.error(f"Failed to get current readings: {e}")
            return {}
            
    def evaluate_room_heating_need(self, desk_temp: float) -> tuple[bool, str]:
        """Evaluate if the room needs heating and why"""
        if desk_temp < self.target_desk_temp:
            return True, f"Room temperature ({desk_temp:.1f}F) below target ({self.target_desk_temp:.1f}F)"
        return False, f"Room temperature ({desk_temp:.1f}F) at or above target ({self.target_desk_temp:.1f}F)"

    def evaluate_tank_heating_need(self, tank_temp: float, need_room_heat: bool) -> tuple[bool, str]:
        """Evaluate if tank needs heating, with different behaviors for room heating vs freeze prevention.
        
        When room heating is needed:
            - Heat tank to target temperature (self.target_tank_temp)
        When room heating is not needed:
            - Only heat if tank is below freeze prevention temperature
        """
        # If we need room heat, maintain the target tank temperature
        if need_room_heat:
            if tank_temp < self.target_tank_temp:
                return True, f"Tank temperature ({tank_temp:.1f}F) below target ({self.target_tank_temp:.1f}F) and room needs heat"
            return False, f"Tank temperature ({tank_temp:.1f}F) sufficient for room heating (>= {self.target_tank_temp:.1f}F)"
            
        # If we don't need room heat, only prevent freezing
        if tank_temp < self.freeze_prevention_temp:
            return True, f"Tank temperature ({tank_temp:.1f}F) approaching freezing (< {self.freeze_prevention_temp:.1f}F)"
        
        return False, f"Tank temperature ({tank_temp:.1f}F) above freeze prevention threshold ({self.freeze_prevention_temp:.1f}F), no heating needed"

    def can_heat_from_tank(self, tank_temp: float) -> tuple[bool, str]:
        """Evaluate if the tank has enough stored energy to heat effectively"""
        if tank_temp >= (self.target_tank_temp - self.temp_threshold):
            return True, f"Tank temperature ({tank_temp:.1f}F) sufficient for heating (>= {self.target_tank_temp-self.temp_threshold:.1f}F)"
        return False, f"Tank temperature ({tank_temp:.1f}F) too low for effective heating (< {self.target_tank_temp-self.temp_threshold:.1f}F)"
    
    def check_pipe_freeze_risk(self, readings: Dict[str, float]) -> tuple[bool, str]:
        """Check pipe temperatures for freeze risk"""
        for location in self.PIPE_LOCATIONS:
            temp = readings.get(location)
            if temp and temp < self.freeze_prevention_temp:
                return True, f"{location} temperature ({temp:.1f}F) below freeze prevention threshold ({self.freeze_prevention_temp:.1f}F)"
        return False, "No freeze risk in pipes (all temperatures above freeze prevention threshold)"
            
    def get_device_states(self) -> Dict[str, bool]:
        """Get current device states from the database"""
        try:
            readings = self.storage.get_current_readings(
                locations=['pump', 'heater', 'fan'],
                metrics=['state']
            )
            
            states = {}
            for reading in readings:
                states[reading.location] = reading.value.lower() == 'true'
                
                # Update internal state if it doesn't match
                component = reading.location
                internal_state = getattr(self, f"{component}_state")
                if states[component] != internal_state:
                    logger.warning(f"{component} state mismatch: internal={internal_state}, actual={states[component]}")
                    setattr(self, f"{component}_state", states[component])
                    
            return states
            
        except Exception as e:
            logger.error(f"Failed to get device states: {e}")
            return {}

    async def control_loop(self):
        """Main control loop for the heating system"""
        await self.initialize_devices()
        
        while True:
            try:
                # Get device states from database instead of polling
                device_states = self.get_device_states()
                
                readings = self.get_current_readings()
                if not readings or self.target_desk_temp is None:
                    logger.info(f"Readings: {readings}")
                    logger.info(f"Target desk temp: {self.target_desk_temp}")
                    logger.warning("Missing required readings or target temperature")
                    # Log what specifically is missing
                    missing_readings = [loc for loc in self.ALL_MONITORED_LOCATIONS if loc not in readings]
                    logger.warning(f"Missing readings: {missing_readings}")
                    await asyncio.sleep(30)
                    continue
                    
                desk_temp = readings.get(self.LOCATION_DESK)
                tank_temp = readings.get(self.LOCATION_TANK)
                
                if not all([desk_temp, tank_temp]):
                    logger.warning("Missing critical temperature readings")
                    await asyncio.sleep(30)
                    continue
                
                # Energy transfer path 1: Tank → Distribution
                # Check both comfort heating and freeze prevention needs
                need_room_heat, room_reason = self.evaluate_room_heating_need(desk_temp)
                can_heat_room, tank_capacity_reason = self.can_heat_from_tank(tank_temp)
                pipe_freeze_risk, freeze_reason = self.check_pipe_freeze_risk(readings)
                
                # Energy transfer path 2: Heater → Tank
                need_tank_heat, tank_reason = self.evaluate_tank_heating_need(tank_temp, need_room_heat)
                
                # Log the decision factors
                logger.info(f"Room heating need: {need_room_heat} ({room_reason})")
                logger.info(f"Tank heating need: {need_tank_heat} ({tank_reason})")
                logger.info(f"Can heat from tank: {can_heat_room} ({tank_capacity_reason})")
                if pipe_freeze_risk:
                    logger.info(f"Pipe freeze prevention: {freeze_reason}")
                
                # Pump control - needed for both:
                # 1. Distributing heat from tank (if room needs heat and tank has capacity, or freeze risk)
                # 2. Moving water through heater to heat tank (if tank needs heat)
                should_run_pump = need_tank_heat or pipe_freeze_risk or (need_room_heat and can_heat_room)
                if should_run_pump != self.pump_state:
                    # Apply deadband control for pump based on room temperature
                    if should_run_pump and desk_temp > (self.target_desk_temp - self.temp_threshold):
                        logger.info(f"Not turning pump on: room temperature {desk_temp:.1f}F above lower threshold {self.target_desk_temp - self.temp_threshold:.1f}F")
                    elif not should_run_pump and desk_temp < (self.target_desk_temp + self.temp_threshold):
                        logger.info(f"Not turning pump off: room temperature {desk_temp:.1f}F below upper threshold {self.target_desk_temp + self.temp_threshold:.1f}F")
                    else:
                        await self.control_component('pump', should_run_pump)
                
                # Heater control - only for maintaining tank temperature
                if need_tank_heat != self.heater_state:
                    # Apply deadband control for heater based on tank temperature
                    if need_tank_heat and tank_temp > (self.target_tank_temp - self.temp_threshold):
                        logger.info(f"Not turning heater on: tank temperature {tank_temp:.1f}F above lower threshold {self.target_tank_temp - self.temp_threshold:.1f}F")
                    elif not need_tank_heat and tank_temp < (self.target_tank_temp + self.temp_threshold):
                        logger.info(f"Not turning heater off: tank temperature {tank_temp:.1f}F below upper threshold {self.target_tank_temp + self.temp_threshold:.1f}F")
                    else:
                        await self.control_component('heater', need_tank_heat)
                
                # Fan control - run when room needs heat and floor is warmer than desk
                floor_temp = readings.get(self.LOCATION_FLOOR)
                should_run_fan = (need_room_heat and 
                                floor_temp is not None and 
                                desk_temp is not None and 
                                floor_temp > desk_temp)
                
                if should_run_fan != self.fan_state:
                    # Apply deadband control for fan based on room temperature
                    if should_run_fan and desk_temp > (self.target_desk_temp - self.temp_threshold):
                        logger.info(f"Not turning fan on: room temperature {desk_temp:.1f}F above lower threshold {self.target_desk_temp - self.temp_threshold:.1f}F")
                    elif not should_run_fan and desk_temp < (self.target_desk_temp + self.temp_threshold):
                        logger.info(f"Not turning fan off: room temperature {desk_temp:.1f}F below upper threshold {self.target_desk_temp + self.temp_threshold:.1f}F")
                    else:
                        await self.control_component('fan', should_run_fan)
                        if should_run_fan:
                            logger.info(f"Turning fan on: floor temp {floor_temp:.1f}F > desk temp {desk_temp:.1f}F")
                
                # Force sync our internal states with reality occasionally
                for component in ['pump', 'heater', 'fan']:
                    device = self.devices.get(component)
                    if device:
                        await device.update()  # Get the true device state
                        if device.switch_status is not None:
                            actual_state = device.switch_status
                            internal_state = getattr(self, f"{component}_state")
                            if actual_state != internal_state:
                                logger.warning(f"{component} state mismatch: internal={internal_state}, actual={actual_state}")
                                setattr(self, f"{component}_state", actual_state)
                
                # Log system state and targets with unique sensor_ids and metrics
                self.storage.store_readings([
                    Reading(
                        timestamp=datetime.now(),
                        source_type='controller',
                        sensor_id=self.get_control_sensor_id(self.LOCATION_TANK),
                        location=self.LOCATION_TANK,
                        metric=self.get_control_metric(self.METRIC_TARGET_TEMP, 'tank'),
                        metric_type='numeric',
                        value=str(self.target_tank_temp)
                    ),
                    Reading(
                        timestamp=datetime.now(),
                        source_type='controller',
                        sensor_id=self.get_control_sensor_id(self.LOCATION_TANK),
                        location=self.LOCATION_TANK,
                        metric=self.get_control_metric('critical_temp_f', 'tank'),
                        metric_type='numeric',
                        value=str(self.critical_tank_temp)
                    )
                ])
                
            except Exception as e:
                logger.error(f"Error in control loop: {e}")
            
            await asyncio.sleep(30)  # Run control loop every 30 seconds 