import { notFound } from "next/navigation";
import { CircleDashed } from "lucide-react";
import { requireWorkspacePage } from "@/server/request";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { PLANNED_MODULES } from "@/lib/modules";

export default async function PlannedModulePage({ params }: PageProps<"/w/[workspaceId]/planned/[module]">) {
  const { workspaceId, module } = await params;
  await requireWorkspacePage(workspaceId);
  const mod = PLANNED_MODULES.find((m) => m.slug === module);
  if (!mod) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={mod.name}
        breadcrumbs={[{ label: "Workspace", href: `/w/${workspaceId}` }, { label: mod.name }]}
        meta={
          <>
            <Badge tone="gold">Planned</Badge>
            <Badge tone="slate">{mod.phase}</Badge>
          </>
        }
      />
      <Panel>
        <div className="flex gap-4 p-6">
          <CircleDashed className="mt-0.5 size-5 shrink-0 text-gold-600" aria-hidden />
          <div>
            <p className="text-[14px] font-semibold">This module is not available yet.</p>
            <p className="mt-1 text-[13.5px] text-ink-muted">{mod.summary}</p>
            <p className="mt-4 text-[12px] font-semibold tracking-[0.06em] text-ink-faint uppercase">Planned capabilities</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-ink-muted">
              {mod.capabilities.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] text-ink-faint">
              Eightfold is delivered in phases. The CRM foundation (contacts, pipelines, tasks, and activity) ships first; see docs/ROADMAP.md.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
