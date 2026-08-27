export const ALERT_SOURCES = ['NOMAD', 'CONSUL', 'MINIO', 'SSL'] as const;

export type AlertSource = (typeof ALERT_SOURCES)[number];

export function isAlertSource(value: unknown): value is AlertSource {
  return typeof value === 'string' && ALERT_SOURCES.includes(value as AlertSource);
}
