import 'dotenv/config';
import { createServer } from 'node:http';
import { loadConfig } from './config/config.js';
import { createDatabasePool } from './database/connection.js';
import { WebhookDeliveryRepository } from './repositories/webhook-delivery.repository.js';
import { createAlertModule } from './modules/alert/alert.module.js';
import { createTelegramModule } from './modules/telegram/telegram.module.js';
import { HttpError } from './shared/errors/http-error.js';
import { sendJson } from './shared/http/json.js';

const config = loadConfig();
const pool = createDatabasePool(config.mysql);
const webhookRepository = new WebhookDeliveryRepository(pool);
const telegramModule = createTelegramModule(config, pool);
const alertModule = createAlertModule(webhookRepository, telegramModule.service);

const server = createServer(async (req, res) => {
  try {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (method === 'GET' && url.pathname === '/health') {
      await pool.query('SELECT 1');
      sendJson(res, 200, {
        status: 'ok',
        database: 'up',
        telegramPolling: telegramModule.pollingService.isRunning() ? 'up' : 'down',
        version: config.appVersion,
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/webhooks/alerts') {
      await alertModule.controller.receive(req, res);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(config.port, async () => {
  console.log(`Monitoring Telegram Bot v${config.appVersion} listening on port ${config.port}`);

  try {
    await telegramModule.pollingService.start();
  } catch (error) {
    console.error('Failed to start Telegram long polling', error);
    process.exit(1);
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}, shutting down...`);

  try {
    await telegramModule.pollingService.stop();
  } catch (error) {
    console.error('Failed to stop Telegram long polling cleanly', error);
  }

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
