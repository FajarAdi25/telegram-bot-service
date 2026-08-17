import { WebhookDeliveryRepository } from '../../repositories/webhook-delivery.repository.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { AlertController } from './alert.controller.js';
import { AlertService } from './alert.service.js';

export function createAlertModule(
  webhookRepository: WebhookDeliveryRepository,
  telegramService: TelegramService,
) {
  const service = new AlertService(webhookRepository, telegramService);
  const controller = new AlertController(service);
  return { service, controller };
}
