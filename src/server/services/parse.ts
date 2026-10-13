import { z } from "zod";
import { ValidationError } from "../errors";

/** Validates input with a Zod schema, throwing a ValidationError with field errors. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const flattened = z.flattenError(result.error);
    const fieldErrors = flattened.fieldErrors as Record<string, string[] | undefined>;
    const first = flattened.formErrors[0] ?? Object.values(fieldErrors).find((v) => v && v.length)?.[0];
    throw new ValidationError(first ?? "Please check the highlighted fields.", fieldErrors);
  }
  return result.data;
}
