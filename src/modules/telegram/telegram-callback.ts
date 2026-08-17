import { HttpError } from '../../shared/errors/http-error.js';

export type AlertCallbackAction = 'ack' | 'postpone';

export interface AlertCallback {
  action: AlertCallbackAction;
  incidentId: string;
}

export function parseAlertCallback(data: string): AlertCallback {
  const separatorIndex = data.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === data.length - 1) {
    throw new HttpError(400, 'Invalid callback data');
  }

  const action = data.slice(0, separatorIndex);
  const incidentId = data.slice(separatorIndex + 1);

  if (action !== 'ack' && action !== 'postpone') {
    throw new HttpError(400, 'Unsupported callback action');
  }

  return { action, incidentId };
}
