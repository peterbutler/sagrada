import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { getDatabaseConfig } from '../config/database.js';

let pool: Pool | null = null;

/**
 * Get database connection pool (singleton)
 */
export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(getDatabaseConfig());
  }
  return pool;
}

/**
 * Execute a query and return typed results
 */
export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: unknown[]
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, params);
  return rows;
}

/**
 * Execute an insert/update/delete and return result info
 */
export async function execute(sql: string, params?: unknown[]) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
