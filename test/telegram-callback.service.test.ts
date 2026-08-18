import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramCallbackService } from '../src/modules/telegram/telegram-callback.service.js';

test('ACK asks for note with Force Reply and persists ACK_NOTE session', async () => {
  let promptInput: any;
  let saved: any;
  let deleted: any;
  let answered: any;

  const sessions = {
    async deleteForUserIncidentAction(userId: string, incidentId: string, action: string) {
      deleted = { userId, incidentId, action };
    },
    async save(value: unknown) { saved = value; },
  };
  const telegram = {
    async sendMessage(input: unknown) {
      promptInput = input;
      return { message_id: 55 };
    },
    async answerCallbackQuery(id: string, text: string) {
      answered = { id, text };
    },
  };

  const service = new TelegramCallbackService(sessions as never, telegram as never);

  await service.handle({
    update_id: 1,
    callback_query: {
      id: 'cb-1',
      data: 'ack:INC-001',
      from: {
        id: 5405675168,
        first_name: 'Fajar',
        last_name: 'Adipras',
        username: 'fajaradipras',
      },
      message: {
        message_id: 10,
        message_thread_id: 2,
        chat: { id: -1004474327429, type: 'supergroup' },
      },
    },
  });

  assert.equal(promptInput.forceReply, true);
  assert.match(promptInput.text, /Masukkan note ACK/);
  assert.deepEqual(deleted, {
    userId: '5405675168',
    incidentId: 'INC-001',
    action: 'ACK',
  });
  assert.deepEqual(saved, {
    userId: '5405675168',
    incidentId: 'INC-001',
    action: 'ACK',
    stage: 'ACK_NOTE',
    chatId: '-1004474327429',
    topicId: 2,
    sourceMessageId: 10,
    promptMessageId: 55,
  });
  assert.deepEqual(answered, { id: 'cb-1', text: 'Masukkan note ACK' });
});

test('POSTPONE first asks for absolute time and persists POSTPONE_TIME session', async () => {
  let promptInput: any;
  let saved: any;

  const sessions = {
    async deleteForUserIncidentAction() {},
    async save(value: unknown) { saved = value; },
  };
  const telegram = {
    async sendMessage(input: unknown) {
      promptInput = input;
      return { message_id: 56 };
    },
    async answerCallbackQuery() {},
  };

  const service = new TelegramCallbackService(sessions as never, telegram as never);

  await service.handle({
    update_id: 2,
    callback_query: {
      id: 'cb-2',
      data: 'postpone:INC-002',
      from: { id: 123, first_name: 'Operator' },
      message: {
        message_id: 20,
        message_thread_id: 4,
        chat: { id: -1004474327429, type: 'supergroup' },
      },
    },
  });

  assert.equal(promptInput.forceReply, true);
  assert.match(promptInput.text, /DD-MM-YYYY HH:mm/);
  assert.deepEqual(saved, {
    userId: '123',
    incidentId: 'INC-002',
    action: 'POSTPONE',
    stage: 'POSTPONE_TIME',
    chatId: '-1004474327429',
    topicId: 4,
    sourceMessageId: 20,
    promptMessageId: 56,
  });
});
