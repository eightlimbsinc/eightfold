import { describe, expect, it } from "vitest";
import { contactInput, contactListQuery, customFieldDefinitionInput, opportunityInput, pipelineInput, taskInput } from "@/lib/validation/crm";
import { invitationInput, workspaceInput } from "@/lib/validation/tenancy";
import { normalizeEmail, normalizePhone, contactDisplayName } from "@/lib/normalize";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { slugify } from "@/lib/utils";

describe("contactInput", () => {
  it("accepts a contact with only a phone number", () => {
    const r = contactInput.safeParse({ phone: "+1 (555) 010-2000" });
    expect(r.success).toBe(true);
  });

  it("requires at least one identifying field", () => {
    const r = contactInput.safeParse({ firstName: "  ", email: "" });
    expect(r.success).toBe(false);
  });

  it("validates email format and trims values", () => {
    expect(contactInput.safeParse({ email: "not-an-email" }).success).toBe(false);
    const ok = contactInput.parse({ email: "  Ada@Example.com ", firstName: " Ada " });
    expect(ok.email).toBe("Ada@Example.com");
    expect(ok.firstName).toBe("Ada");
    expect(ok.lifecycleStatus).toBe("LEAD");
  });

  it("rejects invalid phone numbers and lifecycle values", () => {
    expect(contactInput.safeParse({ phone: "call me maybe" }).success).toBe(false);
    expect(contactInput.safeParse({ firstName: "A", lifecycleStatus: "VIP" }).success).toBe(false);
  });
});

describe("contactListQuery", () => {
  it("applies defaults and clamps invalid paging", () => {
    const q = contactListQuery.parse({ page: "-4", pageSize: "100000", sort: "" });
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(25);
    expect(q.sort).toBe("createdAt");
    expect(q.dir).toBe("desc");
  });
  it("rejects unknown sort columns", () => {
    expect(contactListQuery.safeParse({ sort: "password" }).success).toBe(false);
  });
});

describe("opportunityInput", () => {
  it("parses money to cents", () => {
    const o = opportunityInput.parse({ name: "Deal", pipelineId: "p", stageId: "s", valueCents: "1,250.50" });
    expect(o.valueCents).toBe(125050);
  });
  it("rejects negative and malformed amounts", () => {
    expect(opportunityInput.safeParse({ name: "D", pipelineId: "p", stageId: "s", valueCents: "-5" }).success).toBe(false);
    expect(opportunityInput.safeParse({ name: "D", pipelineId: "p", stageId: "s", valueCents: "12.345" }).success).toBe(false);
  });
  it("parses expected close dates as UTC calendar dates", () => {
    const o = opportunityInput.parse({ name: "D", pipelineId: "p", stageId: "s", expectedCloseDate: "2026-12-01" });
    expect(o.expectedCloseDate?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("pipelineInput", () => {
  it("requires unique, non-empty stages", () => {
    expect(pipelineInput.safeParse({ name: "P", stages: [] }).success).toBe(false);
    expect(pipelineInput.safeParse({ name: "P", stages: [{ name: "A" }, { name: "a" }] }).success).toBe(false);
    expect(pipelineInput.safeParse({ name: "P", stages: [{ name: "A", probability: "150" }] }).success).toBe(false);
    expect(pipelineInput.safeParse({ name: "P", stages: [{ name: "A", probability: "25" }] }).success).toBe(true);
  });
});

describe("customFieldDefinitionInput", () => {
  it("requires options for select types and parses newline lists", () => {
    expect(customFieldDefinitionInput.safeParse({ label: "Tier", type: "SINGLE_SELECT", options: "" }).success).toBe(false);
    const d = customFieldDefinitionInput.parse({ label: "Tier", type: "SINGLE_SELECT", options: "Gold\nSilver, Bronze" });
    expect(d.options).toEqual(["Gold", "Silver", "Bronze"]);
  });
});

describe("taskInput", () => {
  it("requires a title and parses due dates", () => {
    expect(taskInput.safeParse({ title: "" }).success).toBe(false);
    expect(taskInput.parse({ title: "Call", dueAt: "2026-10-20T09:30" }).dueAt).toBeInstanceOf(Date);
  });
});

describe("tenancy inputs", () => {
  it("validates time zones", () => {
    expect(workspaceInput.safeParse({ name: "W", timezone: "America/New_York" }).success).toBe(true);
    expect(workspaceInput.safeParse({ name: "W", timezone: "Mars/Olympus" }).success).toBe(false);
  });
  it("requires a workspace for workspace-level invitations", () => {
    expect(invitationInput.safeParse({ email: "a@b.co", role: "WORKSPACE_MEMBER" }).success).toBe(false);
    expect(invitationInput.safeParse({ email: "a@b.co", role: "AGENCY_ADMIN" }).success).toBe(true);
  });
});

describe("normalization helpers", () => {
  it("normalizes emails and phones", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(normalizeEmail("  ")).toBeNull();
    expect(normalizePhone("+1 (555) 010-2000")).toBe("+15550102000");
    expect(normalizePhone("555.010.2000")).toBe("5550102000");
    expect(normalizePhone("12")).toBeNull();
  });
  it("builds display names with fallbacks", () => {
    expect(contactDisplayName({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
    expect(contactDisplayName({ email: "x@y.z" })).toBe("x@y.z");
    expect(contactDisplayName({})).toBe("Unnamed contact");
  });
  it("parses and formats money", () => {
    expect(parseMoneyToCents("$1,000")).toBe(100000);
    expect(parseMoneyToCents("0.5")).toBe(50);
    expect(parseMoneyToCents("1.234")).toBeNaN();
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatMoney(100000, "USD")).toBe("$1,000");
  });
  it("slugifies names", () => {
    expect(slugify("  8limbs Inc. — Agency! ")).toBe("8limbs-inc-agency");
    expect(slugify("Ñandú Café")).toBe("nandu-cafe");
  });
});
