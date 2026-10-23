const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeExamDate(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  if (/^\d{1,6}(?:\.\d+)?$/.test(input)) {
    const serial = Number(input);
    if (serial < 1 || serial > 2958465) return null;
    const date = new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * DAY_MS);
    return date.toISOString().slice(0, 10);
  }

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  const dayFirstMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(input);
  const match = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : dayFirstMatch
      ? { year: Number(dayFirstMatch[3]), month: Number(dayFirstMatch[2]), day: Number(dayFirstMatch[1]) }
      : null;
  if (!match) return null;

  const date = new Date(Date.UTC(match.year, match.month - 1, match.day));
  if (date.getUTCFullYear() !== match.year || date.getUTCMonth() !== match.month - 1 || date.getUTCDate() !== match.day) return null;
  return `${match.year.toString().padStart(4, '0')}-${match.month.toString().padStart(2, '0')}-${match.day.toString().padStart(2, '0')}`;
}

export function formatExamDate(value: string): string {
  const normalized = normalizeExamDate(value);
  if (!normalized) return value;
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}
