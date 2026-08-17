import type { AlertSource } from '../../shared/types/alert-source.js';

export interface TelegramTopics {
  NOMAD: number;
  CONSUL: number;
  MINIO: number;
}

export class TelegramTopicRouter {
  constructor(private readonly topics: TelegramTopics) {}

  resolve(source: AlertSource): number {
    return this.topics[source];
  }
}
