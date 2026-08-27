import type { AlertSource } from '../../shared/types/alert-source.js';

export interface TelegramTopics {
  NOMAD: number;
  CONSUL: number;
  MINIO: number;
  SSL?: number;
}

export class TelegramTopicRouter {
  constructor(private readonly topics: TelegramTopics) {}

  resolve(source: AlertSource): number {
    const topicId = this.topics[source];
    if (topicId === undefined) {
      throw new Error(`Telegram topic is not configured for source ${source}`);
    }
    return topicId;
  }
}
