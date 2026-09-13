/**
 * Formats a Date or ISO timestamp string into India Standard Time (IST).
 * Format: "13 Aug 2026 · 19:48:00 IST" or short formats for tables.
 */
export function formatIST(
  dateInput?: string | number | Date | null,
  options?: { includeTimeOnly?: boolean; includeDateOnly?: boolean; compact?: boolean }
): string {
  if (!dateInput) return '—';

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  if (options?.includeTimeOnly) {
    const timeStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
    return `${timeStr} IST`;
  }

  if (options?.includeDateOnly) {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  const dayMonthYear = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

  const timeStr = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  if (options?.compact) {
    return `${dayMonthYear}, ${timeStr} IST`;
  }

  return `${dayMonthYear} · ${timeStr} IST`;
}
