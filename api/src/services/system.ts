/**
 * System health monitoring service.
 *
 * Provides disk usage and database table size information
 * for the dashboard health panel.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { RowDataPacket } from 'mysql2/promise';
import { query } from '../db/index.js';

const execAsync = promisify(exec);

type HealthStatus = 'ok' | 'warning' | 'critical';

export interface DiskUsage {
  used_bytes: number;
  total_bytes: number;
  available_bytes: number;
  percent_used: number;
  status: HealthStatus;
}

export interface TableSize {
  name: string;
  data_mb: number;
  index_mb: number;
  total_mb: number;
  rows: number;
  status: HealthStatus;
}

export interface SystemHealth {
  disk: DiskUsage;
  tables: TableSize[];
  timestamp: string;
}

// Thresholds
const DISK_WARNING_PERCENT = 80;
const DISK_CRITICAL_PERCENT = 95;
const SENSOR_READINGS_WARNING_ROWS = 2_000_000;
const SENSOR_READINGS_CRITICAL_ROWS = 5_000_000;

interface TableSizeRow extends RowDataPacket {
  name: string;
  data_mb: number;
  index_mb: number;
  total_mb: number;
  rows: number;
}

/**
 * Get disk usage for the root filesystem.
 */
export async function getDiskUsage(): Promise<DiskUsage> {
  const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4,$5}'");
  const [total, used, available, percentStr] = stdout.trim().split(/\s+/);
  const percent = parseInt(percentStr.replace('%', ''), 10);

  let status: HealthStatus = 'ok';
  if (percent >= DISK_CRITICAL_PERCENT) status = 'critical';
  else if (percent >= DISK_WARNING_PERCENT) status = 'warning';

  return {
    total_bytes: parseInt(total, 10),
    used_bytes: parseInt(used, 10),
    available_bytes: parseInt(available, 10),
    percent_used: percent,
    status,
  };
}

/**
 * Get sizes of key database tables.
 */
export async function getTableSizes(): Promise<TableSize[]> {
  const sql = `
    SELECT
      table_name as name,
      ROUND(data_length / 1024 / 1024, 0) as data_mb,
      ROUND(index_length / 1024 / 1024, 0) as index_mb,
      ROUND((data_length + index_length) / 1024 / 1024, 0) as total_mb,
      table_rows as \`rows\`
    FROM information_schema.tables
    WHERE table_schema = 'climate'
      AND table_name IN ('sensor_readings', 'minute_readings', 'thermostat')
    ORDER BY (data_length + index_length) DESC
  `;

  const results = await query<TableSizeRow[]>(sql);

  return results.map((table) => {
    let status: HealthStatus = 'ok';

    if (table.name === 'sensor_readings') {
      if (table.rows > SENSOR_READINGS_CRITICAL_ROWS) status = 'critical';
      else if (table.rows > SENSOR_READINGS_WARNING_ROWS) status = 'warning';
    }

    return {
      name: table.name,
      data_mb: table.data_mb,
      index_mb: table.index_mb,
      total_mb: table.total_mb,
      rows: table.rows,
      status,
    };
  });
}

/**
 * Get combined system health information.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [disk, tables] = await Promise.all([getDiskUsage(), getTableSizes()]);

  return {
    disk,
    tables,
    timestamp: new Date().toISOString(),
  };
}
