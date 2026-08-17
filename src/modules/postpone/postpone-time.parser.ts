import { HttpError } from '../../shared/errors/http-error.js';

export const POSTPONE_TIME_FORMAT = 'DD-MM-YYYY HH:mm';
export const POSTPONE_TIMEZONE = 'Asia/Jakarta';

export interface ParsedPostponeTime {
  iso: string;
  display: string;
}

export function parsePostponeTime(
  input: string,
  now: Date = new Date(),
): ParsedPostponeTime {
  const value = input.trim();
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new HttpError(400, `Format waktu harus ${POSTPONE_TIME_FORMAT}`);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new HttpError(400, 'Tanggal atau waktu tidak valid');
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw new HttpError(400, 'Tanggal atau waktu tidak valid');
  }

  // Asia/Jakarta is UTC+07:00. Convert the local absolute input to UTC for comparison.
  const targetEpoch = Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0);
  if (targetEpoch <= now.getTime()) {
    throw new HttpError(400, 'Waktu postpone harus lebih besar dari waktu sekarang');
  }

  const pad = (number: number): string => String(number).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+07:00`;

  return {
    iso,
    display: `${pad(day)}-${pad(month)}-${year} ${pad(hour)}:${pad(minute)} WIB`,
  };
}
