import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramTopicRouter } from '../src/modules/telegram/telegram-topic-router.js';

test('routes each alert source to its configured Telegram topic', () => {
  const router = new TelegramTopicRouter({
    NOMAD: 101,
    CONSUL: 102,
    MINIO: 103,
  });

  assert.equal(router.resolve('NOMAD'), 101);
  assert.equal(router.resolve('CONSUL'), 102);
  assert.equal(router.resolve('MINIO'), 103);
});
