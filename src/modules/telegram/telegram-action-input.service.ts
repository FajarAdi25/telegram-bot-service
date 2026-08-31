import {
  MonitoringServiceClient,
  MonitoringServiceError,
} from "../../clients/monitoring-service.client.js";
import { IncidentStateRepository } from "../../repositories/incident-state.repository.js";
import {
  TelegramActionSessionRepository,
  type TelegramActionSession,
} from "../../repositories/telegram-action-session.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { parsePostponeTime } from "../postpone/postpone-time.parser.js";
import { TelegramClient } from "./telegram.client.js";
import {
  toUserIdentity,
  type TelegramMessage,
  type TelegramUserIdentity,
} from "./telegram.types.js";

export class TelegramActionInputService {
  constructor(
    private readonly monitoringServiceClient: MonitoringServiceClient,
    private readonly incidentStateRepository: IncidentStateRepository,
    private readonly actionSessionRepository: TelegramActionSessionRepository,
    private readonly telegramClient: TelegramClient,
  ) {}

  async handle(message: TelegramMessage): Promise<boolean> {
    if (
      !message.from ||
      !message.text ||
      message.message_thread_id === undefined ||
      message.reply_to_message?.message_id === undefined
    ) {
      return false;
    }

    const user = toUserIdentity(message.from);
    const session = await this.actionSessionRepository.findForReply(
      user.id,
      String(message.chat.id),
      message.message_thread_id,
      message.reply_to_message.message_id,
    );
    if (!session) return false;

    if (session.stage === "ACK_NOTE") {
      await this.handleAckNote(message, user, session);
      return true;
    }

    if (session.stage === "POSTPONE_TIME") {
      await this.handlePostponeTime(message, session);
      return true;
    }

    await this.handlePostponeRemark(message, user, session);
    return true;
  }

  private async handleAckNote(
    message: TelegramMessage,
    user: TelegramUserIdentity,
    session: TelegramActionSession,
  ): Promise<void> {
    try {
      const note = optionalText(message.text!);
      const result = await this.monitoringServiceClient.acknowledgeIncident(
        session.incidentId,
        user,
        note,
      );

      const acknowledgedBy =
        monitoringUserIdentity(result.acknowledgedBy) ?? user;
      await this.incidentStateRepository.markAcknowledged(
        session.incidentId,
        acknowledgedBy,
      );
      await this.actionSessionRepository.deleteById(session.id);

      const buttons =
        result.status === "OPEN"
          ? [
              {
                text: "Postpone",
                callback_data: `postpone:${session.incidentId}`,
              },
            ]
          : [];
      await this.telegramClient.editMessageButtons(
        session.chatId,
        session.sourceMessageId,
        buttons,
      );

      await this.telegramClient.sendMessage({
        chatId: session.chatId,
        topicId: session.topicId,
        text: [
          "<b>✅ ACK Successful</b>",
          `Incident: <code>${escapeHtml(session.incidentId)}</code>`,
          `By: ${formatUser(acknowledgedBy)}`,
          `Note: ${escapeHtml(result.acknowledgementNote ?? note ?? "-")}`,
        ].join("\n"),
        replyToMessageId: session.sourceMessageId,
      });
    } catch (error) {
      await this.sendActionError(
        session.chatId,
        session.topicId,
        message.message_id,
        "ACK",
        error,
      );
    }
  }

  private async handlePostponeTime(
    message: TelegramMessage,
    session: TelegramActionSession,
  ): Promise<void> {
    try {
      const parsed = parsePostponeTime(message.text!);
      const prompt = await this.telegramClient.sendMessage({
        chatId: session.chatId,
        topicId: session.topicId,
        text: [
          "<b>Postpone Remark</b>",
          `Incident: <code>${escapeHtml(session.incidentId)}</code>`,
          `Until: <code>${escapeHtml(parsed.display)}</code>`,
          "",
          "Input remark POSTPONE.",
          "Reply <code>-</code> if you don't want to input remark.",
        ].join("\n"),
        replyToMessageId: message.message_id,
        forceReply: true,
      });

      await this.actionSessionRepository.replacePrompt(
        session.id,
        "POSTPONE_REMARK",
        prompt.message_id,
        parsed.iso,
        parsed.display,
      );
    } catch (error) {
      const prompt = await this.telegramClient.sendMessage({
        chatId: session.chatId,
        topicId: session.topicId,
        text: [
          postponeErrorMessage(error),
          "",
          "Try again with format:",
          "<code>DD-MM-YYYY HH:mm</code>",
          "Timezone: Asia/Jakarta (WIB)",
        ].join("\n"),
        replyToMessageId: message.message_id,
        forceReply: true,
      });

      await this.actionSessionRepository.replacePrompt(
        session.id,
        "POSTPONE_TIME",
        prompt.message_id,
      );
    }
  }

