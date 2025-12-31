import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from '../components/Header';
import { QuickStatus } from '../components/QuickStatus';
import { SensorPanel } from '../components/SensorPanel';
import { TemperatureChart } from '../components/TemperatureChart';
import { EnergyFlow } from '../components/EnergyFlow';
import { Controls } from '../components/Controls';
import { Schedule } from '../components/Schedule';
import { Footer } from '../components/Footer';
import { useSensorData } from '../hooks/useSensorData';
import { useHistory } from '../hooks/useHistory';
import { useDelta } from '../hooks/useRateOfChange';
import { CONSTANTS } from '../utils/energyCalculation';

// Heating loop sensors
const HEATING_LOOP_LOCATIONS = ['tank', 'beginning', 'floor', 'end', 'pre-tank'];
const HEATING_LOOP_LABELS = {
  tank: 'Tank',
  beginning: 'Coil In (beginning)',
  floor: 'Floor',
  end: 'Coil Out (end)',
  'pre-tank': 'Return (pre-tank)'
};

// Environment sensors
const ENVIRONMENT_LOCATIONS = ['workbench', 'door', 'desk', 'outside'];
const ENVIRONMENT_LABELS = {
  workbench: 'Workbench',
  door: 'Door',
  desk: 'Desk',
  outside: 'Outside'
};

