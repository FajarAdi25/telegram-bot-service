import type { AlertWebhookDto } from "../alert/dto/alert-webhook.dto.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function value(value: string | number | null | undefined): string {
  return escapeHtml(value == null || value === "" ? "-" : String(value));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(",", "");
}

function section(title: string): string {
  return `<b>${title}</b>`;
}

function formatIncidentAlertMessage(payload: AlertWebhookDto): string {
  const i = payload.incident;
  return [
    `🚨${payload.kind === "REMINDER" ? "INCIDENT REMINDER" : payload.kind === "RESOLVED" ? "INCIDENT RESOLVED" : "INCIDENT ALERT"} | ${value(i.appName)} - ${value(i.env)}`,
    "",
    `Kind: ${value(payload.kind)}`,
    `Cluster: ${value(i.clusterName)}`,
    "",
    `📌${section("Detail")}`,
    `Incident ID: ${value(i.id)}`,
    `Status: ${value(i.status)}`,
    `Source: ${value(i.source)}`,
    `Type: ${value(i.type)}`,
    `Severity: ${value(i.severity)}`,
    `Message: ${value(i.message)}`,
    "",
    `📌${section("Resource Detail")}`,
    `Resource Type: ${value(i.resource.type)}`,
    `Resource Key: ${value(i.resource.key)}`,
    `Resource Name: ${value(i.resource.name)}`,
    `Opened At: ${formatDate(i.openedAt)}`,
    `Resolved At: ${formatDate(i.resolvedAt)}`,
    `Reminder Count: ${value(i.reminderCount)}`,
    "",
    `📌${section("Acknowledge")}`,
    `Acknowledge By: ${value(i.acknowledgement.by?.name)}`,
    `Acknowledge Note: ${value(i.acknowledgement.note)}`,
    `Acknowledge At: ${formatDate(i.acknowledgement.at)}`,
    "",
    `📌${section("Postpone")}`,
    `Postpone By: ${value(i.postpone.by?.name)}`,
    `Postpone Note: ${value(i.postpone.remark)}`,
    `Postpone At: ${formatDate(i.postpone.at)}`,
    `Postpone Until: ${formatDate(i.postpone.until)}`,
  ].join("\n");
}

function formatSslAlertMessage(payload: AlertWebhookDto): string {
  const i = payload.incident;
  const ssl = i.contextJson;

  return [
    `🔐${payload.kind === "REMINDER" ? "SSL CERTIFICATE REMINDER" : payload.kind === "RESOLVED" ? "SSL CERTIFICATE RESOLVED" : "SSL CERTIFICATE ALERT"} | ${value(i.clusterName)} - ${value(i.env)}`,
    "",
    `Kind: ${value(payload.kind)}`,
    `Cluster: ${value(i.clusterName)}`,
    `Site: ${value(i.site)}`,
    "",
    `📌${section("SSL Certificate Detail")}`,
    `Incident ID: ${value(i.id)}`,
    `Status: ${value(i.status)}`,
    `Severity: ${value(i.severity)}`,
    `Endpoint: ${value(ssl?.endpoint)}`,
    `Subject CN: ${value(ssl?.subjectCn)}`,
    `Issuer CN: ${value(ssl?.issuerCn)}`,
    `Valid From: ${formatDate(ssl?.validFrom)}`,
    `Expires At: ${formatDate(ssl?.expiresAt)}`,
    `Days Remaining: ${value(ssl?.daysRemaining)}`,
    `Fingerprint SHA-256: ${value(ssl?.certificateFingerprint256)}`,
    `Message: ${value(i.message)}`,
    "",
    `📌${section("Acknowledge")}`,
    `Acknowledge By: ${value(i.acknowledgement.by?.name)}`,
    `Acknowledge Note: ${value(i.acknowledgement.note)}`,
    `Acknowledge At: ${formatDate(i.acknowledgement.at)}`,
    "",
    `📌${section("Postpone")}`,
    `Postpone By: ${value(i.postpone.by?.name)}`,
    `Postpone Note: ${value(i.postpone.remark)}`,
    `Postpone At: ${formatDate(i.postpone.at)}`,
    `Postpone Until: ${formatDate(i.postpone.until)}`,
  ].join("\n");
}

export function formatAlertMessage(payload: AlertWebhookDto): string {
  if (payload.incident.source === "SSL") {
    return formatSslAlertMessage(payload);
  }

  return formatIncidentAlertMessage(payload);
}
