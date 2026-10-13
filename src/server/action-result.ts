import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError, type FieldErrors } from "./errors";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors; duplicateId?: string; code?: string };

/**
 * Runs a Server Action body and converts failures into a serializable result.
 * Known AppErrors become user-facing messages; anything else is logged and
 * replaced by a generic message so internals never reach the browser.
 * Next.js control-flow errors (redirect, notFound) are re-thrown.
 */
export async function runAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) {
      return {
        ok: false,
        error: error.message,
        code: error.code,
        fieldErrors: error.details?.fieldErrors,
        duplicateId: error.details?.duplicateId,
      };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors as FieldErrors };
    }
    console.error("[action] unexpected error", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Converts FormData into a plain object. Repeated keys become arrays, keys
 * prefixed with "cf:" are collected into `customFields`, and keys listed in
 * `arrays` are always arrays (even with zero or one value).
 */
export function formToObject(formData: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const customFields: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = formData.getAll(key).map((v) => (typeof v === "string" ? v : ""));
    if (key.startsWith("cf:")) {
      const fieldId = key.slice(3);
      const multi = formData.get(`cfmulti:${fieldId}`) !== null;
      customFields[fieldId] = multi ? values.filter((v) => v !== "") : values[values.length - 1];
      continue;
    }
    if (key.startsWith("cfmulti:")) continue;
    out[key] = arrays.includes(key) || values.length > 1 ? values.filter((v) => v !== "") : values[0];
  }
  // A multi-select with nothing checked submits only its marker: treat as cleared.
  for (const key of formData.keys()) {
    if (key.startsWith("cfmulti:") && !(key.slice(8) in customFields)) customFields[key.slice(8)] = [];
  }
  for (const key of arrays) if (!(key in out)) out[key] = [];
  if (Object.keys(customFields).length > 0) out.customFields = customFields;
  return out;
}
