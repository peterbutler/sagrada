import { RowDataPacket } from 'mysql2/promise';
import { query } from '../db/index.js';
import { SensorUpdate } from '../types/index.js';
import { celsiusToFahrenheit, roundTemp } from '../utils/temperature.js';

interface CurrentReadingRow extends RowDataPacket {
  sensor_id: string;
  location: string;
  metric: string;
  metric_type: string;
  value: string;
  timestamp: string;
}

/**
 * Get current readings for all sensors, formatted as SensorUpdate messages
 * Used to send initial state when a WebSocket client connects
 */
export async function getCurrentReadings(): Promise<SensorUpdate[]> {
  const rows = await query<CurrentReadingRow[]>(
    `SELECT sensor_id, location, metric, metric_type, value, timestamp
     FROM current_readings`
  );

  const updates: SensorUpdate[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const metric = row.metric;
    let value: number | boolean;
    let unit: string | undefined;

    if (metric === 'state') {
      value = row.value === '1' || row.value.toLowerCase() === 'true';
    } else if (metric === 'temperature_c') {
      // Convert to Fahrenheit for the update
      const celsius = parseFloat(row.value);
      value = roundTemp(celsiusToFahrenheit(celsius));
      unit = 'F';
    } else {
      value = parseFloat(row.value);
      unit = getUnitForMetric(metric);
    }

    updates.push({
      type: 'sensor_update',
      location: row.location,
      metric: metric === 'temperature_c' ? 'temperature' : metric,
      value,
      unit,
      timestamp: row.timestamp || now,
    });
  }

  return updates;
}

function getUnitForMetric(metric: string): string | undefined {
  switch (metric) {
    case 'power':
      return 'W';
    case 'voltage':
      return 'V';
    case 'current':
      return 'A';
    case 'target_temp_f':
    case 'target_temp_f_tank':
      return 'F';
    default:
      return undefined;
  }
}
