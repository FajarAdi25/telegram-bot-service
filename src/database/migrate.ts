import 'dotenv/config';
import { loadConfig } from '../config/config.js';
import { createDatabasePool } from './connection.js';
import { initialMigrationStatements } from './migrations/001-initial.js';
import { telegramActionSessionMigrationStatements } from './migrations/002-telegram-action-sessions.js';

const config = loadConfig();
const pool = createDatabasePool(config.mysql);

try {
  for (const statement of [
    ...initialMigrationStatements,
    ...telegramActionSessionMigrationStatements,
  ]) {
    await pool.query(statement);
  }
  console.log('Database migration completed.');
} finally {
  await pool.end();
}
