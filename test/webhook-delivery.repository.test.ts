import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertWebhookDto } from '../src/modules/alert/dto/alert-webhook.dto.js';
import { WebhookDeliveryRepository } from '../src/repositories/webhook-delivery.repository.js';

const base: AlertWebhookDto = {
  event: 'INCIDENT_ALERT',
  kind: 'REMINDER',
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
    reminderCount: 3,
  },
};

test('dedup key follows incident.id + kind + reminderCount', () => {
  assert.equal(WebhookDeliveryRepository.dedupKey(base), 'INC-001|REMINDER|3');
});
