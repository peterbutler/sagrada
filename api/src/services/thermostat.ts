import { ResultSetHeader } from 'mysql2/promise';
import { execute } from '../db/index.js';
import { isValidTargetTemp } from '../utils/temperature.js';

/**
 * Set the target temperature
 * @param temperature Target temperature in Fahrenheit
 * @param durationHours How long to maintain this target (default 1 hour)
 */
export async function setTargetTemperature(
  temperature: number,
  durationHours: number = 1
): Promise<void> {
  if (!isValidTargetTemp(temperature)) {
    throw new Error(`Temperature must be between 50 and 90°F, got ${temperature}`);
  }

  if (durationHours <= 0 || durationHours > 24) {
    throw new Error(`Duration must be between 0 and 24 hours, got ${durationHours}`);
  }

  const now = new Date();
  const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  const startFormatted = formatDateTime(now);
  const endFormatted = formatDateTime(endTime);

  await execute(
    `INSERT INTO thermostat_control (desired_temp, start_timestamp, end_timestamp)
     VALUES (?, ?, ?)`,
    [temperature, startFormatted, endFormatted]
  );
}

/**
 * Format a Date for MySQL
 */
function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
