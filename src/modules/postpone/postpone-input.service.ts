import {
  MonitoringServiceClient,
  MonitoringServiceError,
} from '../../clients/monitoring-service.client.js';
import { PostponeSessionRepository } from '../../repositories/postpone-session.repository.js';
import { HttpError } from '../../shared/errors/http-error.js';
import { TelegramClient } from '../telegram/telegram.client.js';
import { toUserIdentity, type TelegramMessage } from '../telegram/telegram.types.js';
import { parsePostponeTime } from './postpone-time.parser.js';

export class PostponeInputService {
  constructor(
    private readonly monitoringServiceClient: MonitoringServiceClient,
    private readonly postponeSessionRepository: PostponeSessionRepository,
    private readonly telegramClient: TelegramClient,
  ) {}

  async handle(message: TelegramMessage): Promise<void> {
    if (
      !message.from ||
      !message.text ||
      message.message_thread_id === undefined ||
      message.reply_to_message?.message_id === undefined
    ) {
      return;
    }

    const user = toUserIdentity(message.from);
    const session = await this.postponeSessionRepository.findForReply(
      user.id,
      String(message.chat.id),
      message.message_thread_id,
      message.reply_to_message.message_id,
    );
    if (!session) return;

    try {
      const parsed = parsePostponeTime(message.text);
      const result = await this.monitoringServiceClient.postponeIncident(
        session.incidentId,
        user,
        parsed.iso,
      );

      await this.postponeSessionRepository.deleteById(session.id);
      await this.telegramClient.sendMessage({
        chatId: session.chatId,
        topicId: session.topicId,
        text: [
          '<b>Incident postponed</b>',
          `Incident: <code>${escapeHtml(session.incidentId)}</code>`,
          `Until: <code>${escapeHtml(parsed.display)}</code>`,
          `Monitoring Service: <code>${escapeHtml(result.postponeUntil)}</code>`,
        ].join('\n'),
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      if (error instanceof MonitoringServiceError && error.code === 'INCIDENT_NOT_OPEN') {
        await this.postponeSessionRepository.deleteById(session.id);
      }

      const text = postponeErrorMessage(error);
      await this.telegramClient.sendMessage({
        chatId: session.chatId,
        topicId: session.topicId,
        text,
        replyToMessageId: message.message_id,
      });
    }
  }
}

function postponeErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    return `${escapeHtml(error.message)}\nFormat: <code>DD-MM-YYYY HH:mm</code> (Asia/Jakarta)`;
  }

  if (error instanceof MonitoringServiceError) {
    if (error.code === 'INVALID_POSTPONE_UNTIL') {
      return 'Waktu postpone ditolak Monitoring Service. Pastikan waktunya masih di masa depan.';
    }
    if (error.code === 'INCIDENT_NOT_OPEN') return 'Incident sudah tidak OPEN.';
    if (error.code === 'INCIDENT_NOT_FOUND') return 'Incident tidak ditemukan.';
    if (error.code === 'UNAUTHORIZED_SERVICE') return 'Service authentication gagal.';
    return escapeHtml(error.message);
  }

  console.error(error);
  return 'POSTPONE gagal diproses.';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
