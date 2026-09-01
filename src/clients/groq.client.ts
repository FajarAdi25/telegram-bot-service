export interface GroqClientConfig {
  apiKey: string;
  model: string;
}

export interface GroqFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
  error?: { message?: string };
}

export class GroqApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

const URL = 'https://api.groq.com/openai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 60000;
const MAX_TOOL_ROUNDS = 3;

export class GroqClient {
  constructor(private readonly config: GroqClientConfig) {}

  async answerWithTools(
    input: string,
    systemInstruction: string,
    tools: GroqFunctionTool[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  ): Promise<string> {
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: input },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.createCompletion(messages, tools);
      const message = response.choices?.[0]?.message;

      if (!message) throw new GroqApiError(502, 'Groq returned an empty response.');

      if (!message.tool_calls?.length) {
        if (message.content?.trim()) return message.content.trim();
        throw new GroqApiError(502, 'Groq returned an empty response.');
      }

      messages.push(message as Record<string, unknown>);

      for (const call of message.tool_calls) {
        let result: unknown;
        try {
          result = await executeTool(call.function.name, JSON.parse(call.function.arguments || '{}'));
        } catch (error) {
          result = { success: false, error: error instanceof Error ? error.message : 'Tool execution failed.' };
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    const finalResponse = await this.createCompletion(messages, []);
    const text = finalResponse.choices?.[0]?.message?.content?.trim();
    if (text) return text;

    throw new GroqApiError(502, 'Groq did not produce a final response.');
  }

  private async createCompletion(messages: Array<Record<string, unknown>>, tools: GroqFunctionTool[]) {
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        ...(tools.length ? { tools: tools.map((tool) => ({ type: tool.type, function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) } : {}),
        tool_choice: tools.length ? 'auto' : undefined,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const parsed = await response.json() as GroqResponse;

    if (!response.ok) {
      throw new GroqApiError(response.status, parsed.error?.message ?? `Groq request failed (${response.status}).`);
    }

    return parsed;
  }
}
