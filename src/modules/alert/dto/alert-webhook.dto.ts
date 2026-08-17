import type { AlertSource } from '../../../shared/types/alert-source.js';

export const INCIDENT_NOTIFICATION_KINDS = ['INITIAL', 'REMINDER', 'RESOLVED'] as const;
export type IncidentNotificationKind = (typeof INCIDENT_NOTIFICATION_KINDS)[number];

export const INCIDENT_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ['CRITICAL', 'MAJOR', 'WARNING'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export interface IncidentResourceDto {
  type: string;
  key: string;
  name: string | null;
}

export interface IncidentDto {
  id: string;
  status: IncidentStatus;
  source: AlertSource;
  type: string;
  severity: IncidentSeverity;
  resource: IncidentResourceDto;
  message: string;
  openedAt: string;
  resolvedAt: string | null;
  reminderCount: number;
}

export interface AlertWebhookDto {
  event: 'INCIDENT_ALERT';
  kind: IncidentNotificationKind;
  incident: IncidentDto;
}
