import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { TelegramPollingService } from '../src/modules/telegram/telegram-polling.service.js';
import type { TelegramUpdate } from '../src/modules/telegram/telegram.types.js';

test('long polling removes webhook and dispatches callback_query and message updates', async () => {
  const offsets: Array<number | undefined> = [];
  let deleteWebhookDropPending: boolean | undefined;
  let calls = 0;

  const updates: TelegramUpdate[] = [
    {
      update_id: 100,
      callback_query: {
        id: 'cb-1',
        data: 'ack:INC-001',
        from: { id: 1, first_name: 'User' },
      },
    },
    {
      update_id: 101,
      message: {
        message_id: 10,
        from: { id: 1, first_name: 'User' },
        chat: { id: -1001, type: 'supergroup' },
        text: '18-08-2026 15:00',
      },
    },
  ];

  const telegramClient = {
    async deleteWebhook(dropPendingUpdates: boolean) {
      deleteWebhookDropPending = dropPendingUpdates;
    },
    async getUpdates(offset: number | undefined, _timeout: number, signal?: AbortSignal) {
      offsets.push(offset);
      calls += 1;
      if (calls === 1) return updates;

      return new Promise<TelegramUpdate[]>((resolve, reject) => {
        if (signal?.aborted) {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
          return;
        }
        signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  };

  const callbackUpdates: number[] = [];
  const messages: number[] = [];
  const callbackService = {
    async handle(update: TelegramUpdate) {
      callbackUpdates.push(update.update_id);
    },
  };
  const postponeInputService = {
    async handle(message: { message_id: number }) {
      messages.push(message.message_id);
    },
  };

  const polling = new TelegramPollingService(
    telegramClient as never,
    callbackService as never,
    postponeInputService as never,
  );

  await polling.start();

  for (let i = 0; i < 20 && calls < 2; i += 1) {
    await sleep(5);
  }

  await polling.stop();

  assert.equal(deleteWebhookDropPending, false);
  assert.deepEqual(callbackUpdates, [100]);
  assert.deepEqual(messages, [10]);
  assert.deepEqual(offsets.slice(0, 2), [undefined, 102]);
  assert.equal(polling.isRunning(), false);
});
