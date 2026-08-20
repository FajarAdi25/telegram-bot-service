import type { AlertSource } from "../../../shared/types/alert-source.js";

export const INCIDENT_NOTIFICATION_KINDS = [
  "INITIAL",
  "REMINDER",
  "RESOLVED",
] as const;
export type IncidentNotificationKind =
  (typeof INCIDENT_NOTIFICATION_KINDS)[number];

export const INCIDENT_STATUSES = ["OPEN", "RESOLVED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ["CRITICAL", "MAJOR", "WARNING"] as const;
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
  clusterId?: number;
  clusterName?: string;
  site?: string;
  appName?: string;
  env?: string;
  resource: IncidentResourceDto;
  message: string;
  openedAt: string;
  resolvedAt: string | null;
  reminderCount: number;
  // acknowledgedAt?: string | null;
  // acknowledgedByUserName?: string | null;
  // acknowledgementNote?: string | null;
  acknowledgement: {
    status: boolean;
    by?: {
      id?: string;
      name?: string;
      username?: string;
    };
    at?: string | null;
    note?: string | null;
  };
  // postponedAt?: string | null;
  // postponedByUserName?: string | null;
  // postponeUntil?: string | null;
  // postponeRemark?: string | null;
  postpone: {
    status: boolean;
    by?: {
      id?: string;
      name?: string;
      username?: string;
    };
    at?: string | null;
    until?: string | null;
    remark?: string | null;
  };
}

export interface AlertWebhookDto {
  event: "INCIDENT_ALERT";
  kind: IncidentNotificationKind;
  incident: IncidentDto;
}
