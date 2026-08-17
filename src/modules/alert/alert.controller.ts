import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJson, sendJson } from '../../shared/http/json.js';
import { AlertService } from './alert.service.js';
import { parseAlertWebhook } from './alert.validator.js';

export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  async receive(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const payload = parseAlertWebhook(await readJson(req));
    const result = await this.alertService.process(payload);

    sendJson(res, 200, {
      success: true,
      duplicate: result.duplicate,
    });
  }
}
