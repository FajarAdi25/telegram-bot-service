import {
  GeminiApiError,
  GeminiClient,
  type GeminiFunctionTool,
} from '../../clients/gemini.client.js';
import {
  MonitoringServiceClient,
  MonitoringServiceError,
} from '../../clients/monitoring-service.client.js';
import { TelegramClient } from '../telegram/telegram.client.js';
import type { TelegramMessage } from '../telegram/telegram.types.js';

const SYSTEM_INSTRUCTION = `You are the read-only AI Quick Chat for an infrastructure monitoring Telegram bot.

Rules:
- Answer monitoring questions only from tool results. Never invent live monitoring data.
- Supported scope: incidents, server infrastructure summary, Nomad nodes, allocations, drivers, blocked evaluations, and SSL certificates.
- "server" means infrastructure summary: total/ready/down nodes, healthy/unhealthy drivers, running/failed allocations, blocked evaluations, and SSL totals/status.
- "blocked" is a condition/state of an EVALUATION, not a separate resource.
- Use the provided read-only tools for any question that asks about current monitoring state or resource details.
- Never request or execute ACK, POSTPONE, manual pull, restart, stop, delete, update, or any other write action.
- If the user asks outside the supported scope, state briefly that Quick Chat only supports incident, server, node, allocation, driver, eval blocked, and SSL monitoring.
- If a tool reports an error, explain the monitoring data could not be retrieved and include the relevant error message without inventing a result.
- Keep answers concise and operational. Include resource names/IDs and cluster/site when they are present and relevant.
- Answer in the same language as the user. Do not mention internal tool names or implementation details.`;

