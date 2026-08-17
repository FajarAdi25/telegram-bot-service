import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertWebhookDto } from '../src/modules/alert/dto/alert-webhook.dto.js';
import { TelegramService } from '../src/modules/telegram/telegram.service.js';
import { TelegramTopicRouter } from '../src/modules/telegram/telegram-topic-router.js';

const payload: AlertWebhookDto = {
  event: 'INCIDENT_ALERT',
  kind: 'INITIAL',
  incident: {
    id: 'INC-TEST-001',
    status: 'OPEN',
    source: 'NOMAD',
    type: 'DRIVER_UNHEALTHY',
    severity: 'WARNING',
    resource: {
      type: 'DRIVER',
      key: 'sample-node-id:docker',
      name: 'nomadworker-east-4/docker',
    },
    message: 'Docker driver unhealthy',
    openedAt: '2026-08-17T02:00:00.000Z',
    resolvedAt: null,
    reminderCount: 0,
  },
};

function createHarness(acknowledged: boolean) {
  let request: any;
  const client = {
    async sendMessage(input: unknown) {
      request = input;
      return { message_id: 1 };
    },
  };
  const incidentStateRepository = {
    async isAcknowledged() {
      return acknowledged;
    },
  };

  const service = new TelegramService(
    client as never,
    new TelegramTopicRouter({ NOMAD: 2, CONSUL: 3, MINIO: 4 }),
    incidentStateRepository as never,
    '-1004474327429',
  );

  return { service, getRequest: () => request };
}

test('OPEN incident shows ACK and POSTPONE before acknowledged', async () => {
  const harness = createHarness(false);
  await harness.service.sendAlert(payload);

  assert.deepEqual(harness.getRequest().buttons, [
    { text: 'Acknowledge', callback_data: 'ack:INC-TEST-001' },
    { text: 'Postpone', callback_data: 'postpone:INC-TEST-001' },
  ]);
});

test('future notification keeps POSTPONE but removes ACK after ACK', async () => {
  const harness = createHarness(true);
  await harness.service.sendAlert({ ...payload, kind: 'REMINDER' });

  assert.deepEqual(harness.getRequest().buttons, [
    { text: 'Postpone', callback_data: 'postpone:INC-TEST-001' },
  ]);
});

test('RESOLVED notification has no action buttons', async () => {
  const harness = createHarness(true);
  await harness.service.sendAlert({
    ...payload,
    kind: 'RESOLVED',
    incident: {
      ...payload.incident,
      status: 'RESOLVED',
      resolvedAt: '2026-08-17T02:10:00.000Z',
    },
  });

  assert.deepEqual(harness.getRequest().buttons, []);
});
