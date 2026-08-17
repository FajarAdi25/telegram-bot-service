import {
  MonitoringServiceClient,
  MonitoringServiceError,
} from '../../clients/monitoring-service.client.js';
import { IncidentStateRepository } from '../../repositories/incident-state.repository.js';
import { PostponeSessionRepository } from '../../repositories/postpone-session.repository.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { parseAlertCallback } from './telegram-callback.js';
import { TelegramClient } from './telegram.client.js';
import { toUserIdentity, type TelegramUpdate } from './telegram.types.js';

export class TelegramCallbackService {
  constructor(
    private readonly monitoringServiceClient: MonitoringServiceClient,
    private readonly incidentStateRepository: IncidentStateRepository,
    private readonly postponeSessionRepository: PostponeSessionRepository,
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

      if (callback.action === 'ack') {
        const result = await this.monitoringServiceClient.acknowledgeIncident(
          callback.incidentId,
          user,
        );

        await this.incidentStateRepository.markAcknowledged(callback.incidentId, user);

        if (callbackQuery.message) {
          const buttons =
            result.status === 'OPEN'
              ? [{ text: 'Postpone', callback_data: `postpone:${callback.incidentId}` }]
              : [];
          await this.telegramClient.editMessageButtons(
            String(callbackQuery.message.chat.id),
            callbackQuery.message.message_id,
            buttons,
          );
        }

        await this.telegramClient.answerCallbackQuery(
          callbackQuery.id,
          'Incident acknowledged',
        );
        return;
      }

      const message = callbackQuery.message;
      if (!message || message.message_thread_id === undefined) {
        throw new HttpError(400, 'Postpone action requires a Telegram topic message');
      }

      const prompt = await this.telegramClient.sendMessage({
        chatId: String(message.chat.id),
        topicId: message.message_thread_id,
        text: [
          '<b>Postpone Incident</b>',
          `Incident: <code>${escapeHtml(callback.incidentId)}</code>`,
          '',
          'Balas pesan ini dengan waktu absolut:',
          '<code>DD-MM-YYYY HH:mm</code>',
          'Timezone: Asia/Jakarta (WIB)',
          '',
          'Contoh: <code>17-08-2026 13:30</code>',
        ].join('\n'),
        replyToMessageId: message.message_id,
        forceReply: true,
      });

      await this.postponeSessionRepository.save({
        userId: user.id,
        incidentId: callback.incidentId,
        chatId: String(message.chat.id),
        topicId: message.message_thread_id,
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
  if (error instanceof MonitoringServiceError) {
    if (error.code === 'INCIDENT_NOT_FOUND') return 'Incident tidak ditemukan';
    if (error.code === 'INCIDENT_NOT_OPEN') return 'Incident sudah tidak OPEN';
    if (error.code === 'UNAUTHORIZED_SERVICE') return 'Service authentication gagal';
    return error.message.slice(0, 180);
  }
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
