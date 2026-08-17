import { WebhookDeliveryRepository } from '../../repositories/webhook-delivery.repository.js';
import { TelegramService } from '../telegram/telegram.service.js';
import type { AlertWebhookDto } from './dto/alert-webhook.dto.js';

export class AlertService {
  constructor(
    private readonly webhookRepository: WebhookDeliveryRepository,
    private readonly telegramService: TelegramService,
  ) {}

  async process(alert: AlertWebhookDto): Promise<{ duplicate: boolean }> {
    const reserved = await this.webhookRepository.reserve(alert);
    if (!reserved) return { duplicate: true };

    try {
      await this.telegramService.sendAlert(alert);
      await this.webhookRepository.markSent(alert);
      return { duplicate: false };
    } catch (error) {
      try {
        await this.webhookRepository.markFailed(alert, error);
      } catch (markError) {
        console.error('Failed to persist webhook delivery failure', markError);
      }
      throw error;
    }
  }
}
