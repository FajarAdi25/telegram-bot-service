export const telegramActionSessionMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS telegram_action_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(32) NOT NULL,
    incident_id VARCHAR(128) NOT NULL,
    action ENUM('ACK','POSTPONE') NOT NULL,
    stage ENUM('ACK_NOTE','POSTPONE_TIME','POSTPONE_REMARK') NOT NULL,
    chat_id VARCHAR(64) NOT NULL,
    topic_id BIGINT NOT NULL,
    source_message_id BIGINT NOT NULL,
    prompt_message_id BIGINT NOT NULL,
    postpone_until VARCHAR(64) NULL,
    postpone_display VARCHAR(64) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_telegram_action_sessions_user_prompt (user_id, prompt_message_id),
    KEY idx_telegram_action_sessions_lookup (user_id, chat_id, topic_id, prompt_message_id),
    KEY idx_telegram_action_sessions_incident (incident_id, action)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
] as const;
