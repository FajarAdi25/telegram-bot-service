import assert from 'node:assert/strict';
import test from 'node:test';
import { MonitoringServiceClient } from '../src/clients/monitoring-service.client.js';

const user = {
  id: '5405675168',
  name: 'Fajar Adipras',
  username: 'fajaradipras',
};

function mockFetch(
  handler: (input: string | URL | Request, init?: RequestInit) => Response | Promise<Response>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function client() {
  return new MonitoringServiceClient({
    baseUrl: 'http://localhost:3000',
    username: 'telegram-bot',
    password: 'secret',
  });
}

test('ACK uses Basic Auth, body.user and optional note', async () => {
  const restore = mockFetch(async (input, init) => {
    assert.equal(
      String(input),
      'http://localhost:3000/api/v1/incidents/INC-001/acknowledge',
    );
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.authorization, `Basic ${Buffer.from('telegram-bot:secret').toString('base64')}`);
    assert.deepEqual(JSON.parse(String(init?.body)), { user, note: 'Investigating' });

    return Response.json({
      success: true,
      data: { id: 'INC-001', status: 'OPEN', acknowledged: true },
    });
  });

  try {
    const result = await client().acknowledgeIncident('INC-001', user, 'Investigating');
    assert.equal(result.acknowledged, true);
  } finally {
    restore();
  }
});

test('POSTPONE uses expected endpoint, user, postponeUntil and optional remark', async () => {
  const restore = mockFetch(async (input, init) => {
    assert.equal(
      String(input),
      'http://localhost:3000/api/v1/incidents/INC-001/postpone',
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      user,
      postponeUntil: '2026-08-17T13:30:00+07:00',
      remark: 'Maintenance',
    });

    return Response.json({
      success: true,
      data: {
        id: 'INC-001',
        status: 'OPEN',
        postponed: true,
        postponeUntil: '2026-08-17T06:30:00.000Z',
      },
    });
  });

  try {
    const result = await client().postponeIncident(
      'INC-001',
      user,
      '2026-08-17T13:30:00+07:00',
      'Maintenance',
    );
    assert.equal(result.postponed, true);
  } finally {
    restore();
  }
});
