/** Formats a date for display in compact business tables. */
export function formatDate(date: Date | string | null | undefined, timeZone?: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(
    new Date(date),
  );
}

export function formatDateTime(date: Date | string | null | undefined, timeZone?: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(date));
}

/** Formats a calendar (date-only) value stored as UTC midnight. */
export function formatCalendarDate(date: Date | string | null | undefined): string {
  return formatDate(date, "UTC");
}

/** yyyy-mm-dd for <input type="date"> from a UTC calendar date. */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const diffMs = new Date(date).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minute = 60_000, hour = 60 * minute, day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), "day");
  return formatDate(date);
}
