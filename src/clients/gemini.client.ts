export interface GeminiClientConfig {
  apiKey: string;
  model: string;
}

export interface GeminiFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GeminiInteractionResponse {
  id?: string;
  status?: string;
  steps?: GeminiStep[];
  error?: {
    code?: string | number;
    message?: string;
  };
}

interface GeminiStep {
  type?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  [key: string]: unknown;
}

interface GeminiFunctionCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

const GEMINI_INTERACTIONS_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOOL_ROUNDS = 3;

export class GeminiApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class GeminiClient {
  constructor(private readonly config: GeminiClientConfig) {}

  async answerWithTools(
    input: string,
    systemInstruction: string,
    tools: GeminiFunctionTool[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  ): Promise<string> {
    const history: GeminiStep[] = [
      {
        type: 'user_input',
        content: [{ type: 'text', text: input }],
      },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const interaction = await this.createInteraction({
        input: history,
        systemInstruction,
        tools,
      });

      const responseSteps = (interaction.steps ?? []).filter(
        (step) => step.type !== 'user_input',
      );
      history.push(...responseSteps);

      const functionCalls = extractFunctionCalls(responseSteps);
      if (functionCalls.length === 0) {
        const text = extractOutputText(responseSteps);
        if (text) return text;
        throw new GeminiApiError(502, 'Gemini returned an empty response.');
      }

      for (const call of functionCalls) {
        let result: unknown;
        try {
          result = await executeTool(call.name, call.arguments);
        } catch (error) {
          result = {
            success: false,
            error: error instanceof Error ? error.message : 'Tool execution failed.',
          };
        }

        history.push({
          type: 'function_result',
          name: call.name,
          call_id: call.id,
          result: [
            {
              type: 'text',
              text: serializeToolResult(result),
            },
          ],
        });
      }
    }

    const finalInteraction = await this.createInteraction({
      input: history,
      systemInstruction,
      tools: [],
    });
    const text = extractOutputText(finalInteraction.steps ?? []);
    if (text) return text;

    throw new GeminiApiError(502, 'Gemini did not produce a final response.');
  }

  private async createInteraction(input: {
    input: GeminiStep[];
    systemInstruction: string;
    tools: GeminiFunctionTool[];
  }): Promise<GeminiInteractionResponse> {
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-goog-api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        model: this.config.model,
        store: false,
        input: input.input,
        system_instruction: input.systemInstruction,
        ...(input.tools.length ? { tools: input.tools } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const raw = await response.text();
    let parsed: GeminiInteractionResponse = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as GeminiInteractionResponse;
      } catch {
        throw new GeminiApiError(response.status, `Gemini returned invalid JSON (${response.status}).`);
      }
    }

    if (!response.ok) {
      throw new GeminiApiError(
        response.status,
        parsed.error?.message ?? `Gemini request failed (${response.status}).`,
      );
    }

    if (parsed.status === 'failed') {
      throw new GeminiApiError(502, parsed.error?.message ?? 'Gemini interaction failed.');
    }

    return parsed;
  }
}

function extractFunctionCalls(steps: GeminiStep[]): GeminiFunctionCall[] {
  const calls: GeminiFunctionCall[] = [];

  for (const step of steps) {
    if (
      step.type !== 'function_call' ||
      typeof step.id !== 'string' ||
      typeof step.name !== 'string'
    ) {
      continue;
    }

    calls.push({
      id: step.id,
      name: step.name,
      arguments: isRecord(step.arguments) ? step.arguments : {},
    });
  }

  return calls;
}

function extractOutputText(steps: GeminiStep[]): string {
  const chunks: string[] = [];

  for (const step of steps) {
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;

    for (const item of step.content) {
      if (item.type === 'text' && typeof item.text === 'string' && item.text.trim()) {
        chunks.push(item.text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function serializeToolResult(result: unknown): string {
  const normalized = compactResult(result);
  const serialized = JSON.stringify(normalized);
  const maxChars = 80_000;

  if (serialized.length <= maxChars) return serialized;

  return JSON.stringify({
    truncated: true,
    note: 'Tool result exceeded the quick-chat payload limit. This is a partial preview.',
    preview: serialized.slice(0, maxChars - 500),
  });
}

function compactResult(value: unknown): unknown {
  const maxItems = 100;

  if (Array.isArray(value)) {
    return {
      total: value.length,
      truncated: value.length > maxItems,
      items: value.slice(0, maxItems),
    };
  }

  if (isRecord(value) && Array.isArray(value.items)) {
    return {
      ...value,
      items: value.items.slice(0, maxItems),
      quickChatTruncated: value.items.length > maxItems,
    };
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
