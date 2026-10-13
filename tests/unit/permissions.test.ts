import { describe, expect, it } from "vitest";
import { canAssignRole, hasPermission, highestRole, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "@/lib/permissions";

describe("role permissions", () => {
  it("is strictly hierarchical: each role includes every permission of the role below it", () => {
    const ordered = ["WORKSPACE_MEMBER", "WORKSPACE_ADMIN", "AGENCY_ADMIN", "AGENCY_OWNER"] as const;
    for (let i = 1; i < ordered.length; i++) {
      for (const p of ROLE_PERMISSIONS[ordered[i - 1]]) {
        expect(ROLE_PERMISSIONS[ordered[i]].has(p), `${ordered[i]} should have ${p}`).toBe(true);
      }
    }
  });

  it("only references declared permissions", () => {
    for (const role of ROLES) for (const p of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(p);
  });

  it("workspace members can work CRM records but not administer", () => {
    expect(hasPermission("WORKSPACE_MEMBER", "contacts:write")).toBe(true);
    expect(hasPermission("WORKSPACE_MEMBER", "opportunities:write")).toBe(true);
    expect(hasPermission("WORKSPACE_MEMBER", "contacts:delete")).toBe(false);
    expect(hasPermission("WORKSPACE_MEMBER", "pipelines:manage")).toBe(false);
    expect(hasPermission("WORKSPACE_MEMBER", "custom_fields:manage")).toBe(false);
    expect(hasPermission("WORKSPACE_MEMBER", "workspace:members:manage")).toBe(false);
  });

  it("workspace admins cannot manage the agency", () => {
    expect(hasPermission("WORKSPACE_ADMIN", "pipelines:manage")).toBe(true);
    expect(hasPermission("WORKSPACE_ADMIN", "agency:update")).toBe(false);
    expect(hasPermission("WORKSPACE_ADMIN", "workspace:create")).toBe(false);
  });

  it("only owners manage owners", () => {
    expect(hasPermission("AGENCY_ADMIN", "agency:owners:manage")).toBe(false);
    expect(hasPermission("AGENCY_OWNER", "agency:owners:manage")).toBe(true);
  });

  it("denies everything to a missing role", () => {
    expect(hasPermission(null, "workspace:read")).toBe(false);
    expect(hasPermission(undefined, "contacts:read")).toBe(false);
  });
});

describe("highestRole", () => {
  it("picks the most privileged role", () => {
    expect(highestRole(["WORKSPACE_MEMBER", "AGENCY_ADMIN", null])).toBe("AGENCY_ADMIN");
    expect(highestRole([null, undefined])).toBeNull();
  });
});

describe("canAssignRole", () => {
  it("enforces who may grant which role", () => {
    expect(canAssignRole("AGENCY_OWNER", "AGENCY_OWNER")).toBe(true);
    expect(canAssignRole("AGENCY_ADMIN", "AGENCY_OWNER")).toBe(false);
    expect(canAssignRole("AGENCY_ADMIN", "AGENCY_ADMIN")).toBe(true);
    expect(canAssignRole("WORKSPACE_ADMIN", "AGENCY_ADMIN")).toBe(false);
    expect(canAssignRole("WORKSPACE_ADMIN", "WORKSPACE_ADMIN")).toBe(true);
    expect(canAssignRole("WORKSPACE_MEMBER", "WORKSPACE_MEMBER")).toBe(false);
  });
});
