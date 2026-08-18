import { setTimeout as sleep } from 'node:timers/promises';
import type { PostponeInputService } from '../postpone/postpone-input.service.js';
import type { TelegramCallbackService } from './telegram-callback.service.js';
import type { TelegramClient } from './telegram.client.js';
import type { TelegramUpdate } from './telegram.types.js';

const POLLING_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 1000;

export class TelegramPollingService {
  private running = false;
  private offset: number | undefined;
  private abortController: AbortController | undefined;
  private loopPromise: Promise<void> | undefined;

  constructor(
    private readonly telegramClient: Pick<TelegramClient, 'deleteWebhook' | 'getUpdates'>,
    private readonly callbackService: Pick<TelegramCallbackService, 'handle'>,
    private readonly postponeInputService: Pick<PostponeInputService, 'handle'>,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;

    // getUpdates and Telegram webhooks are mutually exclusive. Do not drop pending
    // updates here so a deployment restart does not intentionally discard user actions.
    await this.telegramClient.deleteWebhook(false);

    this.running = true;
    this.abortController = new AbortController();
    this.loopPromise = this.pollLoop(this.abortController.signal);
    console.log('Telegram long polling started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    this.abortController?.abort();

    try {
      await this.loopPromise;
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      this.abortController = undefined;
      this.loopPromise = undefined;
    }

    console.log('Telegram long polling stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private async pollLoop(signal: AbortSignal): Promise<void> {
    while (this.running && !signal.aborted) {
      try {
        const updates = await this.telegramClient.getUpdates(
          this.offset,
          POLLING_TIMEOUT_SECONDS,
          signal,
        );

        for (const update of updates) {
          if (!this.running || signal.aborted) return;

          try {
            await this.dispatch(update);
          } catch (error) {
            console.error(`Failed to process Telegram update ${update.update_id}`, error);
          } finally {
            // Advance even when a malformed/user-level update fails so one poison update
            // cannot block every following Telegram update.
            this.offset = update.update_id + 1;
          }
        }
      } catch (error) {
        if (!this.running || signal.aborted || isAbortError(error)) return;
        console.error('Telegram long polling request failed', error);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  private async dispatch(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.callbackService.handle(update);
      return;
    }

    if (update.message) {
      await this.postponeInputService.handle(update.message);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
