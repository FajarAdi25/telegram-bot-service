import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { TelegramUserIdentity } from '../modules/telegram/telegram.types.js';

interface IncidentStateRow extends RowDataPacket {
  acknowledged: number;
}

export class IncidentStateRepository {
  constructor(private readonly pool: Pool) {}

  async isAcknowledged(incidentId: string): Promise<boolean> {
    const [rows] = await this.pool.execute<IncidentStateRow[]>(
      `SELECT acknowledged FROM incident_states WHERE incident_id = ? LIMIT 1`,
      [incidentId],
    );
    return rows[0]?.acknowledged === 1;
  }

  async markAcknowledged(
    incidentId: string,
    user: TelegramUserIdentity,
  ): Promise<void> {
    await this.pool.execute(
      `INSERT INTO incident_states
        (incident_id, acknowledged, acknowledged_at, acknowledged_by_user_id,
         acknowledged_by_name, acknowledged_by_username)
       VALUES (?, 1, CURRENT_TIMESTAMP(3), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         acknowledged = 1,
         acknowledged_at = COALESCE(acknowledged_at, VALUES(acknowledged_at)),
         acknowledged_by_user_id = COALESCE(acknowledged_by_user_id, VALUES(acknowledged_by_user_id)),
         acknowledged_by_name = COALESCE(acknowledged_by_name, VALUES(acknowledged_by_name)),
         acknowledged_by_username = COALESCE(acknowledged_by_username, VALUES(acknowledged_by_username))`,
      [incidentId, user.id, user.name, user.username ?? null],
    );
  }
}
