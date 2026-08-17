import type { TelegramInlineButton } from './telegram.types.js';

interface SendMessageInput {
  chatId: string;
  topicId?: number;
  text: string;
  buttons?: TelegramInlineButton[];
  replyToMessageId?: number;
  forceReply?: boolean;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramSentMessage {
  message_id: number;
}

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(input: SendMessageInput): Promise<TelegramSentMessage> {
    const replyMarkup = input.forceReply
      ? { force_reply: true }
      : input.buttons?.length
        ? { inline_keyboard: [input.buttons] }
        : undefined;

    return this.call<TelegramSentMessage>('sendMessage', {
      chat_id: input.chatId,
      ...(input.topicId !== undefined ? { message_thread_id: input.topicId } : {}),
      text: input.text,
      parse_mode: 'HTML',
      ...(input.replyToMessageId !== undefined
        ? { reply_parameters: { message_id: input.replyToMessageId } }
        : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async editMessageButtons(
    chatId: string,
    messageId: number,
    buttons: TelegramInlineButton[],
  ): Promise<void> {
    await this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: buttons.length ? [buttons] : [] },
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  private async call<T = unknown>(method: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });

    const result = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !result.ok || result.result === undefined) {
      throw new Error(
        `Telegram API ${method} failed (${response.status}): ${result.description ?? 'unknown error'}`,
      );
    }

    return result.result;
  }
}
