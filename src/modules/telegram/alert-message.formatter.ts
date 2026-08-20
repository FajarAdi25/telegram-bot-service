import type { AlertWebhookDto } from '../alert/dto/alert-webhook.dto.js';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function value(value: string | number | null | undefined): string {
  return escapeHtml(value === null ? '-' : String(value));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replace(',', '');
}

function section(title: string): string { return `<b>${title}</b>`; }

export function formatAlertMessage(payload: AlertWebhookDto): string {
  const i = payload.incident;
  return [
    `🚨${payload.kind === 'REMINDER' ? 'Incident Reminder' : payload.kind === 'RESOLVED' ? 'Incident Resolved' : 'Incident Alert'} | ${value(i.appName)} - ${value(i.env)}`,
    '',
    `Kind: ${value(payload.kind)}`,
    `Cluster: ${value(i.clusterName)}`,
    '',
    section('Detail'),
    `Incident ID: ${value(i.id)}`,
    `Status: ${value(i.status)}`,
    `Source: ${value(i.source)}`,
    `Type: ${value(i.type)}`,
    `Severity: ${value(i.severity)}`,
    `Message: ${value(i.message)}`,
    '',
    section('Resource Detail'),
    `Resource Type: ${value(i.resource.type)}`,
    `Resource Key: ${value(i.resource.key)}`,
    `Resource Name: ${value(i.resource.name)}`,
    `Opened At: ${formatDate(i.openedAt)}`,
    `Resolved At: ${formatDate(i.resolvedAt)}`,
    `Reminder Count: ${value(i.reminderCount)}`,
    '',
    section('Acknowledge'),
    `Acknowledge By: ${value(i.acknowledgedByUserName)}`,
    `Acknowledge Note: ${value(i.acknowledgementNote)}`,
    `Acknowledge At: ${formatDate(i.acknowledgedAt)}`,
    '',
    section('Postpone'),
    `Postpone By: ${value(i.postponedByUserName)}`,
    `Postpone Note: ${value(i.postponeRemark)}`,
    `Postpone At: ${formatDate(i.postponedAt)}`,
    `Postpone Until: ${formatDate(i.postponeUntil)}`,
  ].join('\n');
}
