import { IncidentStateRepository } from '../../repositories/incident-state.repository.js';
import type { AlertWebhookDto } from '../alert/dto/alert-webhook.dto.js';
import { formatAlertMessage } from './alert-message.formatter.js';
import { TelegramClient } from './telegram.client.js';
import { TelegramTopicRouter } from './telegram-topic-router.js';
import type { TelegramInlineButton } from './telegram.types.js';

export class TelegramService {
  constructor(
    private readonly client: TelegramClient,
    private readonly topicRouter: TelegramTopicRouter,
    private readonly incidentStateRepository: IncidentStateRepository,
    private readonly chatId: string,
  ) {}

  async sendAlert(payload: AlertWebhookDto): Promise<void> {
    const { incident } = payload;
    const topicId = this.topicRouter.resolve(incident.source);
    const buttons = await this.buildButtons(payload);

    await this.client.sendMessage({
      chatId: this.chatId,
      topicId,
      text: formatAlertMessage(payload),
      buttons,
    });
  }

  private async buildButtons(payload: AlertWebhookDto): Promise<TelegramInlineButton[]> {
    const { incident } = payload;
    if (payload.kind === 'RESOLVED' || incident.status !== 'OPEN') return [];

    const acknowledged = await this.incidentStateRepository.isAcknowledged(incident.id);
    const buttons: TelegramInlineButton[] = [];

    if (!acknowledged) {
      buttons.push({ text: 'Acknowledge', callback_data: `ack:${incident.id}` });
    }

    buttons.push({ text: 'Postpone', callback_data: `postpone:${incident.id}` });
    return buttons;
  }
}
