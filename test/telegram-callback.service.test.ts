import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramCallbackService } from '../src/modules/telegram/telegram-callback.service.js';

test('ACK forwards Telegram user identity and removes ACK button', async () => {
  let ackRequest: any;
  let marked: any;
  let edited: any;
  let answered: any;

  const monitoring = {
    async acknowledgeIncident(incidentId: string, user: unknown) {
      ackRequest = { incidentId, user };
      return { id: incidentId, status: 'OPEN', acknowledged: true };
    },
  };
  const incidentState = {
    async markAcknowledged(incidentId: string, user: unknown) {
      marked = { incidentId, user };
    },
  };
  const sessions = { async save() {} };
  const telegram = {
    async editMessageButtons(chatId: string, messageId: number, buttons: unknown) {
      edited = { chatId, messageId, buttons };
    },
    async answerCallbackQuery(id: string, text: string) {
      answered = { id, text };
    },
    async sendMessage() { return { message_id: 999 }; },
  };

  const service = new TelegramCallbackService(
    monitoring as never,
    incidentState as never,
    sessions as never,
    telegram as never,
  );

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

  assert.deepEqual(ackRequest, {
    incidentId: 'INC-001',
    user: {
      id: '5405675168',
      name: 'Fajar Adipras',
      username: 'fajaradipras',
    },
  });
  assert.deepEqual(marked, ackRequest);
  assert.deepEqual(edited, {
    chatId: '-1004474327429',
    messageId: 10,
    buttons: [{ text: 'Postpone', callback_data: 'postpone:INC-001' }],
  });
  assert.deepEqual(answered, { id: 'cb-1', text: 'Incident acknowledged' });
});

test('POSTPONE creates a Force Reply session in the same topic', async () => {
  let promptInput: any;
  let saved: any;

  const monitoring = { async acknowledgeIncident() { throw new Error('not used'); } };
  const incidentState = { async markAcknowledged() {} };
  const sessions = {
    async save(value: unknown) { saved = value; },
  };
  const telegram = {
    async sendMessage(input: unknown) {
      promptInput = input;
      return { message_id: 55 };
    },
    async answerCallbackQuery() {},
    async editMessageButtons() {},
  };

  const service = new TelegramCallbackService(
    monitoring as never,
    incidentState as never,
    sessions as never,
    telegram as never,
  );

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
  assert.equal(promptInput.topicId, 4);
  assert.deepEqual(saved, {
    userId: '123',
    incidentId: 'INC-002',
    chatId: '-1004474327429',
    topicId: 4,
    promptMessageId: 55,
  });
});
