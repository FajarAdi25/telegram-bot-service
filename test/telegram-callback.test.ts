import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAlertCallback } from '../src/modules/telegram/telegram-callback.js';

test('parses acknowledge callback', () => {
  assert.deepEqual(parseAlertCallback('ack:incident-123'), {
    action: 'ack',
    incidentId: 'incident-123',
  });
});

test('parses postpone callback while preserving colons in incident id', () => {
  assert.deepEqual(parseAlertCallback('postpone:region:incident-123'), {
    action: 'postpone',
    incidentId: 'region:incident-123',
  });
});

test('rejects removed close action', () => {
  assert.throws(() => parseAlertCallback('close:incident-123'));
});
