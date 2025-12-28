import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query, execute } from '../db/index.js';
import { ScheduledEvent } from '../types/index.js';

interface ScheduleRow extends RowDataPacket {
  id: number;
  desired_temp: number;
  start_timestamp: string;
  end_timestamp: string;
}

/**
 * Schedule a one-time heating event
 */
export async function scheduleHeat(
  startTime: Date,
  durationHours: number,
  temperature: number = 70
): Promise<string> {
  if (durationHours <= 0 || durationHours > 24) {
    throw new Error(`Duration must be between 0 and 24 hours, got ${durationHours}`);
  }

  if (temperature < 50 || temperature > 90) {
    throw new Error(`Temperature must be between 50 and 90°F, got ${temperature}`);
  }

  const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

  const startFormatted = formatDateTime(startTime);
  const endFormatted = formatDateTime(endTime);

  const result = (await execute(
    `INSERT INTO thermostat_control (desired_temp, start_timestamp, end_timestamp)
     VALUES (?, ?, ?)`,
    [temperature, startFormatted, endFormatted]
  )) as ResultSetHeader;

  return result.insertId.toString();
}

/**
 * Get the next scheduled heating event
 */
export async function getNextScheduledEvent(): Promise<ScheduledEvent | null> {
  const rows = await query<ScheduleRow[]>(
    `SELECT id, desired_temp, start_timestamp, end_timestamp
     FROM thermostat_control
     WHERE start_timestamp > NOW()
     ORDER BY start_timestamp ASC
     LIMIT 1`
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id.toString(),
    start_time: row.start_timestamp,
    end_time: row.end_timestamp,
    temperature: row.desired_temp,
  };
}

/**
 * Delete the next scheduled heating event
 */
export async function deleteNextScheduledEvent(): Promise<boolean> {
  const next = await getNextScheduledEvent();
  if (!next) {
    return false;
  }

  await execute(`DELETE FROM thermostat_control WHERE id = ?`, [next.id]);
  return true;
}

/**
 * Format a Date for MySQL
 */
function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
