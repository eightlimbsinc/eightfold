import { AppShell } from "@/components/shell/app-shell";
import { RememberWorkspace } from "@/components/shell/remember-workspace";
import { listAccessibleWorkspaces } from "@/server/authz/context";
import { requireWorkspacePage } from "@/server/request";
import { listNotifications } from "@/server/services/notifications";
import { isAgencyRole } from "@/lib/permissions";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspacePage(workspaceId);
  const [groups, notifications] = await Promise.all([listAccessibleWorkspaces(ctx.userId), listNotifications(ctx.userId, 15)]);
  const sidebar = {
    groups,
    current: {
      kind: "workspace" as const,
      workspaceId: ctx.workspaceId,
      workspaceName: ctx.workspace.name,
      agencyId: ctx.agencyId,
      agencyName: ctx.workspace.agencyName,
      isAgencyAdmin: isAgencyRole(ctx.role),
    },
  };
  return (
    <AppShell
      sidebar={sidebar}
      topbar={{
        user: { name: ctx.user.name, email: ctx.user.email },
        notifications,
        search: { workspaceId: ctx.workspaceId, currency: ctx.workspace.currency },
      }}
    >
      <RememberWorkspace workspaceId={ctx.workspaceId} />
      {ctx.workspace.archivedAt && (
        <div className="mb-4 rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-[13px] text-gold-700">
          This workspace is archived. Only agency administrators can see it. Restore it from the agency workspace list.
        </div>
      )}
      {children}
    </AppShell>
  );
}