export function Dashboard() {
  const {
    sensors,
    devices,
    targetTemp,
    connectionState,
    isConnected,
    latency,
    getSensor,
    isHeating
  } = useSensorData();

  // Fetch history for charts - now includes pre-computed rates
  const {
    data: heatingLoopHistory,
    rates: heatingLoopRates,
    updateReading: updateHeatingReading
  } = useHistory(HEATING_LOOP_LOCATIONS, 60);

  const {
    data: environmentHistory,
    rates: environmentRates,
    updateReading: updateEnvironmentReading
  } = useHistory(ENVIRONMENT_LOCATIONS, 60);

  // Calculate delta (inside - outside)
  const deskTemp = sensors.desk?.temperature;
  const outsideTemp = sensors.outside?.temperature;
  const { delta, description: deltaDescription } = useDelta(deskTemp, outsideTemp);

  // Get current desk temperature and rate for quick status
  const currentTemp = deskTemp;
  const deskRates = environmentRates.desk || [];
  const currentRate = deskRates.length > 0 ? deskRates[deskRates.length - 1] : null;

  // Get beginning temperature from 3 minutes ago for floor coil delta calculation
  // History data is 1-minute resolution, so index (length - 3) is ~3 minutes ago
  const beginningHistory = heatingLoopHistory.beginning || [];
  const beginningTempPast = useMemo(() => {
    const offset = CONSTANTS.FLOOR_TRANSIT_MINUTES;
    if (beginningHistory.length >= offset) {
      const pastIndex = beginningHistory.length - offset;
      return beginningHistory[pastIndex]?.avg;
    }
    return null;
  }, [beginningHistory]);

  // Get tank rate for energy calculations
  const tankRates = heatingLoopRates.tank || [];
  const tankRate = tankRates.length > 0 ? tankRates[tankRates.length - 1] : null;

  // Build sensor arrays for panels using pre-computed rates from history
  const heatingLoopSensors = useMemo(() => {
    return HEATING_LOOP_LOCATIONS.map((location) => {
      const sensor = getSensor(location);
      // Use rate directly from the rates object (same data as chart uses)
      const locationRates = heatingLoopRates[location] || [];
      const rate = locationRates.length > 0 ? locationRates[locationRates.length - 1] : null;
      return {
        id: location,
        label: HEATING_LOOP_LABELS[location],
        temperature: sensor.temperature,
        rate,
        timestamp: sensor.timestamp
      };
    });
  }, [getSensor, heatingLoopRates]);

  const environmentSensors = useMemo(() => {
    // Helper to get current rate from rates array
    const getRate = (location) => {
      const locationRates = environmentRates[location] || [];
      return locationRates.length > 0 ? locationRates[locationRates.length - 1] : null;
    };

    // Build sensor list from ENVIRONMENT_LOCATIONS
    const sensorList = ENVIRONMENT_LOCATIONS.map(location => ({
      id: location,
      label: ENVIRONMENT_LABELS[location] || location,
      temperature: sensors[location]?.temperature,
      rate: getRate(location),
      timestamp: sensors[location]?.timestamp
    }));

    // Add delta as a special entry
    sensorList.push({
      id: 'delta',
      label: 'Delta (in-out)',
      temperature: delta,
      customTrend: { text: deltaDescription, className: 'stable' },
      timestamp: null
    });

    return sensorList;
  }, [sensors, environmentRates, delta, deltaDescription]);

  // Track previous sensor timestamps to only update when a specific sensor changes
  const prevTimestamps = useRef({});

  // Update chart history with WebSocket readings
  // Only update the sensor that actually changed (based on timestamp)
  useEffect(() => {
    if (!sensors) return;

    HEATING_LOOP_LOCATIONS.forEach((location) => {
      const sensor = sensors[location];
      if (sensor?.temperature !== undefined && sensor?.timestamp) {
        // Only update if timestamp changed for this specific sensor
        if (prevTimestamps.current[location] !== sensor.timestamp) {
          prevTimestamps.current[location] = sensor.timestamp;
          updateHeatingReading(location, {
            timestamp: sensor.timestamp,
            value: sensor.temperature
          });
        }
      }
    });

    ENVIRONMENT_LOCATIONS.forEach((location) => {
      const sensor = sensors[location];
      if (sensor?.temperature !== undefined && sensor?.timestamp) {
        // Only update if timestamp changed for this specific sensor
        if (prevTimestamps.current[location] !== sensor.timestamp) {
          prevTimestamps.current[location] = sensor.timestamp;
          updateEnvironmentReading(location, {
            timestamp: sensor.timestamp,
            value: sensor.temperature
          });
        }
      }
    });
  }, [sensors, updateHeatingReading, updateEnvironmentReading]);

  // Handlers for control changes (optimistic updates from WebSocket will handle state)
  const handleTargetChange = useCallback((temp) => {
    // WebSocket will update the actual state
  }, []);

  const handleDeviceChange = useCallback((device, state) => {
    // WebSocket will update the actual state
  }, []);

  return (
    <div className="dashboard">
      <Header
        connectionState={connectionState}
        latency={latency}
      />

      <QuickStatus
        currentTemp={currentTemp}
        targetTemp={targetTemp}
        heatingRate={currentRate}
        isHeating={isHeating}
        devices={devices}
        sensors={sensors}
      />

      <div className="main-content">
        <SensorPanel
          title="Heating Loop"
          icon="🔥"
          sensors={heatingLoopSensors}
          isHeating={isHeating}
        >
          <EnergyFlow
            tankTempF={sensors.tank?.temperature}
            ambientTempF={sensors.desk?.temperature}
            tankRate={tankRate}
            heaterState={devices.heater?.state}
            heaterPower={devices.heater?.power}
            pumpState={devices.pump?.state}
            beginningTempPast={beginningTempPast}
            endTempNow={sensors.end?.temperature}
          />
          <TemperatureChart
            title="LAST HOUR"
            data={heatingLoopHistory}
            rates={heatingLoopRates}
            locations={HEATING_LOOP_LOCATIONS}
            locationLabels={HEATING_LOOP_LABELS}
          />
        </SensorPanel>

        <SensorPanel
          title="Environment"
          icon="🌡️"
          sensors={environmentSensors}
          isHeating={isHeating}
        >
          <TemperatureChart
            title="LAST HOUR"
            data={environmentHistory}
            rates={environmentRates}
            locations={ENVIRONMENT_LOCATIONS}
            locationLabels={ENVIRONMENT_LABELS}
          />
        </SensorPanel>
      </div>

      <Controls
        targetTemp={targetTemp}
        devices={devices}
        onTargetChange={handleTargetChange}
        onDeviceChange={handleDeviceChange}
      />

      <Schedule />

      <Footer />
    </div>
  );
}
