import type { AlertWebhookDto } from '../alert/dto/alert-webhook.dto.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function line(label: string, value: string | number | null): string {
  return `<b>${escapeHtml(label)}:</b> ${escapeHtml(value === null ? '-' : String(value))}`;
}

function title(kind: AlertWebhookDto['kind']): string {
  if (kind === 'INITIAL') return 'Incident Alert';
  if (kind === 'REMINDER') return 'Incident Reminder';
  return 'Incident Resolved';
}

export function formatAlertMessage(payload: AlertWebhookDto): string {
  const { incident } = payload;

  return [
    `<b>${title(payload.kind)}</b>`,
    line('Kind', payload.kind),
    '',
    line('Incident ID', incident.id),
    line('Status', incident.status),
    line('Source', incident.source),
    line('Type', incident.type),
    line('Severity', incident.severity),
    line('Message', incident.message),
    '',
    line('Resource Type', incident.resource.type),
    line('Resource Key', incident.resource.key),
    line('Resource Name', incident.resource.name),
    '',
    line('Opened At', incident.openedAt),
    line('Resolved At', incident.resolvedAt),
    line('Reminder Count', incident.reminderCount),
  ].join('\n');
}
