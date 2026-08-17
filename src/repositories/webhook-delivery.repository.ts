import type { Pool, ResultSetHeader } from 'mysql2/promise';
import type { AlertWebhookDto } from '../modules/alert/dto/alert-webhook.dto.js';

export class WebhookDeliveryRepository {
  constructor(private readonly pool: Pool) {}

  static dedupKey(payload: AlertWebhookDto): string {
    return `${payload.incident.id}|${payload.kind}|${payload.incident.reminderCount}`;
  }

  async reserve(payload: AlertWebhookDto): Promise<boolean> {
    const dedupKey = WebhookDeliveryRepository.dedupKey(payload);
    const serialized = JSON.stringify(payload);

    try {
      await this.pool.execute<ResultSetHeader>(
        `INSERT INTO webhook_deliveries
          (dedup_key, incident_id, kind, reminder_count, payload, status,
           attempt_count, processing_started_at)
         VALUES (?, ?, ?, ?, ?, 'PROCESSING', 1, CURRENT_TIMESTAMP(3))`,
        [
          dedupKey,
          payload.incident.id,
          payload.kind,
          payload.incident.reminderCount,
          serialized,
        ],
      );
      return true;
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
    }

    const [retryResult] = await this.pool.execute<ResultSetHeader>(
      `UPDATE webhook_deliveries
       SET status = 'PROCESSING', payload = ?, last_error = NULL,
           attempt_count = attempt_count + 1,
           processing_started_at = CURRENT_TIMESTAMP(3), processed_at = NULL
       WHERE dedup_key = ?
         AND (
           status = 'FAILED'
           OR (
             status = 'PROCESSING'
             AND processing_started_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 15 SECOND)
           )
         )`,
      [serialized, dedupKey],
    );

    return retryResult.affectedRows === 1;
  }

  async markSent(payload: AlertWebhookDto): Promise<void> {
    await this.pool.execute(
      `UPDATE webhook_deliveries
       SET status = 'SENT', processed_at = CURRENT_TIMESTAMP(3), last_error = NULL
       WHERE dedup_key = ?`,
      [WebhookDeliveryRepository.dedupKey(payload)],
    );
  }

  async markFailed(payload: AlertWebhookDto, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.pool.execute(
      `UPDATE webhook_deliveries
       SET status = 'FAILED', last_error = ?, processed_at = CURRENT_TIMESTAMP(3)
       WHERE dedup_key = ?`,
      [message.slice(0, 65535), WebhookDeliveryRepository.dedupKey(payload)],
    );
  }
}

function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  );
}
