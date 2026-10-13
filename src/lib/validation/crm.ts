import { z } from "zod";
import { MAX_VALUE_CENTS, parseMoneyToCents } from "../money";
import {
  COLORS,
  id,
  optionalCalendarDate,
  optionalDateTime,
  optionalEmail,
  optionalId,
  optionalText,
  requiredText,
} from "./common";

export const LIFECYCLE_STATUSES = ["LEAD", "QUALIFIED", "CUSTOMER", "INACTIVE"] as const;
export const LIFECYCLE_LABELS: Record<(typeof LIFECYCLE_STATUSES)[number], string> = {
  LEAD: "Lead",
  QUALIFIED: "Qualified",
  CUSTOMER: "Customer",
  INACTIVE: "Inactive",
};

const idArray = z.preprocess(
  (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]),
  z.array(id).max(100),
);

export const contactInput = z
  .object({
    firstName: optionalText(80),
    lastName: optionalText(80),
    email: optionalEmail,
    phone: optionalText(40).refine((v) => !v || /^[+()\-.\s\d]{4,40}(\s*(x|ext\.?)\s*\d{1,6})?$/i.test(v), {
      message: "Enter a valid phone number",
    }),
    company: optionalText(120),
    source: optionalText(80),
    lifecycleStatus: z.enum(LIFECYCLE_STATUSES).default("LEAD"),
    assignedToId: optionalId,
    tagIds: idArray.optional(),
    /** Raw custom-field input keyed by field definition id; validated against definitions in the service. */
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((c) => !!(c.firstName || c.lastName || c.email || c.phone || c.company), {
    message: "Provide at least a name, email, phone, or company",
    path: ["firstName"],
  });
export type ContactInput = z.infer<typeof contactInput>;

export const CONTACT_SORTS = ["createdAt", "updatedAt", "name", "email", "company"] as const;

export const contactListQuery = z.object({
  q: optionalText(100),
  tag: optionalId,
  status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(LIFECYCLE_STATUSES).optional()),
  assignee: optionalId,
  source: optionalText(80),
  archived: z.preprocess((v) => v === "1" || v === "true" || v === true, z.boolean()).default(false),
  sort: z.preprocess((v) => (v === "" ? undefined : v), z.enum(CONTACT_SORTS).default("createdAt")),
  dir: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["asc", "desc"]).default("desc")),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(25).default(25),
});
export type ContactListQuery = z.infer<typeof contactListQuery>;

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT"] as const;
export const CUSTOM_FIELD_TYPE_LABELS: Record<(typeof CUSTOM_FIELD_TYPES)[number], string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes / No",
  SINGLE_SELECT: "Single select",
  MULTI_SELECT: "Multi-select",
};

const optionsList = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
      : v ?? [],
  z
    .array(z.string().min(1).max(80))
    .max(100, "At most 100 options")
    .refine((opts) => new Set(opts.map((o) => o.toLowerCase())).size === opts.length, "Options must be unique"),
);

export const customFieldDefinitionInput = z
  .object({
    label: requiredText(60, "Label"),
    key: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z
        .string()
        .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lowercase letters, numbers, and underscores; start with a letter")
        .optional(),
    ),
    type: z.enum(CUSTOM_FIELD_TYPES),
    options: optionsList,
    required: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  })
  .refine((d) => (d.type === "SINGLE_SELECT" || d.type === "MULTI_SELECT" ? d.options.length > 0 : true), {
    message: "Add at least one option",
    path: ["options"],
  });

export const tagInput = z.object({
  name: requiredText(40, "Tag name"),
  color: z.enum(COLORS).default("slate"),
});

export const pipelineInput = z.object({
  name: requiredText(80, "Pipeline name"),
  stages: z
    .array(
      z.object({
        id: optionalId,
        name: requiredText(60, "Stage name"),
        probability: z.preprocess(
          (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
          z.number().int().min(0).max(100).optional(),
        ),
      }),
    )
    .min(1, "A pipeline needs at least one stage")
    .max(30, "At most 30 stages")
    .refine((s) => new Set(s.map((x) => x.name.toLowerCase())).size === s.length, "Stage names must be unique"),
});
export type PipelineInput = z.infer<typeof pipelineInput>;

export const OPPORTUNITY_STATUSES = ["OPEN", "WON", "LOST"] as const;

export const moneyCents = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? 0 : parseMoneyToCents(v as string | number)),
  z
    .number({ error: "Enter a valid amount" })
    .refine((n) => Number.isFinite(n), "Enter a valid amount (e.g. 1250 or 1250.50)")
    .pipe(z.number().int().min(0, "Value cannot be negative").max(MAX_VALUE_CENTS, "Value is too large")),
);

export const opportunityInput = z.object({
  name: requiredText(120, "Opportunity name"),
  pipelineId: id,
  stageId: id,
  contactId: optionalId,
  valueCents: moneyCents,
  status: z.enum(OPPORTUNITY_STATUSES).default("OPEN"),
  expectedCloseDate: optionalCalendarDate,
  assignedToId: optionalId,
  source: optionalText(80),
});
export type OpportunityInput = z.infer<typeof opportunityInput>;

export const moveOpportunityInput = z.object({
  opportunityId: id,
  stageId: id,
});

export const taskInput = z.object({
  title: requiredText(160, "Title"),
  description: optionalText(2000),
  dueAt: optionalDateTime,
  assigneeId: optionalId,
  contactId: optionalId,
  opportunityId: optionalId,
});
export type TaskInput = z.infer<typeof taskInput>;

export const TASK_FILTERS = ["open", "mine", "overdue", "completed", "all"] as const;

export const noteInput = z
  .object({
    body: requiredText(10_000, "Note"),
    contactId: optionalId,
    opportunityId: optionalId,
  })
  .refine((n) => !!(n.contactId || n.opportunityId), { message: "A note must belong to a contact or opportunity" });
