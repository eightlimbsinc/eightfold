/**
 * Product modules and their delivery status. Planned modules are shown in
 * navigation with a "Planned" label and an explanatory page — never as if
 * they were functional.
 */
export interface PlannedModule {
  slug: string;
  name: string;
  phase: string;
  summary: string;
  capabilities: string[];
}

export const PLANNED_MODULES: PlannedModule[] = [
  {
    slug: "conversations",
    name: "Conversations",
    phase: "Phase 3",
    summary: "A unified inbox for email and SMS conversations with every contact.",
    capabilities: ["Unified inbox and threads", "Internal notes and assignment", "Email and SMS provider adapters", "Consent, opt-out and suppression handling"],
  },
  {
    slug: "automation",
    name: "Automation",
    phase: "Phase 2",
    summary: "Visual workflows triggered by CRM events, with durable delayed execution.",
    capabilities: ["Triggers: contact created/updated, tag added, stage changed", "Conditions, branching and delays", "Execution history with step-level logs", "Retries, cancellation and versioned publishing"],
  },
  {
    slug: "sites",
    name: "Websites & Funnels",
    phase: "Phase 4",
    summary: "Structured page and funnel builder with draft, preview and publish states.",
    capabilities: ["Page and section editor", "Reusable components", "Preview mode", "Conversion tracking"],
  },
  {
    slug: "forms",
    name: "Forms & Surveys",
    phase: "Phase 4",
    summary: "Lead-capture forms that create and update contacts automatically.",
    capabilities: ["Form builder", "Submissions inbox", "Contact creation from submissions", "Spam protection"],
  },
  {
    slug: "email",
    name: "Email Marketing",
    phase: "Phase 6",
    summary: "Campaigns to segmented audiences with delivery and engagement reporting.",
    capabilities: ["Segments", "Campaign editor", "Scheduling", "Campaign reporting"],
  },
  {
    slug: "calendars",
    name: "Calendars",
    phase: "Phase 5",
    summary: "Booking pages, availability rules and appointment management.",
    capabilities: ["Availability and appointment types", "Booking pages", "Rescheduling and cancellation", "Time-zone aware reminders"],
  },
  {
    slug: "reputation",
    name: "Reputation",
    phase: "Phase 6",
    summary: "Review requests and monitoring through optional integrations.",
    capabilities: ["Review requests", "Review monitoring", "Response workflows"],
  },
  {
    slug: "social",
    name: "Social Planner",
    phase: "Phase 6",
    summary: "Plan and publish social posts through optional integrations.",
    capabilities: ["Content calendar", "Scheduled publishing", "Account connections"],
  },
  {
    slug: "reporting",
    name: "Reporting",
    phase: "Phase 6",
    summary: "Analytics dashboards, attribution and exportable reports.",
    capabilities: ["Pipeline and activity reports", "Attribution tracking", "CSV export"],
  },
  {
    slug: "billing",
    name: "Billing & Payments",
    phase: "Phase 7",
    summary: "Invoices, payments and agency subscription plans via optional providers.",
    capabilities: ["Invoices and payment links", "Subscription plans and usage limits", "Provider adapters (optional)"],
  },
  {
    slug: "integrations",
    name: "Integrations",
    phase: "Phase 7",
    summary: "Connect third-party services with encrypted credential storage.",
    capabilities: ["Integration catalog", "Encrypted credentials", "Webhooks"],
  },
];
