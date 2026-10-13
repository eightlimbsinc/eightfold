-- Hand-written integrity constraints that Prisma's schema language cannot express.

-- Opportunity values are non-negative minor units.
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_valueCents_nonnegative" CHECK ("valueCents" >= 0);

-- Stage win probability is a percentage.
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_probability_range"
  CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100));

-- Workspace-level invitations must name a workspace; agency-level ones must not.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_role_workspace_consistency" CHECK (
  ("role" IN ('WORKSPACE_ADMIN', 'WORKSPACE_MEMBER') AND "workspaceId" IS NOT NULL)
  OR ("role" IN ('AGENCY_OWNER', 'AGENCY_ADMIN') AND "workspaceId" IS NULL)
);

-- Contacts must carry at least one identifying attribute.
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_has_identity" CHECK (
  COALESCE(NULLIF(btrim("firstName"), ''), NULLIF(btrim("lastName"), ''),
           NULLIF(btrim("email"), ''), NULLIF(btrim("phone"), ''),
           NULLIF(btrim("company"), '')) IS NOT NULL
);
