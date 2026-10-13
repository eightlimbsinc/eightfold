import { z } from "zod";

/** Treats "", whitespace, null and undefined as absent, otherwise a trimmed string with a max length. */
export const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : v === null ? undefined : v),
    z.string().max(max, `Must be ${max} characters or fewer`).optional(),
  );

export const requiredText = (max: number, label = "This field") =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(max, `Must be ${max} characters or fewer`),
  );

export const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === "none" ? undefined : v),
  z.string().min(1).max(64).optional(),
);

export const id = z.string().min(1).max(64);

export const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : v === null ? undefined : v),
  z.email("Enter a valid email address").max(254).optional(),
);

/** A calendar date in yyyy-mm-dd form, parsed to UTC midnight. */
export const optionalCalendarDate = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date")
    .transform((s) => new Date(`${s}T00:00:00Z`))
    .optional(),
);

/** A point in time from <input type="datetime-local"> or ISO string. */
export const optionalDateTime = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date and time")
    .transform((s) => new Date(s))
    .optional(),
);

export const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

export const COLORS = ["slate", "gold", "navy", "green", "red", "blue", "purple", "orange", "teal", "pink"] as const;
export type TagColor = (typeof COLORS)[number];

export const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "JPY", "INR", "MXN", "BRL", "ZAR", "SGD"] as const;

let cachedTimeZones: Set<string> | null = null;
export function isValidTimeZone(tz: string): boolean {
  if (!cachedTimeZones) {
    cachedTimeZones = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);
  }
  return cachedTimeZones.has(tz);
}
