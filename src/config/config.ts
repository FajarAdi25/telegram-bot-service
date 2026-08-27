function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() ?? fallback;
}

function numberValue(name: string, fallback?: number): number {
  const raw = process.env[name]?.trim();
  if (!raw && fallback !== undefined) return fallback;
  if (!raw) throw new Error(`Missing required environment variable: ${name}`);

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return value;
}

function optionalNumberValue(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return value;
}

function portValue(name: string, fallback: number): number {
  const value = numberValue(name, fallback);
  if (value <= 0 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

export interface AppConfig {
  appVersion: string;
  port: number;
  telegram: {
    botToken: string;
    chatId: string;
    topics: {
      NOMAD: number;
      CONSUL: number;
      MINIO: number;
      SSL?: number;
    };
  };
  monitoringService: {
    baseUrl: string;
    username: string;
    password: string;
  };
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
  };
}

export function loadConfig(): AppConfig {
  return {
    appVersion: optional('APP_VERSION', '1.3.0'),
    port: portValue('PORT', 3001),
    telegram: {
      botToken: required('TELEGRAM_BOT_TOKEN'),
      chatId: required('TELEGRAM_CHAT_ID'),
      topics: {
        NOMAD: numberValue('TELEGRAM_TOPIC_NOMAD_ID'),
        CONSUL: numberValue('TELEGRAM_TOPIC_CONSUL_ID'),
        MINIO: numberValue('TELEGRAM_TOPIC_MINIO_ID'),
        SSL: optionalNumberValue('TELEGRAM_TOPIC_SSL_ID'),
      },
    },
    monitoringService: {
      baseUrl: required('MONITORING_SERVICE_BASE_URL').replace(/\/$/, ''),
      username: required('MONITORING_AUTH_USERNAME'),
      password: required('MONITORING_AUTH_PASSWORD'),
    },
    mysql: {
      host: required('MYSQL_HOST'),
      port: portValue('MYSQL_PORT', 3306),
      user: required('MYSQL_USER'),
      password: optional('MYSQL_PASSWORD'),
      database: required('MYSQL_DATABASE'),
      connectionLimit: numberValue('MYSQL_CONNECTION_LIMIT', 10),
    },
  };
}
