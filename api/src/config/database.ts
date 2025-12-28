import { PoolOptions } from 'mysql2/promise';

export function getDatabaseConfig(): PoolOptions {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'climate',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}
