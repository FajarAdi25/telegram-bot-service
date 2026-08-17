import mysql, { type Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/config.js';

export function createDatabasePool(config: AppConfig['mysql']): Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit,
    waitForConnections: true,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
}
