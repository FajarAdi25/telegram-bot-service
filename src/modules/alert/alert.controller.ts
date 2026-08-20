import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJson, sendJson } from '../../shared/http/json.js';
import { AlertService } from './alert.service.js';
import { parseAlertWebhook } from './alert.validator.js';
import { HttpError } from '../../shared/errors/http-error.js';

export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  async receive(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const payload = parseAlertWebhook(await readJson(req));
      const result = await this.alertService.process(payload);

      sendJson(res, 200, {
        success: true,
        duplicate: result.duplicate,
      });
    } catch (error) {
      console.error('Alert webhook processing error', error);

      if (error instanceof HttpError) {
        sendJson(res, error.statusCode, {
          success: false,
          message: error.message,
        });
        return;
      }

      sendJson(res, 500, {
        success: false,
        message: 'Internal server error',
      });
    }
  }
}
