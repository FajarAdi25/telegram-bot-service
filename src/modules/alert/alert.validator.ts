import { HttpError } from "../../shared/errors/http-error.js";
import { isAlertSource } from "../../shared/types/alert-source.js";
import {
  ALERT_EVENTS,
  INCIDENT_NOTIFICATION_KINDS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type AlertEvent,
  type AlertWebhookDto,
  type IncidentNotificationKind,
  type IncidentResourceDto,
  type IncidentSeverity,
  type IncidentStatus,
  type SslContextJsonDto,
} from "./dto/alert-webhook.dto.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  candidate: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const value = candidate[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${label} is required`);
  }
  return value;
}

function parseAcknowledgement(value: unknown) {
  if (!isRecord(value)) {
    return {
      status: false,
    };
  }

  return {
    status: Boolean(value.status),

    by: isRecord(value.by)
      ? {
          id: typeof value.by.id === "string" ? value.by.id : undefined,

          name: typeof value.by.name === "string" ? value.by.name : undefined,

          username:
            typeof value.by.username === "string"
              ? value.by.username
              : undefined,
        }
      : undefined,

    at:
      value.at === undefined || value.at === null
        ? null
        : requireIsoDate(String(value.at), "Acknowledgement at"),

    note: typeof value.note === "string" ? value.note : null,
  };
}

function parsePostpone(value: unknown) {
  if (!isRecord(value)) {
    return {
      status: false,
    };
  }

  return {
    status: Boolean(value.status),

    by: isRecord(value.by)
      ? {
          id: typeof value.by.id === "string" ? value.by.id : undefined,

          name: typeof value.by.name === "string" ? value.by.name : undefined,

          username:
            typeof value.by.username === "string"
              ? value.by.username
              : undefined,
        }
      : undefined,

    at: value.at === undefined || value.at === null ? null : String(value.at),

    until:
      value.until === undefined || value.until === null
        ? null
        : String(value.until),

    remark: typeof value.remark === "string" ? value.remark : null,
  };
}

