export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramUserIdentity {
  id: string;
  name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessageRef {
  message_id: number;
}

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  reply_to_message?: TelegramMessageRef;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
}

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export function toUserIdentity(user: TelegramUser): TelegramUserIdentity {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return {
    id: String(user.id),
    name,
    ...(user.username ? { username: user.username } : {}),
  };
}