const QUICK_CHAT_TOOLS: GeminiFunctionTool[] = [
  {
    type: 'function',
    name: 'list_incidents',
    description:
      'Read incidents. Use for active/open incidents, resolved incidents, severity, source, type, acknowledgement, cluster, site, or resource filters.',
    parameters: {
      type: 'object',
      properties: {
        cluster: { type: 'string', description: 'Monitoring cluster ID.' },
        site: { type: 'string', description: 'Cluster site.' },
        source: { type: 'string', description: 'Incident source such as NOMAD or SSL.' },
        type: { type: 'string', description: 'Incident type.' },
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'MAJOR', 'WARNING'],
        },
        status: { type: 'string', enum: ['OPEN', 'RESOLVED'] },
        acknowledged: { type: 'boolean' },
        resourceType: { type: 'string' },
        from: { type: 'string', description: 'ISO datetime lower bound for openedAt.' },
        to: { type: 'string', description: 'ISO datetime upper bound for openedAt.' },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    type: 'function',
    name: 'get_incident_detail',
    description: 'Read one incident by exact incident ID.',
    parameters: {
      type: 'object',
      properties: {
        incidentId: { type: 'string' },
      },
      required: ['incidentId'],
    },
  },
  {
    type: 'function',
    name: 'get_server_summary',
    description:
      'Read the server/infrastructure summary. Server is an aggregate view, not a separate resource. Returns dashboard overview and health issue counts.',
    parameters: {
      type: 'object',
      properties: {
        cluster: { type: 'string', description: 'Monitoring cluster ID.' },
        site: { type: 'string', description: 'Cluster site.' },
      },
    },
  },
  {
    type: 'function',
    name: 'list_nodes',
    description: 'Read Nomad nodes across clusters or within one cluster.',
    parameters: {
      type: 'object',
      properties: {
        cluster: { type: 'string', description: 'Monitoring cluster ID.' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_node_detail',
    description: 'Read one Nomad node by exact node ID.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        cluster: { type: 'string', description: 'Monitoring cluster ID if known.' },
      },
      required: ['nodeId'],
    },
  },
  {
    type: 'function',
    name: 'list_allocations',
    description: 'Read Nomad allocations across clusters or within one cluster.',
    parameters: {
      type: 'object',
      properties: {
        cluster: { type: 'string', description: 'Monitoring cluster ID.' },
      },
    },
  },
  {
    type: 'function',
    name: 'list_failed_allocations',
    description: 'Read only failed Nomad allocations.',
    parameters: {
      type: 'object',
      properties: {
        cluster: { type: 'string', description: 'Monitoring cluster ID.' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_allocation_detail',
    description: 'Read one Nomad allocation by exact allocation ID.',
    parameters: {
      type: 'object',
      properties: {
        allocationId: { type: 'string' },
        cluster: { type: 'string', description: 'Monitoring cluster ID if known.' },
      },
      required: ['allocationId'],
    },
  },
  {
    type: 'function',
    name: 'list_drivers',
    description:
      'Read current DRIVER monitoring states. Driver states include HEALTHY, UNHEALTHY, and NOT_DETECTED.',
    parameters: {
      type: 'object',
      properties: {
        cluster: { type: 'string', description: 'Monitoring cluster ID.' },
        site: { type: 'string', description: 'Cluster site.' },
        state: {
          type: 'string',
          enum: ['HEALTHY', 'UNHEALTHY', 'NOT_DETECTED'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      },
    },
  },
  {
    type: 'function',
    name: 'list_blocked_evaluations',
    description: 'Read Nomad evaluations whose status is blocked.',
    parameters: {
      type: 'object',
      properties: {
        cluster: { type: 'string', description: 'Monitoring cluster ID.' },
      },
    },
  },
  {
    type: 'function',
    name: 'list_ssl_certificates',
    description:
      'Read SSL certificate monitoring for all configured clusters, including VALID, EXPIRING_SOON, and EXPIRED status.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

export class QuickChatService {
  constructor(
    private readonly geminiClient: GeminiClient,
    private readonly monitoringServiceClient: MonitoringServiceClient,
    private readonly telegramClient: TelegramClient,
  ) {}

  async handle(message: TelegramMessage): Promise<void> {
    if (!message.from || !message.text?.trim()) return;

    const question = message.text.trim();

    try {
      const answer = await this.geminiClient.answerWithTools(
        question,
        SYSTEM_INSTRUCTION,
        QUICK_CHAT_TOOLS,
        (name, args) => this.executeTool(name, args),
      );

      await this.telegramClient.sendMessage({
        chatId: String(message.chat.id),
        topicId: message.message_thread_id,
        text: escapeHtml(limitTelegramText(answer)),
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      console.error('AI Quick Chat failed', error);
      await this.telegramClient.sendMessage({
        chatId: String(message.chat.id),
        topicId: message.message_thread_id,
        text: escapeHtml(quickChatErrorMessage(error)),
        replyToMessageId: message.message_id,
      });
    }
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      switch (name) {
        case 'list_incidents':
          return await this.monitoringServiceClient.listIncidents({
            cluster: optionalString(args.cluster),
            site: optionalString(args.site),
            source: optionalUppercase(args.source),
            type: optionalUppercase(args.type),
            severity: optionalUppercase(args.severity),
            status: optionalUppercase(args.status),
            acknowledged: optionalBoolean(args.acknowledged),
            resourceType: optionalUppercase(args.resourceType),
            from: optionalString(args.from),
            to: optionalString(args.to),
            page: optionalInteger(args.page, 1, 1_000_000),
            limit: optionalInteger(args.limit, 1, 100) ?? 20,
          });

        case 'get_incident_detail':
          return await this.monitoringServiceClient.getIncident(
            requiredString(args.incidentId, 'incidentId'),
          );

        case 'get_server_summary': {
          const query = {
            cluster: optionalString(args.cluster),
            site: optionalString(args.site),
          };
          const [overview, health] = await Promise.all([
            this.monitoringServiceClient.getDashboardOverview(query),
            this.monitoringServiceClient.getDashboardHealth(query),
          ]);
          return { overview, health };
        }

        case 'list_nodes':
          return await this.monitoringServiceClient.getNomadNodes(
            optionalString(args.cluster),
          );

        case 'get_node_detail':
          return await this.monitoringServiceClient.getNomadNode(
            requiredString(args.nodeId, 'nodeId'),
            optionalString(args.cluster),
          );

        case 'list_allocations':
          return await this.monitoringServiceClient.getNomadAllocations(
            optionalString(args.cluster),
          );

        case 'list_failed_allocations':
          return await this.monitoringServiceClient.getFailedNomadAllocations(
            optionalString(args.cluster),
          );

        case 'get_allocation_detail':
          return await this.monitoringServiceClient.getNomadAllocation(
            requiredString(args.allocationId, 'allocationId'),
            optionalString(args.cluster),
          );

        case 'list_drivers':
          return await this.monitoringServiceClient.getMonitoringCurrent({
            cluster: optionalString(args.cluster),
            site: optionalString(args.site),
            source: 'NOMAD',
            resourceType: 'DRIVER',
            state: optionalUppercase(args.state),
            limit: optionalInteger(args.limit, 1, 500) ?? 100,
          });

        case 'list_blocked_evaluations':
          return await this.monitoringServiceClient.getBlockedNomadEvaluations(
            optionalString(args.cluster),
          );

        case 'list_ssl_certificates':
          return await this.monitoringServiceClient.getSslMonitoring();

        default:
          return {
            success: false,
            error: `Unsupported read-only monitoring tool: ${name}`,
          };
      }
    } catch (error) {
      if (error instanceof MonitoringServiceError) {
        return {
          success: false,
          error: {
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
          },
        };
      }
      throw error;
    }
  }
}

function requiredString(value: unknown, field: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Missing required tool argument: ${field}`);
  return parsed;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = value.trim();
  return parsed || undefined;
}

function optionalUppercase(value: unknown): string | undefined {
  return optionalString(value)?.toUpperCase();
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

function quickChatErrorMessage(error: unknown): string {
  if (error instanceof GeminiApiError) {
    if (error.statusCode === 429) {
      return 'AI Quick Chat sedang mencapai batas penggunaan Gemini. Coba lagi nanti.';
    }
    return `AI Quick Chat gagal memproses permintaan: ${error.message}`;
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'AI Quick Chat timeout saat menghubungi Gemini.';
  }

  return 'AI Quick Chat gagal memproses permintaan.';
}

function limitTelegramText(value: string): string {
  const maxLength = 3900;
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 25)}\n\n[response truncated]`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
