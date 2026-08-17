import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface PostponeSession {
  id: number;
  userId: string;
  incidentId: string;
  chatId: string;
  topicId: number;
  promptMessageId: number;
}

export interface NewPostponeSession {
  userId: string;
  incidentId: string;
  chatId: string;
  topicId: number;
  promptMessageId: number;
}

interface PostponeSessionRow extends RowDataPacket {
  id: number;
  user_id: string;
  incident_id: string;
  chat_id: string;
  topic_id: number;
  prompt_message_id: number;
}

export class PostponeSessionRepository {
  constructor(private readonly pool: Pool) {}

  async save(session: NewPostponeSession): Promise<void> {
    await this.pool.execute(
      `INSERT INTO postpone_sessions
        (user_id, incident_id, chat_id, topic_id, prompt_message_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE incident_id = VALUES(incident_id)`,
      [
        session.userId,
        session.incidentId,
        session.chatId,
        session.topicId,
        session.promptMessageId,
      ],
    );
  }

  async findForReply(
    userId: string,
    chatId: string,
    topicId: number,
    promptMessageId: number,
  ): Promise<PostponeSession | null> {
    const [rows] = await this.pool.execute<PostponeSessionRow[]>(
      `SELECT id, user_id, incident_id, chat_id, topic_id, prompt_message_id
       FROM postpone_sessions
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
      chatId: row.chat_id,
      topicId: Number(row.topic_id),
      promptMessageId: Number(row.prompt_message_id),
    };
  }

  async deleteById(id: number): Promise<void> {
    await this.pool.execute(`DELETE FROM postpone_sessions WHERE id = ?`, [id]);
  }
}
