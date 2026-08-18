import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramActionInputService } from '../src/modules/telegram/telegram-action-input.service.js';

const telegramUser = {
  id: 5405675168,
  first_name: 'Fajar',
  username: 'fajarprstio',
};

function replyMessage(text: string, promptMessageId: number) {
  return {
    message_id: 99,
    message_thread_id: 2,
    from: telegramUser,
    chat: { id: -1004474327429, type: 'supergroup' },
    text,
    reply_to_message: { message_id: promptMessageId },
  };
}

test('ACK sends manual note, removes ACK button after success, and sends confirmation message', async () => {
  let ackRequest: any;
  let marked: any;
  let edited: any;
  const sent: any[] = [];

  const monitoring = {
    async acknowledgeIncident(incidentId: string, user: unknown, note?: string) {
      ackRequest = { incidentId, user, note };
      return {
        id: incidentId,
        status: 'OPEN',
        acknowledged: true,
        acknowledgementNote: note,
        acknowledgedBy: { id: '5405675168', name: 'Fajar', username: 'fajarprstio' },
      };
    },
  };
  const incidentState = {
    async markAcknowledged(incidentId: string, user: unknown) {
      marked = { incidentId, user };
    },
  };
  const sessions = {
    async findForReply() {
      return {
        id: 1,
        userId: '5405675168',
        incidentId: 'INC-001',
        action: 'ACK',
        stage: 'ACK_NOTE',
        chatId: '-1004474327429',
        topicId: 2,
        sourceMessageId: 10,
        promptMessageId: 50,
      };
    },
    async deleteById() {},
  };
  const telegram = {
    async editMessageButtons(chatId: string, messageId: number, buttons: unknown) {
      edited = { chatId, messageId, buttons };
    },
    async sendMessage(input: unknown) {
      sent.push(input);
      return { message_id: 70 };
    },
  };

  const service = new TelegramActionInputService(
    monitoring as never,
    incidentState as never,
    sessions as never,
    telegram as never,
  );

  await service.handle(replyMessage('Investigating issue', 50));

  assert.deepEqual(ackRequest, {
    incidentId: 'INC-001',
    user: { id: '5405675168', name: 'Fajar', username: 'fajarprstio' },
    note: 'Investigating issue',
  });
  assert.deepEqual(marked, {
    incidentId: 'INC-001',
    user: { id: '5405675168', name: 'Fajar', username: 'fajarprstio' },
  });
  assert.deepEqual(edited, {
    chatId: '-1004474327429',
    messageId: 10,
    buttons: [{ text: 'Postpone', callback_data: 'postpone:INC-001' }],
  });
  assert.match(sent[0].text, /ACK berhasil/);
  assert.match(sent[0].text, /Investigating issue/);
});

test('POSTPONE asks for remark after valid time, then sends remark and confirmation', async () => {
  let currentSession: any = {
    id: 2,
    userId: '5405675168',
    incidentId: 'INC-002',
    action: 'POSTPONE',
    stage: 'POSTPONE_TIME',
    chatId: '-1004474327429',
    topicId: 2,
    sourceMessageId: 11,
    promptMessageId: 60,
  };
  let postponeRequest: any;
  const sent: any[] = [];

  const monitoring = {
    async postponeIncident(incidentId: string, user: unknown, postponeUntil: string, remark?: string) {
      postponeRequest = { incidentId, user, postponeUntil, remark };
      return {
        id: incidentId,
        status: 'OPEN',
        postponed: true,
        postponeUntil,
        postponeRemark: remark,
        postponedBy: { id: '5405675168', name: 'Fajar', username: 'fajarprstio' },
      };
    },
  };
  const incidentState = { async markAcknowledged() {} };
  const sessions = {
    async findForReply(_userId: string, _chatId: string, _topicId: number, promptId: number) {
      return currentSession.promptMessageId === promptId ? { ...currentSession } : null;
    },
    async replacePrompt(
      _id: number,
      stage: string,
      promptMessageId: number,
      postponeUntil?: string,
      postponeDisplay?: string,
    ) {
      currentSession = {
        ...currentSession,
        stage,
        promptMessageId,
        postponeUntil,
        postponeDisplay,
      };
    },
    async deleteById() {},
  };
  const telegram = {
    async sendMessage(input: any) {
      sent.push(input);
      return { message_id: sent.length === 1 ? 61 : 62 };
    },
    async editMessageButtons() {},
  };

  const service = new TelegramActionInputService(
    monitoring as never,
    incidentState as never,
    sessions as never,
    telegram as never,
  );

  await service.handle(replyMessage('19-08-2026 11:30', 60));
  assert.equal(currentSession.stage, 'POSTPONE_REMARK');
  assert.equal(currentSession.promptMessageId, 61);
  assert.equal(currentSession.postponeUntil, '2026-08-19T11:30:00+07:00');
  assert.match(sent[0].text, /Masukkan remark POSTPONE/);

  await service.handle(replyMessage('Menunggu maintenance selesai', 61));

  assert.deepEqual(postponeRequest, {
    incidentId: 'INC-002',
    user: { id: '5405675168', name: 'Fajar', username: 'fajarprstio' },
    postponeUntil: '2026-08-19T11:30:00+07:00',
    remark: 'Menunggu maintenance selesai',
  });
  assert.match(sent[1].text, /POSTPONE berhasil/);
  assert.match(sent[1].text, /Menunggu maintenance selesai/);
});
