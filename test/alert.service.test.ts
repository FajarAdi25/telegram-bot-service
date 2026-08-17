import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertWebhookDto } from '../src/modules/alert/dto/alert-webhook.dto.js';
import { AlertService } from '../src/modules/alert/alert.service.js';

const payload: AlertWebhookDto = {
  event: 'INCIDENT_ALERT',
  kind: 'INITIAL',
  incident: {
    id: 'INC-001',
    status: 'OPEN',
    source: 'NOMAD',
    type: 'NODE_DOWN',
    severity: 'CRITICAL',
    resource: { type: 'NODE', key: 'node-1', name: 'node-1' },
    message: 'Node down',
    openedAt: '2026-08-17T02:00:00.000Z',
    resolvedAt: null,
    reminderCount: 0,
  },
};

test('duplicate webhook does not send another Telegram message', async () => {
  let sends = 0;
  const repository = {
    async reserve() { return false; },
    async markSent() {},
    async markFailed() {},
  };
  const telegram = {
    async sendAlert() { sends += 1; },
  };

  const service = new AlertService(repository as never, telegram as never);
  const result = await service.process(payload);

  assert.deepEqual(result, { duplicate: true });
  assert.equal(sends, 0);
});

test('failed Telegram send marks dedup record FAILED and rethrows', async () => {
  let markedFailed = false;
  const repository = {
    async reserve() { return true; },
    async markSent() {},
    async markFailed() { markedFailed = true; },
  };
  const telegram = {
    async sendAlert() { throw new Error('telegram unavailable'); },
  };

  const service = new AlertService(repository as never, telegram as never);
  await assert.rejects(() => service.process(payload), /telegram unavailable/);
  assert.equal(markedFailed, true);
});
