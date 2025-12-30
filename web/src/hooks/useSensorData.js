import { useState, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { celsiusToFahrenheit } from '../utils/temperature';
import { calculateRate } from '../utils/rateCalculation';

// Maximum readings to keep for rate calculation
const MAX_READINGS_HISTORY = 20;

/**
 * Sensor locations for temperature readings
 */
export const SENSOR_LOCATIONS = [
  'tank',
  'pre-tank',
  'beginning',
  'end',
  'floor',
  'desk',
  'outside',
  'workbench',
  'door'
];

/**
 * Device names for smart plugs
 */
export const DEVICE_NAMES = ['heater', 'pump', 'fan'];

/**
 * Hook for managing sensor data from WebSocket
 * @returns {{
 *   sensors: Object,
 *   devices: Object,
 *   targetTemp: number|null,
 *   connectionState: string,
 *   isConnected: boolean,
 *   latency: number|null
 * }}
 */
export function useSensorData() {
  // Sensor readings: { [location]: { temperature: number, timestamp: string } }
  const [sensors, setSensors] = useState({});

  // Device states: { [device]: { state: boolean, power: number, timestamp: string } }
  const [devices, setDevices] = useState({});

  // Target temperature
  const [targetTemp, setTargetTemp] = useState(null);

  // Reading history for rate calculation: { [location]: Array<{timestamp, value}> }
  const readingsHistory = useRef({});

  // Process each WebSocket message directly via callback
  // This ensures every message is processed, even when they arrive rapidly
  const handleMessage = useCallback((message) => {
    const { type, location, metric, value, unit, timestamp } = message;

    if (type !== 'sensor_update') return;

    // Handle temperature readings
    if (metric === 'temperature') {
      // Convert to Fahrenheit if in Celsius
      const tempF = unit === 'C' ? celsiusToFahrenheit(value) : value;

      // Update readings history
      if (!readingsHistory.current[location]) {
        readingsHistory.current[location] = [];
      }
      readingsHistory.current[location].push({ timestamp, value: tempF });

      // Trim history
      if (readingsHistory.current[location].length > MAX_READINGS_HISTORY) {
        readingsHistory.current[location].shift();
      }

      // Calculate rate of change
      const rate = calculateRate(readingsHistory.current[location]);

      setSensors(prev => ({
        ...prev,
        [location]: {
          temperature: tempF,
          timestamp,
          rate
        }
      }));
    }

    // Handle device state
    if (metric === 'state' && DEVICE_NAMES.includes(location)) {
      setDevices(prev => ({
        ...prev,
        [location]: {
          ...prev[location],
          state: Boolean(value),
          timestamp
        }
      }));
    }

    // Handle device power
    if (metric === 'power' && DEVICE_NAMES.includes(location)) {
      setDevices(prev => ({
        ...prev,
        [location]: {
          ...prev[location],
          power: value,
          timestamp
        }
      }));
    }

    // Handle target temperature
    if (metric === 'target_temp_f') {
      setTargetTemp(value === 0 ? null : value);
    }

  }, []);

  const { connectionState, isConnected, latency } = useWebSocket({
    onMessage: handleMessage
  });

  /**
   * Get sensor value by location
   */
  const getSensor = useCallback((location) => {
    return sensors[location] || { temperature: null, timestamp: null, rate: null };
  }, [sensors]);

  /**
   * Get device state by name
   */
  const getDevice = useCallback((name) => {
    return devices[name] || { state: false, power: null, timestamp: null };
  }, [devices]);

  /**
   * Check if heater is currently on
   */
  const isHeating = devices.heater?.state === true;

  /**
   * Calculate delta between inside (desk) and outside
   */
  const getDelta = useCallback(() => {
    const desk = sensors.desk?.temperature;
    const outside = sensors.outside?.temperature;

    if (desk === null || desk === undefined ||
        outside === null || outside === undefined) {
      return null;
    }

    return desk - outside;
  }, [sensors]);

  return {
    sensors,
    devices,
    targetTemp,
    connectionState,
    isConnected,
    latency,
    getSensor,
    getDevice,
    isHeating,
    getDelta
  };
}
