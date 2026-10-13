/**
 * Pure custom-field value validation. Converts raw form/API input into the
 * typed storage columns of ContactFieldValue, rejecting values that do not
 * match the field definition.
 */
export type CustomFieldType = "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SINGLE_SELECT" | "MULTI_SELECT";

export interface FieldDefinitionLike {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
}

export interface StoredFieldValue {
  textValue: string | null;
  numberValue: number | null;
  dateValue: Date | null;
  boolValue: boolean | null;
  optionValues: string[];
}

export type ParseResult = { ok: true; value: StoredFieldValue | null } | { ok: false; error: string };

const EMPTY: StoredFieldValue = { textValue: null, numberValue: null, dateValue: null, boolValue: null, optionValues: [] };

function isBlank(raw: unknown): boolean {
  return (
    raw === undefined ||
    raw === null ||
    (typeof raw === "string" && raw.trim() === "") ||
    (Array.isArray(raw) && raw.filter((v) => String(v).trim() !== "").length === 0)
  );
}

/** Returns `value: null` when the field is blank (meaning: clear the stored value). */
export function parseCustomFieldValue(def: FieldDefinitionLike, raw: unknown): ParseResult {
  if (def.type !== "BOOLEAN" && isBlank(raw)) {
    return def.required ? { ok: false, error: `${def.label} is required` } : { ok: true, value: null };
  }

  switch (def.type) {
    case "TEXT": {
      if (typeof raw !== "string") return { ok: false, error: `${def.label} must be text` };
      const text = raw.trim();
      if (text.length > 1000) return { ok: false, error: `${def.label} must be 1000 characters or fewer` };
      return { ok: true, value: { ...EMPTY, textValue: text } };
    }
    case "NUMBER": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(/,/g, "")) : NaN;
      if (!Number.isFinite(n)) return { ok: false, error: `${def.label} must be a number` };
      if (Math.abs(n) > 1e15) return { ok: false, error: `${def.label} is out of range` };
      return { ok: true, value: { ...EMPTY, numberValue: n } };
    }
    case "DATE": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
        return { ok: false, error: `${def.label} must be a date (YYYY-MM-DD)` };
      }
      const d = new Date(`${raw.trim()}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw.trim()) {
        return { ok: false, error: `${def.label} must be a valid date` };
      }
      return { ok: true, value: { ...EMPTY, dateValue: d } };
    }
    case "BOOLEAN": {
      if (raw === undefined || raw === null || raw === "") {
        return def.required ? { ok: false, error: `${def.label} is required` } : { ok: true, value: null };
      }
      const truthy = [true, "true", "on", "yes", "1"];
      const falsy = [false, "false", "off", "no", "0"];
      if (truthy.includes(raw as never)) return { ok: true, value: { ...EMPTY, boolValue: true } };
      if (falsy.includes(raw as never)) return { ok: true, value: { ...EMPTY, boolValue: false } };
      return { ok: false, error: `${def.label} must be yes or no` };
    }
    case "SINGLE_SELECT": {
      if (typeof raw !== "string" || !def.options.includes(raw.trim())) {
        return { ok: false, error: `${def.label} must be one of the allowed options` };
      }
      return { ok: true, value: { ...EMPTY, optionValues: [raw.trim()] } };
    }
    case "MULTI_SELECT": {
      const values = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim()).filter(Boolean);
      const unique = [...new Set(values)];
      const invalid = unique.filter((v) => !def.options.includes(v));
      if (invalid.length > 0) return { ok: false, error: `${def.label} contains an invalid option: ${invalid[0]}` };
      return { ok: true, value: { ...EMPTY, optionValues: unique } };
    }
  }
}

/** Renders a stored value as display text. */
export function formatCustomFieldValue(type: CustomFieldType, value: Partial<StoredFieldValue> | null | undefined): string {
  if (!value) return "—";
  switch (type) {
    case "TEXT":
      return value.textValue || "—";
    case "NUMBER":
      return value.numberValue === null || value.numberValue === undefined
        ? "—"
        : new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value.numberValue);
    case "DATE":
      return value.dateValue
        ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value.dateValue))
        : "—";
    case "BOOLEAN":
      return value.boolValue === null || value.boolValue === undefined ? "—" : value.boolValue ? "Yes" : "No";
    case "SINGLE_SELECT":
    case "MULTI_SELECT":
      return value.optionValues && value.optionValues.length > 0 ? value.optionValues.join(", ") : "—";
  }
}

/** Derives a stable machine key from a label, e.g. "Annual Budget ($)" -> "annual_budget". */
export function fieldKeyFromLabel(label: string): string {
  const key = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(key) ? key : `field_${key}`.slice(0, 40);
}
