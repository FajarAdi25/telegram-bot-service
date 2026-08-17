import type { Pool } from 'mysql2/promise';
import { MonitoringServiceClient } from '../../clients/monitoring-service.client.js';
import type { AppConfig } from '../../config/config.js';
import { IncidentStateRepository } from '../../repositories/incident-state.repository.js';
import { PostponeSessionRepository } from '../../repositories/postpone-session.repository.js';
import { PostponeInputService } from '../postpone/postpone-input.service.js';
import { TelegramCallbackService } from './telegram-callback.service.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramClient } from './telegram.client.js';
import { TelegramService } from './telegram.service.js';
import { TelegramTopicRouter } from './telegram-topic-router.js';

export function createTelegramModule(config: AppConfig, pool: Pool) {
  const telegramClient = new TelegramClient(config.telegram.botToken);
  const topicRouter = new TelegramTopicRouter(config.telegram.topics);
  const monitoringServiceClient = new MonitoringServiceClient(config.monitoringService);
  const incidentStateRepository = new IncidentStateRepository(pool);
  const postponeSessionRepository = new PostponeSessionRepository(pool);

  const service = new TelegramService(
    telegramClient,
    topicRouter,
    incidentStateRepository,
    config.telegram.chatId,
  );

  const callbackService = new TelegramCallbackService(
    monitoringServiceClient,
    incidentStateRepository,
    postponeSessionRepository,
    telegramClient,
  );

  const postponeInputService = new PostponeInputService(
    monitoringServiceClient,
    postponeSessionRepository,
    telegramClient,
  );

  const controller = new TelegramController(callbackService, postponeInputService);

  return {
    service,
    callbackService,
    postponeInputService,
    controller,
  };
}
