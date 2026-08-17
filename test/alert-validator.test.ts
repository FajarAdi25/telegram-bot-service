import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAlertWebhook } from '../src/modules/alert/alert.validator.js';

const validPayload = {
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

test('accepts Monitoring Service v1.0 incident webhook', () => {
  assert.deepEqual(parseAlertWebhook(validPayload), validPayload);
});

test('accepts nullable resource name', () => {
  const payload = {
    ...validPayload,
    incident: {
      ...validPayload.incident,
      resource: { ...validPayload.incident.resource, name: null },
    },
  };
  assert.deepEqual(parseAlertWebhook(payload), payload);
});

test('rejects unsupported kind', () => {
  assert.throws(() => parseAlertWebhook({ ...validPayload, kind: 'UPDATE' }));
});

test('rejects unsupported status', () => {
  assert.throws(() =>
    parseAlertWebhook({
      ...validPayload,
      incident: { ...validPayload.incident, status: 'ACKNOWLEDGED' },
    }),
  );
});

test('rejects invalid reminderCount', () => {
  assert.throws(() =>
    parseAlertWebhook({
      ...validPayload,
      incident: { ...validPayload.incident, reminderCount: -1 },
    }),
  );
});

test('accepts RESOLVED notification only with RESOLVED status and resolvedAt', () => {
  const payload = {
    ...validPayload,
    kind: 'RESOLVED',
    incident: {
      ...validPayload.incident,
      status: 'RESOLVED',
      resolvedAt: '2026-08-17T02:17:30.000Z',
    },
  };
  assert.deepEqual(parseAlertWebhook(payload), payload);
});

test('rejects RESOLVED kind with OPEN status', () => {
  assert.throws(() =>
    parseAlertWebhook({
      ...validPayload,
      kind: 'RESOLVED',
      incident: {
        ...validPayload.incident,
        resolvedAt: '2026-08-17T02:17:30.000Z',
      },
    }),
  );
});
