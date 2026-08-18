import type { Pool, RowDataPacket } from 'mysql2/promise';

export type TelegramAction = 'ACK' | 'POSTPONE';
export type TelegramActionStage = 'ACK_NOTE' | 'POSTPONE_TIME' | 'POSTPONE_REMARK';

export interface TelegramActionSession {
  id: number;
  userId: string;
  incidentId: string;
  action: TelegramAction;
  stage: TelegramActionStage;
  chatId: string;
  topicId: number;
  sourceMessageId: number;
  promptMessageId: number;
  postponeUntil?: string;
  postponeDisplay?: string;
}

export interface NewTelegramActionSession {
  userId: string;
  incidentId: string;
  action: TelegramAction;
  stage: TelegramActionStage;
  chatId: string;
  topicId: number;
  sourceMessageId: number;
  promptMessageId: number;
  postponeUntil?: string;
  postponeDisplay?: string;
}

interface TelegramActionSessionRow extends RowDataPacket {
  id: number;
  user_id: string;
  incident_id: string;
  action: TelegramAction;
  stage: TelegramActionStage;
  chat_id: string;
  topic_id: number;
  source_message_id: number;
  prompt_message_id: number;
  postpone_until: string | null;
  postpone_display: string | null;
}

export class TelegramActionSessionRepository {
  constructor(private readonly pool: Pool) {}

  async save(session: NewTelegramActionSession): Promise<void> {
    await this.pool.execute(
      `INSERT INTO telegram_action_sessions
        (user_id, incident_id, action, stage, chat_id, topic_id,
         source_message_id, prompt_message_id, postpone_until, postpone_display)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.userId,
        session.incidentId,
        session.action,
        session.stage,
        session.chatId,
        session.topicId,
        session.sourceMessageId,
        session.promptMessageId,
        session.postponeUntil ?? null,
        session.postponeDisplay ?? null,
      ],
    );
  }

  async findForReply(
    userId: string,
    chatId: string,
    topicId: number,
    promptMessageId: number,
  ): Promise<TelegramActionSession | null> {
    const [rows] = await this.pool.execute<TelegramActionSessionRow[]>(
      `SELECT id, user_id, incident_id, action, stage, chat_id, topic_id,
              source_message_id, prompt_message_id, postpone_until, postpone_display
       FROM telegram_action_sessions
       WHERE user_id = ? AND chat_id = ? AND topic_id = ? AND prompt_message_id = ?
       LIMIT 1`,
      [userId, chatId, topicId, promptMessageId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      userId: row.user_id,
      incidentId: row.incident_id,
      action: row.action,
      stage: row.stage,
      chatId: row.chat_id,
      topicId: Number(row.topic_id),
      sourceMessageId: Number(row.source_message_id),
      promptMessageId: Number(row.prompt_message_id),
      ...(row.postpone_until ? { postponeUntil: row.postpone_until } : {}),
      ...(row.postpone_display ? { postponeDisplay: row.postpone_display } : {}),
    };
  }

  async replacePrompt(
    id: number,
    stage: TelegramActionStage,
    promptMessageId: number,
    postponeUntil?: string,
    postponeDisplay?: string,
  ): Promise<void> {
    await this.pool.execute(
      `UPDATE telegram_action_sessions
       SET stage = ?, prompt_message_id = ?, postpone_until = ?, postpone_display = ?
       WHERE id = ?`,
      [stage, promptMessageId, postponeUntil ?? null, postponeDisplay ?? null, id],
    );
  }

  async deleteForUserIncidentAction(
    userId: string,
    incidentId: string,
    action: TelegramAction,
  ): Promise<void> {
    await this.pool.execute(
      `DELETE FROM telegram_action_sessions WHERE user_id = ? AND incident_id = ? AND action = ?`,
      [userId, incidentId, action],
    );
  }

  async deleteById(id: number): Promise<void> {
    await this.pool.execute(`DELETE FROM telegram_action_sessions WHERE id = ?`, [id]);
  }
}
