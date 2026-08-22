import { format, isValid, parseISO } from 'date-fns';

export function safeFormatTime(value: string, pattern: string, fallback = '—'): string {
  try {
    const d = parseISO(value.includes('T') && value.length === 13 ? `${value}:00:00` : value);
    return isValid(d) ? format(d, pattern) : fallback;
  } catch {
    return fallback;
  }
}
