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
 * Get temperature history for a location
 */
export async function getTemperatureHistory(
  location: string,
  minutes: number
): Promise<HistoryResponse> {

  // Clamp minutes to reasonable range
  const clampedMinutes = Math.min(Math.max(minutes, 1), 1440); // 1 min to 24 hours

  const rows = await query<MinuteReadingRow[]>(
    `SELECT
       timestamp,
       avg_value,
       COALESCE(min_value, avg_value) as min_value,
       COALESCE(max_value, avg_value) as max_value
     FROM climate.minute_readings
     WHERE location = ?
       AND metric = 'temperature_c'
       AND timestamp >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
     ORDER BY timestamp ASC`,
    [location, clampedMinutes]
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
