/** Lower-cases and trims an email for comparison. Returns null for empty input. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Reduces a phone number to digits for comparison, preserving a leading "+".
 * Returns null when fewer than 4 digits remain (not a usable phone number).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return (trimmed.startsWith("+") ? "+" : "") + digits;
}

/** Trims a string and converts empty strings to null. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function contactDisplayName(contact: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return name || contact.email || contact.phone || contact.company || "Unnamed contact";
}
