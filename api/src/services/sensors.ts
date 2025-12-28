import { RowDataPacket } from 'mysql2/promise';
import { query } from '../db/index.js';
import { HistoryResponse, HistoryDataPoint } from '../types/index.js';
import { celsiusToFahrenheit, roundTemp } from '../utils/temperature.js';

interface MinuteReadingRow extends RowDataPacket {
  timestamp: string;
  avg_value: number;
  min_value: number;
  max_value: number;
}

/**
 * Map frontend location names to database location paths.
 * Supports both old (short) and new (system/location) formats.
 */
const LOCATION_ALIASES: Record<string, string[]> = {
  // Heating loop sensors
  'beginning': ['beginning', 'heating/supply'],
  'floor': ['floor', 'heating/floor'],
  'end': ['end', 'heating/return'],
  'pre-tank': ['pre-tank', 'heating/pre-tank'],
  'tank': ['tank', 'heating/tank'],
  'heater-input': ['heater-input', 'heating/heater-input'],
  'heater-output': ['heater-output', 'heating/heater-output'],
  // Environment sensors
  'desk': ['desk', 'ambient/desk'],
  'door': ['door', 'ambient/door'],
  'outside': ['outside', 'outside/north', 'outside/main'],
  'workbench': ['workbench', 'ambient/workbench'],
};

/**
 * Get all location aliases for a given location name.
 * If no alias exists, returns the location as-is.
 */
function getLocationAliases(location: string): string[] {
  // Check if it's an alias key
  if (LOCATION_ALIASES[location]) {
    return LOCATION_ALIASES[location];
  }
  // Check if it's already a full path that matches an alias value
  for (const aliases of Object.values(LOCATION_ALIASES)) {
    if (aliases.includes(location)) {
      return aliases;
    }
  }
  // Return as-is
  return [location];
}

/**
 * Get temperature history for a location
 */
export async function getTemperatureHistory(
  location: string,
  minutes: number
): Promise<HistoryResponse> {

  // Clamp minutes to reasonable range
  const clampedMinutes = Math.min(Math.max(minutes, 1), 1440); // 1 min to 24 hours

  // Get all aliases for this location to query both old and new formats
  const locationAliases = getLocationAliases(location);
  const placeholders = locationAliases.map(() => '?').join(', ');

  const rows = await query<MinuteReadingRow[]>(
    `SELECT
       timestamp,
       avg_value,
       COALESCE(min_value, avg_value) as min_value,
       COALESCE(max_value, avg_value) as max_value
     FROM climate.minute_readings
     WHERE location IN (${placeholders})
       AND metric = 'temperature_c'
       AND timestamp >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
     ORDER BY timestamp ASC`,
    [...locationAliases, clampedMinutes]
  );

  const data: HistoryDataPoint[] = rows.map((row) => ({
    timestamp: row.timestamp,
    avg: roundTemp(celsiusToFahrenheit(row.avg_value)),
    min: roundTemp(celsiusToFahrenheit(row.min_value)),
    max: roundTemp(celsiusToFahrenheit(row.max_value)),
  }));

  return {
    location,
    metric: 'temperature',
    unit: 'F',
    data,
  };
}
