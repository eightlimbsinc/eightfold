/**
 * Typed application errors. Services throw these; the action layer converts
 * them into safe, user-facing results. Unknown errors are logged server-side
 * and surfaced as a generic message so internals never leak to the client.
 */
export type FieldErrors = Record<string, string[] | undefined>;

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "DUPLICATE",
    public readonly details?: { fieldErrors?: FieldErrors; duplicateId?: string },
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You must be signed in.") {
    super(message, "UNAUTHENTICATED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "FORBIDDEN");
  }
}

/** Also used for records in other tenants so their existence is not disclosed. */
export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super(`${entity} not found.`, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super(message, "VALIDATION", { fieldErrors });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

export class DuplicateContactError extends AppError {
  constructor(public readonly duplicateId: string, matchedOn: "email" | "phone") {
    super(`A contact with this ${matchedOn} already exists in this workspace.`, "DUPLICATE", { duplicateId });
  }
}
