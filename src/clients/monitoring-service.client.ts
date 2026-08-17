import type { TelegramUserIdentity } from '../modules/telegram/telegram.types.js';

interface MonitoringServiceClientConfig {
  baseUrl: string;
  username: string;
  password: string;
}

interface MonitoringErrorEnvelope {
  success?: false;
  error?: {
    code?: string;
    message?: string;
  };
}

interface AcknowledgeResponse {
  success: true;
  data: {
    id: string;
    status: 'OPEN' | 'RESOLVED';
    acknowledged: boolean;
  };
}

interface PostponeResponse {
  success: true;
  data: {
    id: string;
    status: 'OPEN';
    postponed: boolean;
    postponeUntil: string;
  };
}

export class MonitoringServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export class MonitoringServiceClient {
  private readonly authorization: string;

  constructor(private readonly config: MonitoringServiceClientConfig) {
    this.authorization = `Basic ${Buffer.from(
      `${config.username}:${config.password}`,
      'utf8',
    ).toString('base64')}`;
  }

  async acknowledgeIncident(
    incidentId: string,
    user: TelegramUserIdentity,
  ): Promise<AcknowledgeResponse['data']> {
    const response = await this.post<AcknowledgeResponse>(
      `/api/v1/incidents/${encodeURIComponent(incidentId)}/acknowledge`,
      { user },
    );
    return response.data;
  }

  async postponeIncident(
    incidentId: string,
    user: TelegramUserIdentity,
    postponeUntil: string,
  ): Promise<PostponeResponse['data']> {
    const response = await this.post<PostponeResponse>(
      `/api/v1/incidents/${encodeURIComponent(incidentId)}/postpone`,
      { user, postponeUntil },
    );
    return response.data;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: this.authorization,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });

    const raw = await response.text();
    let parsed: unknown = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        parsed = { message: raw };
      }
    }

    if (!response.ok) {
      const envelope = parsed as MonitoringErrorEnvelope;
      throw new MonitoringServiceError(
        response.status,
        envelope.error?.code,
        envelope.error?.message ?? `Monitoring Service request failed (${response.status})`,
      );
    }

    return parsed as T;
  }
}
