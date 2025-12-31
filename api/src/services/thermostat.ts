import { ResultSetHeader } from 'mysql2/promise';
import { execute } from '../db/index.js';
import { isValidTargetTemp } from '../utils/temperature.js';
import { publishSensorUpdate } from '../mqtt/bridge.js';

/**
 * Set the target temperature
 * @param temperature Target temperature in Fahrenheit (0 to turn off)
 * @param durationHours How long to maintain this target (default 1 hour)
 */
export async function setTargetTemperature(
  temperature: number,
  durationHours: number = 1
): Promise<void> {
  // Handle "off" case: temperature=0 means turn off heating
  if (temperature === 0) {
    await clearTargetTemperature();
    return;
  }

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

  // Publish to MQTT so all clients get updated via WebSocket
  publishSensorUpdate('thermostat', 'target_temp_f', temperature);
}

/**
 * Clear the target temperature (turn off heating)
 */
export async function clearTargetTemperature(): Promise<void> {
  const now = formatDateTime(new Date());

  // End any active targets by setting their end_timestamp to now
  await execute(
    `UPDATE thermostat_control
     SET end_timestamp = ?
     WHERE start_timestamp <= ?
     AND (end_timestamp IS NULL OR end_timestamp > ?)`,
    [now, now, now]
  );

  // Publish 0 to MQTT so all clients know heating is off
  publishSensorUpdate('thermostat', 'target_temp_f', 0);
}

/**
 * Format a Date for MySQL
 */
function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
