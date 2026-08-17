import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertWebhookDto } from '../src/modules/alert/dto/alert-webhook.dto.js';
import { formatAlertMessage } from '../src/modules/telegram/alert-message.formatter.js';

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
    message: 'Docker <driver> unhealthy',
    openedAt: '2026-08-17T02:00:00.000Z',
    resolvedAt: null,
    reminderCount: 0,
  },
};

test('formats incident webhook fields and escapes HTML', () => {
  const message = formatAlertMessage(payload);

  assert.match(message, /<b>Incident Alert<\/b>/);
  assert.match(message, /<b>Source:<\/b> NOMAD/);
  assert.match(message, /<b>Incident ID:<\/b> INC-TEST-001/);
  assert.match(message, /Docker &lt;driver&gt; unhealthy/);
  assert.match(message, /<b>Resolved At:<\/b> -/);
});

test('uses resolved title for RESOLVED webhook', () => {
  const message = formatAlertMessage({
    ...payload,
    kind: 'RESOLVED',
    incident: {
      ...payload.incident,
      status: 'RESOLVED',
      resolvedAt: '2026-08-17T02:17:30.000Z',
    },
  });

  assert.match(message, /<b>Incident Resolved<\/b>/);
  assert.match(message, /2026-08-17T02:17:30\.000Z/);
});
