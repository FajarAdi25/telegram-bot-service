export const initialMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dedup_key VARCHAR(255) NOT NULL,
    incident_id VARCHAR(128) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    reminder_count INT UNSIGNED NOT NULL,
    payload JSON NOT NULL,
    status ENUM('PROCESSING','SENT','FAILED') NOT NULL DEFAULT 'PROCESSING',
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    processing_started_at DATETIME(3) NULL,
    processed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_webhook_deliveries_dedup_key (dedup_key),
    KEY idx_webhook_deliveries_status_id (status, id),
    KEY idx_webhook_deliveries_incident_id (incident_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS incident_states (
    incident_id VARCHAR(128) NOT NULL,
    acknowledged TINYINT(1) NOT NULL DEFAULT 0,
    acknowledged_at DATETIME(3) NULL,
    acknowledged_by_user_id VARCHAR(32) NULL,
    acknowledged_by_name VARCHAR(255) NULL,
    acknowledged_by_username VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (incident_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS postpone_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(32) NOT NULL,
    incident_id VARCHAR(128) NOT NULL,
    chat_id VARCHAR(64) NOT NULL,
    topic_id BIGINT NOT NULL,
    prompt_message_id BIGINT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_postpone_sessions_user_prompt (user_id, prompt_message_id),
    KEY idx_postpone_sessions_lookup (user_id, chat_id, topic_id, prompt_message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
] as const;