  private async handlePostponeRemark(
    message: TelegramMessage,
    user: TelegramUserIdentity,
    session: TelegramActionSession,
  ): Promise<void> {
    if (!session.postponeUntil || !session.postponeDisplay) {
      await this.actionSessionRepository.deleteById(session.id);
      await this.telegramClient.sendMessage({
        chatId: session.chatId,
        topicId: session.topicId,
        text: "Session POSTPONE is invalid. Please click the Postpone button again.",
        replyToMessageId: message.message_id,
      });
      return;
    }

    try {
      const remark = optionalText(message.text!);
      const result = await this.monitoringServiceClient.postponeIncident(
        session.incidentId,
        user,
        session.postponeUntil,
        remark,
      );

      await this.actionSessionRepository.deleteById(session.id);
      const postponedBy = monitoringUserIdentity(result.postponedBy) ?? user;

      await this.telegramClient.sendMessage({
        chatId: session.chatId,
        topicId: session.topicId,
        text: [
          "<b>✅ POSTPONE Successful</b>",
          `Incident: <code>${escapeHtml(session.incidentId)}</code>`,
          `Until: <code>${escapeHtml(session.postponeDisplay)}</code>`,
          `By: ${formatUser(postponedBy)}`,
          `Remark: ${escapeHtml(result.postponeRemark ?? remark ?? "-")}`,
        ].join("\n"),
        replyToMessageId: session.sourceMessageId,
      });
    } catch (error) {
      if (
        error instanceof MonitoringServiceError &&
        error.code === "INCIDENT_NOT_OPEN"
      ) {
        await this.actionSessionRepository.deleteById(session.id);
      }
      await this.sendActionError(
        session.chatId,
        session.topicId,
        message.message_id,
        "POSTPONE",
        error,
      );
    }
  }

  private async sendActionError(
    chatId: string,
    topicId: number,
    replyToMessageId: number,
    action: "ACK" | "POSTPONE",
    error: unknown,
  ): Promise<void> {
    await this.telegramClient.sendMessage({
      chatId,
      topicId,
      text: `<b>❌ ${action} Failed</b>\n${actionErrorMessage(error)}`,
      replyToMessageId,
    });
  }
}

function optionalText(value: string): string | undefined {
  const text = value.trim();
  if (!text || text === "-") return undefined;
  return text;
}

function monitoringUserIdentity(
  user:
    | {
        id: string | number;
        name: string;
        username?: string;
      }
    | undefined,
): TelegramUserIdentity | undefined {
  if (!user) return undefined;
  return {
    id: String(user.id),
    name: user.name,
    ...(user.username ? { username: user.username } : {}),
  };
}

function formatUser(user: TelegramUserIdentity): string {
  const username = user.username ? ` (@${escapeHtml(user.username)})` : "";
  return `${escapeHtml(user.name)}${username}`;
}

function postponeErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return escapeHtml(error.message);
  return actionErrorMessage(error);
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof MonitoringServiceError) {
    if (error.code === "INVALID_POSTPONE_UNTIL") {
      return "Postpone time rejected by Monitoring Service. Please make sure the time is still in the future.";
    }
    if (error.code === "INCIDENT_NOT_OPEN") return "Incident is not OPEN.";
    if (error.code === "INCIDENT_NOT_FOUND") return "Incident not found.";
    if (error.code === "UNAUTHORIZED_SERVICE")
      return "Service authentication failed.";
    return escapeHtml(error.message);
  }

  if (error instanceof HttpError) return escapeHtml(error.message);
  console.error(error);
  return "Action failed to process.";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
