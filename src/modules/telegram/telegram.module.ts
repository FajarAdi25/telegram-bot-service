import type { Pool } from 'mysql2/promise';
import { GroqClient } from '../../clients/groq.client.js';
import { MonitoringServiceClient } from '../../clients/monitoring-service.client.js';
import type { AppConfig } from '../../config/config.js';
import { IncidentStateRepository } from '../../repositories/incident-state.repository.js';
import { TelegramActionSessionRepository } from '../../repositories/telegram-action-session.repository.js';
import { QuickChatService } from '../quick-chat/quick-chat.service.js';
import { TelegramActionInputService } from './telegram-action-input.service.js';
import { TelegramCallbackService } from './telegram-callback.service.js';
import { TelegramClient } from './telegram.client.js';
import { TelegramPollingService } from './telegram-polling.service.js';
import { TelegramService } from './telegram.service.js';
import { TelegramTopicRouter } from './telegram-topic-router.js';

export function createTelegramModule(config: AppConfig, pool: Pool) {
  const telegramClient = new TelegramClient(config.telegram.botToken);
  const topicRouter = new TelegramTopicRouter(config.telegram.topics);
  const monitoringServiceClient = new MonitoringServiceClient(config.monitoringService);
  const groqClient = new GroqClient(config.groq);
  const incidentStateRepository = new IncidentStateRepository(pool);
  const actionSessionRepository = new TelegramActionSessionRepository(pool);

  const service = new TelegramService(
    telegramClient,
    topicRouter,
    incidentStateRepository,
    config.telegram.chatId,
  );

  const callbackService = new TelegramCallbackService(
    actionSessionRepository,
    telegramClient,
  );

  const actionInputService = new TelegramActionInputService(
    monitoringServiceClient,
    incidentStateRepository,
    actionSessionRepository,
    telegramClient,
  );

  const quickChatService = new QuickChatService(
    groqClient,
    monitoringServiceClient,
    telegramClient,
  );

  const pollingService = new TelegramPollingService(
    telegramClient,
    callbackService,
    actionInputService,
    quickChatService,
  );

  return {
    service,
    callbackService,
    actionInputService,
    quickChatService,
    pollingService,
  };
}