function optionalNullableString(
  candidate: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  const value = candidate[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${label} must be a non-empty string or null`);
  }
  return value;
}

function parseNullableIsoDate(
  candidate: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  const value = candidate[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(
      400,
      `${label} must be a valid ISO-8601 datetime or null`,
    );
  }

  return requireIsoDate(value, label);
}

function parseOptionalNullableIsoDate(
  candidate: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  const value = candidate[field];

  if (value === undefined || value === null) {
    return null;
  }

  return requireIsoDate(requireString(candidate, field, label), label);
}


function parseSslContextJson(value: unknown): SslContextJsonDto {
  if (!isRecord(value)) {
    throw new HttpError(400, "Incident contextJson is required for SSL alert");
  }

  const daysRemaining = value.daysRemaining;
  if (!Number.isInteger(daysRemaining)) {
    throw new HttpError(400, "Incident contextJson daysRemaining must be an integer");
  }

  return {
    endpoint: requireString(value, "endpoint", "Incident contextJson endpoint"),
    validFrom: requireIsoDate(
      requireString(value, "validFrom", "Incident contextJson validFrom"),
      "Incident contextJson validFrom",
    ),
    expiresAt: requireIsoDate(
      requireString(value, "expiresAt", "Incident contextJson expiresAt"),
      "Incident contextJson expiresAt",
    ),
    daysRemaining: daysRemaining as number,
    subjectCn: requireString(value, "subjectCn", "Incident contextJson subjectCn"),
    issuerCn: requireString(value, "issuerCn", "Incident contextJson issuerCn"),
    certificateFingerprint256: requireString(
      value,
      "certificateFingerprint256",
      "Incident contextJson certificateFingerprint256",
    ),
  };
}

function parseResource(value: unknown): IncidentResourceDto {
  if (!isRecord(value)) {
    throw new HttpError(400, "Incident resource is required");
  }

  return {
    type: requireString(value, "type", "Incident resource type"),
    key: requireString(value, "key", "Incident resource key"),
    name: optionalNullableString(value, "name", "Incident resource name"),
  };
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `${label} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function requireIsoDate(value: string, label: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label} must be a valid ISO-8601 datetime`);
  }
  return value;
}

export function parseAlertWebhook(payload: unknown): AlertWebhookDto {
  if (!isRecord(payload)) {
    throw new HttpError(400, "Alert webhook payload must be an object");
  }

  const event = parseEnum<AlertEvent>(payload.event, ALERT_EVENTS, "Event");

  const kind = parseEnum<IncidentNotificationKind>(
    payload.kind,
    INCIDENT_NOTIFICATION_KINDS,
    "Kind",
  );

  if (!isRecord(payload.incident)) {
    throw new HttpError(400, "Incident is required");
  }

  const incident = payload.incident;
  const source = incident.source;
  if (!isAlertSource(source)) {
    throw new HttpError(400, "Incident source must be NOMAD, CONSUL, MINIO, or SSL");
  }

  if (event === "SSL_EXPIRING_ALERT" && source !== "SSL") {
    throw new HttpError(400, "SSL_EXPIRING_ALERT requires SSL incident source");
  }
  if (source === "SSL" && event !== "SSL_EXPIRING_ALERT") {
    throw new HttpError(400, "SSL incident source requires SSL_EXPIRING_ALERT event");
  }

  const reminderCount = incident.reminderCount;
  if (!Number.isInteger(reminderCount) || (reminderCount as number) < 0) {
    throw new HttpError(
      400,
      "Incident reminderCount must be a non-negative integer",
    );
  }

  const openedAt = requireIsoDate(
    requireString(incident, "openedAt", "Incident openedAt"),
    "Incident openedAt",
  );
  const resolvedAtRaw = incident.resolvedAt;
  const resolvedAt =
    resolvedAtRaw === undefined || resolvedAtRaw === null
      ? null
      : requireIsoDate(
          requireString(incident, "resolvedAt", "Incident resolvedAt"),
          "Incident resolvedAt",
        );

  const status = parseEnum<IncidentStatus>(
    incident.status,
    INCIDENT_STATUSES,
    "Incident status",
  );

  if (kind === "RESOLVED") {
    if (status !== "RESOLVED" || resolvedAt === null) {
      throw new HttpError(
        400,
        "RESOLVED notification requires RESOLVED status and resolvedAt",
      );
    }
  } else if (status !== "OPEN" || resolvedAt !== null) {
    throw new HttpError(
      400,
      `${kind} notification requires OPEN status and null resolvedAt`,
    );
  }

  const clusterIdRaw = incident.clusterId;
  const clusterId =
    clusterIdRaw === undefined || clusterIdRaw === null
      ? undefined
      : Number(clusterIdRaw);

  if (clusterId !== undefined && Number.isNaN(clusterId)) {
    throw new HttpError(400, "Incident clusterId must be numeric");
  }

  return {
    event,
    kind,
    incident: {
      id: requireString(incident, "id", "Incident id"),
      status,
      source,
      type: requireString(incident, "type", "Incident type"),
      severity: parseEnum<IncidentSeverity>(
        incident.severity,
        INCIDENT_SEVERITIES,
        "Incident severity",
      ),
      clusterId,
      clusterName: requireString(
        incident,
        "clusterName",
        "Incident clusterName",
      ),
      site: requireString(incident, "site", "Incident site"),
      appName: requireString(incident, "appName", "Incident appName"),
      env: requireString(incident, "env", "Incident env"),
      resource: parseResource(incident.resource),
      message: requireString(incident, "message", "Incident message"),
      ...(source === "SSL"
        ? { contextJson: parseSslContextJson(incident.contextJson) }
        : {}),
      openedAt,
      resolvedAt,
      reminderCount: reminderCount as number,
      acknowledgement: parseAcknowledgement(incident.acknowledgement),
      postpone: parsePostpone(incident.postpone),
      // postponedAt: parseOptionalNullableIsoDate(
      //   incident,
      //   "postponedAt",
      //   "Incident postponedAt",
      // ),
      // postponedByUserName: optionalNullableString(
      //   incident,
      //   "postponedByUserName",
      //   "Incident postponedByUserName",
      // ),
      // postponeUntil: parseOptionalNullableIsoDate(
      //   incident,
      //   "postponeUntil",
      //   "Incident postponeUntil",
      // ),
      // postponeRemark: optionalNullableString(
      //   incident,
      //   "postponeRemark",
      //   "Incident postponeRemark",
      // ),
    },
  };
}
