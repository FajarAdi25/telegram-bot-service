import { TelegramActionSessionRepository } from '../../repositories/telegram-action-session.repository.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { parseAlertCallback } from './telegram-callback.js';
import { TelegramClient } from './telegram.client.js';
import { toUserIdentity, type TelegramUpdate } from './telegram.types.js';

export class TelegramCallbackService {
  constructor(
    private readonly actionSessionRepository: TelegramActionSessionRepository,
    private readonly telegramClient: TelegramClient,
  ) {}

  async handle(update: TelegramUpdate): Promise<void> {
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;

    try {
      if (!callbackQuery.data) {
        throw new HttpError(400, 'Callback query data is required');
      }

      const callback = parseAlertCallback(callbackQuery.data);
      const user = toUserIdentity(callbackQuery.from);
      const message = callbackQuery.message;

      if (!message || message.message_thread_id === undefined) {
        throw new HttpError(400, 'Action requires a Telegram topic message');
      }

      if (callback.action === 'ack') {
        const prompt = await this.telegramClient.sendMessage({
          chatId: String(message.chat.id),
          topicId: message.message_thread_id,
          text: [
            '<b>Acknowledge Incident</b>',
            `Incident: <code>${escapeHtml(callback.incidentId)}</code>`,
            '',
            'Masukkan note ACK.',
            'Balas <code>-</code> jika tidak ingin mengisi note.',
          ].join('\n'),
          replyToMessageId: message.message_id,
          forceReply: true,
        });

        await this.actionSessionRepository.deleteForUserIncidentAction(
          user.id,
          callback.incidentId,
          'ACK',
        );
        await this.actionSessionRepository.save({
          userId: user.id,
          incidentId: callback.incidentId,
          action: 'ACK',
          stage: 'ACK_NOTE',
          chatId: String(message.chat.id),
          topicId: message.message_thread_id,
          sourceMessageId: message.message_id,
          promptMessageId: prompt.message_id,
        });

        await this.telegramClient.answerCallbackQuery(
          callbackQuery.id,
          'Masukkan note ACK',
        );
        return;
      }

      const prompt = await this.telegramClient.sendMessage({
        chatId: String(message.chat.id),
        topicId: message.message_thread_id,
        text: [
          '<b>Postpone Incident</b>',
          `Incident: <code>${escapeHtml(callback.incidentId)}</code>`,
          '',
          'Masukkan waktu absolut:',
          '<code>DD-MM-YYYY HH:mm</code>',
          'Timezone: Asia/Jakarta (WIB)',
          '',
          'Contoh: <code>18-08-2026 20:30</code>',
        ].join('\n'),
        replyToMessageId: message.message_id,
        forceReply: true,
      });

      await this.actionSessionRepository.deleteForUserIncidentAction(
        user.id,
        callback.incidentId,
        'POSTPONE',
      );
      await this.actionSessionRepository.save({
        userId: user.id,
        incidentId: callback.incidentId,
        action: 'POSTPONE',
        stage: 'POSTPONE_TIME',
        chatId: String(message.chat.id),
        topicId: message.message_thread_id,
        sourceMessageId: message.message_id,
        promptMessageId: prompt.message_id,
      });

      await this.telegramClient.answerCallbackQuery(
        callbackQuery.id,
        'Masukkan waktu postpone',
      );
    } catch (error) {
      const message = callbackErrorMessage(error);
      try {
        await this.telegramClient.answerCallbackQuery(callbackQuery.id, message);
      } catch (answerError) {
        console.error('Failed to answer Telegram callback query', answerError);
      }
    }
  }
}

function callbackErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message.slice(0, 180);
  console.error(error);
  return 'Action gagal diproses';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
