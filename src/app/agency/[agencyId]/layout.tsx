import { AppShell } from "@/components/shell/app-shell";
import { listAccessibleWorkspaces } from "@/server/authz/context";
import { requireAgencyPage } from "@/server/request";
import { listNotifications } from "@/server/services/notifications";

export default async function AgencyLayout({ children, params }: LayoutProps<"/agency/[agencyId]">) {
  const { agencyId } = await params;
  const ctx = await requireAgencyPage(agencyId);
  const [groups, notifications] = await Promise.all([listAccessibleWorkspaces(ctx.userId), listNotifications(ctx.userId, 15)]);
  return (
    <AppShell
      sidebar={{ groups, current: { kind: "agency", agencyId: ctx.agencyId, agencyName: ctx.agency.name } }}
      topbar={{ user: { name: ctx.user.name, email: ctx.user.email }, notifications }}
    >
      {children}
    </AppShell>
  );
}
