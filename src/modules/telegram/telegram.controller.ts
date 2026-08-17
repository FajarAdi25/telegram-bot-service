import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJson, sendJson } from '../../shared/http/json.js';
import { PostponeInputService } from '../postpone/postpone-input.service.js';
import { TelegramCallbackService } from './telegram-callback.service.js';
import type { TelegramUpdate } from './telegram.types.js';

export class TelegramController {
  constructor(
    private readonly callbackService: TelegramCallbackService,
    private readonly postponeInputService: PostponeInputService,
  ) {}

  async receive(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const payload = (await readJson(req)) as TelegramUpdate;

    if (payload.callback_query) {
      await this.callbackService.handle(payload);
    } else if (payload.message) {
      await this.postponeInputService.handle(payload.message);
    }

    sendJson(res, 200, { success: true });
  }
}
