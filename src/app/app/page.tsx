import { redirect } from "next/navigation";
import { listAccessibleWorkspaces } from "@/server/authz/context";
import { getLastWorkspaceId, requireUser } from "@/server/request";

/** Routes a signed-in user to their last workspace, their first workspace, or onboarding. */
export default async function AppEntry() {
  const user = await requireUser();
  const groups = await listAccessibleWorkspaces(user.id);
  const all = groups.flatMap((g) => g.workspaces);
  const last = await getLastWorkspaceId();
  const target = all.find((w) => w.id === last) ?? all[0];
  if (target) redirect(`/w/${target.id}`);
  const agency = groups.find((g) => g.agencyRole);
  if (agency) redirect(`/agency/${agency.agencyId}`);
  redirect("/onboarding");
}
