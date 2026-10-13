/** Maximum opportunity value in minor units (fits a Postgres INTEGER). */
export const MAX_VALUE_CENTS = 2_000_000_000;

export function formatMoney(cents: number, currency = "USD", opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Parses a user-entered amount such as "1,250.50" into integer cents. */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "number" ? String(input) : input.replace(/[,\s$€£]/g, "");
  if (raw === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(raw)) return Number.NaN;
  const [whole, fraction = ""] = raw.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
