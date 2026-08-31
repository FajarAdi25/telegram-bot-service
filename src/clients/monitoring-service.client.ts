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

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface AcknowledgeResponse {
  success: true;
  data: {
    id: string;
    status: 'OPEN' | 'RESOLVED';
    acknowledged: boolean;
    acknowledgedAt?: string;
    acknowledgedBy?: {
      id: string | number;
      name: string;
      username?: string;
    };
    acknowledgementNote?: string | null;
  };
}

interface PostponeResponse {
  success: true;
  data: {
    id: string;
    status: 'OPEN';
    postponed: boolean;
    postponedAt?: string;
    postponedBy?: {
      id: string | number;
      name: string;
      username?: string;
    };
    postponeUntil: string;
    postponeRemark?: string | null;
    nextNotificationAt?: string;
  };
}

type QueryValue = string | number | boolean | undefined;
type QueryParams = Record<string, QueryValue>;

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
    note?: string,
  ): Promise<AcknowledgeResponse['data']> {
    const response = await this.post<AcknowledgeResponse>(
      `/api/v1/incidents/${encodeURIComponent(incidentId)}/acknowledge`,
      {
        user,
        ...(note ? { note } : {}),
      },
    );
    return response.data;
  }

  async postponeIncident(
    incidentId: string,
    user: TelegramUserIdentity,
    postponeUntil: string,
    remark?: string,
  ): Promise<PostponeResponse['data']> {
    const response = await this.post<PostponeResponse>(
      `/api/v1/incidents/${encodeURIComponent(incidentId)}/postpone`,
      {
        user,
        postponeUntil,
        ...(remark ? { remark } : {}),
      },
    );
    return response.data;
  }

  async listIncidents(query: QueryParams = {}): Promise<unknown> {
    return this.getData('/api/v1/incidents', query);
  }

  async getIncident(incidentId: string): Promise<unknown> {
    return this.getData(`/api/v1/incidents/${encodeURIComponent(incidentId)}`);
  }

  async getDashboardOverview(query: QueryParams = {}): Promise<unknown> {
    return this.getData('/api/v1/dashboard/overview', query);
  }

  async getDashboardHealth(query: QueryParams = {}): Promise<unknown> {
    return this.getData('/api/v1/dashboard/health', query);
  }

  async getNomadNodes(cluster?: string): Promise<unknown> {
    return this.getData('/api/v1/nomad/nodes', { cluster });
  }

  async getNomadNode(nodeId: string, cluster?: string): Promise<unknown> {
    return this.getData(`/api/v1/nomad/nodes/${encodeURIComponent(nodeId)}`, { cluster });
  }

  async getNomadAllocations(cluster?: string): Promise<unknown> {
    return this.getData('/api/v1/nomad/allocations', { cluster });
  }

  async getFailedNomadAllocations(cluster?: string): Promise<unknown> {
    return this.getData('/api/v1/nomad/allocations/failed', { cluster });
  }

  async getNomadAllocation(allocationId: string, cluster?: string): Promise<unknown> {
    return this.getData(
      `/api/v1/nomad/allocations/${encodeURIComponent(allocationId)}`,
      { cluster },
    );
  }

  async getBlockedNomadEvaluations(cluster?: string): Promise<unknown> {
    return this.getData('/api/v1/nomad/evaluations/blocked', { cluster });
  }

  async getMonitoringCurrent(query: QueryParams = {}): Promise<unknown> {
    return this.getData('/api/v1/monitoring/current', query);
  }

  async getSslMonitoring(): Promise<unknown> {
    return this.getData('/api/v1/monitoring/ssl');
  }

  private async getData(path: string, query: QueryParams = {}): Promise<unknown> {
    const response = await this.get<SuccessEnvelope<unknown>>(path, query);
    return response.data;
  }

  private async get<T>(path: string, query: QueryParams = {}): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    return this.parseResponse<T>(response);
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

    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
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
