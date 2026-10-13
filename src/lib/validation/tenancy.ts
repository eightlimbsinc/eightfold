import { z } from "zod";
import { CURRENCIES, isValidTimeZone, requiredText } from "./common";

export const DUPLICATE_POLICIES = ["NONE", "EMAIL", "EMAIL_OR_PHONE"] as const;

export const agencyInput = z.object({
  name: requiredText(80, "Agency name"),
});

export const workspaceInput = z.object({
  name: requiredText(80, "Workspace name"),
  timezone: z
    .string()
    .default("UTC")
    .refine((tz) => isValidTimeZone(tz), "Choose a valid time zone"),
  currency: z.enum(CURRENCIES).default("USD"),
});

export const workspaceSettingsInput = workspaceInput.extend({
  duplicatePolicy: z.enum(DUPLICATE_POLICIES),
});

export const onboardingInput = z.object({
  agencyName: requiredText(80, "Agency name"),
  workspaceName: requiredText(80, "Workspace name"),
  timezone: workspaceInput.shape.timezone,
});

export const INVITATION_ROLES = ["AGENCY_OWNER", "AGENCY_ADMIN", "WORKSPACE_ADMIN", "WORKSPACE_MEMBER"] as const;

export const invitationInput = z
  .object({
    email: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.email("Enter a valid email address").max(254)),
    role: z.enum(INVITATION_ROLES),
    workspaceId: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(64).optional()),
  })
  .refine((v) => (v.role.startsWith("WORKSPACE_") ? !!v.workspaceId : true), {
    message: "Choose a workspace for workspace-level roles",
    path: ["workspaceId"],
  });

export const profileInput = z.object({
  name: requiredText(80, "Name"),
});
