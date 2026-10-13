import Link from "next/link";
import { CheckSquare, KanbanSquare, Plus, UserPlus, Users } from "lucide-react";
import { requireWorkspacePage } from "@/server/request";
import { getDashboard } from "@/server/services/dashboard";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { Badge, LIFECYCLE_TONES } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, Panel, PanelHeader, Stat } from "@/components/ui/panel";
import { contactDisplayName } from "@/lib/normalize";
import { formatMoney } from "@/lib/money";
import { formatDateTime, relativeTime } from "@/lib/dates";
import { LIFECYCLE_LABELS } from "@/lib/validation/crm";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspacePage(workspaceId);
  const d = await getDashboard(ctx);
  const base = `/w/${workspaceId}`;
  const cur = ctx.workspace.currency;
  const isNew = d.totalContacts === 0 && d.openOpportunities === 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Dashboard"
        description={`${ctx.workspace.name} · ${ctx.workspace.agencyName}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`${base}/tasks?new=1`}>
                <CheckSquare /> New task
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`${base}/opportunities/new`}>
                <KanbanSquare /> New opportunity
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${base}/contacts/new`}>
                <UserPlus /> New contact
              </Link>
            </Button>
          </>
        }
      />

      {isNew && (
        <Panel className="mb-5 border-gold-300/70 bg-gold-50/60">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[14px] font-semibold">Get this workspace running</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                Add your first contacts, review the default sales pipeline, and invite the client&apos;s team.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={`${base}/contacts/new`}>Add a contact</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href={`${base}/pipelines`}>Review pipeline</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href={`${base}/settings/members`}>Invite team</Link>
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contacts" value={d.totalContacts.toLocaleString()} sub={`+${d.newContacts30d} in the last 30 days`} href={`${base}/contacts`} />
        <Stat label="Open opportunities" value={d.openOpportunities.toLocaleString()} sub={`${d.wonThisMonth.count} won this month`} href={`${base}/pipelines`} />
        <Stat
          label="Open pipeline value"
          value={formatMoney(d.pipelineValueCents, cur, { compact: d.pipelineValueCents >= 100_000_000 })}
          sub={`${formatMoney(d.wonThisMonth.valueCents, cur)} won this month`}
          href={`${base}/pipelines`}
        />
        <Stat
          label="Tasks due"
          value={d.tasksDue.toLocaleString()}
          sub={d.tasksOverdue > 0 ? <span className="text-red-700">{d.tasksOverdue} overdue</span> : "Nothing overdue"}
          href={`${base}/tasks?filter=${d.tasksOverdue > 0 ? "overdue" : "open"}`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Panel>
            <PanelHeader
              title="Recently added contacts"
              actions={
                <Link href={`${base}/contacts`} className="text-[12.5px] font-medium text-navy-700 hover:underline">
                  View all
                </Link>
              }
            />
            {d.recentContacts.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title="No contacts yet"
                description="Contacts you add or import will appear here."
                action={
                  <Button asChild size="sm">
                    <Link href={`${base}/contacts/new`}>
                      <Plus /> Add contact
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {d.recentContacts.map((c) => (
                  <li key={c.id}>
                    <Link href={`${base}/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{contactDisplayName(c)}</span>
                        <span className="block truncate text-[12px] text-ink-faint">{[c.email, c.company].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                      <Badge tone={LIFECYCLE_TONES[c.lifecycleStatus]}>{LIFECYCLE_LABELS[c.lifecycleStatus]}</Badge>
                      <span className="hidden w-24 text-right text-[12px] text-ink-faint sm:block">{relativeTime(c.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Open pipeline by pipeline" />
            {d.pipelines.length === 0 ? (
              <EmptyState
                icon={<KanbanSquare />}
                title="No open opportunities"
                description="Create an opportunity to start tracking deals through your pipeline."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`${base}/opportunities/new`}>New opportunity</Link>
                  </Button>
                }
              />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] tracking-[0.04em] text-ink-faint uppercase">
                    <th className="px-4 py-2 font-medium">Pipeline</th>
                    <th className="px-4 py-2 text-right font-medium">Open</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {d.pipelines.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5">
                        <Link href={`${base}/pipelines/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="tabular px-4 py-2.5 text-right">{p.count}</td>
                      <td className="tabular px-4 py-2.5 text-right font-medium">{formatMoney(p.valueCents, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <PanelHeader
              title="My open tasks"
              actions={
                <Link href={`${base}/tasks?filter=mine`} className="text-[12.5px] font-medium text-navy-700 hover:underline">
                  All tasks
                </Link>
              }
            />
            {d.myTasks.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-ink-faint">No open tasks assigned to you.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.myTasks.map((t) => {
                  const overdue = t.dueAt && new Date(t.dueAt) < new Date();
                  return (
                    <li key={t.id} className="px-4 py-2.5">
                      <p className="truncate text-[13.5px] font-medium">{t.title}</p>
                      <p className="text-[12px] text-ink-faint">
                        <span className={overdue ? "font-medium text-red-700" : ""}>
                          {t.dueAt ? `Due ${formatDateTime(t.dueAt, ctx.workspace.timezone)}` : "No due date"}
                        </span>
                        {t.contact && <> · {contactDisplayName(t.contact)}</>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Recent activity" />
            <ActivityFeed items={d.activities} workspaceId={workspaceId} currency={cur} emptyText="Activity across this workspace will appear here." />
          </Panel>
        </div>
      </div>
    </div>
  );
}
