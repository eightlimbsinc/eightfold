"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  CreditCard,
  FileText,
  Globe,
  KanbanSquare,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Plug,
  Settings,
  Share2,
  Star,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANNED_MODULES } from "@/lib/modules";
import { LogoMark } from "@/components/brand";
import { WorkspaceSwitcher, type SwitcherGroup } from "./workspace-switcher";

const PLANNED_ICONS: Record<string, LucideIcon> = {
  conversations: MessageSquare,
  automation: Workflow,
  sites: Globe,
  forms: FileText,
  email: Mail,
  calendars: CalendarDays,
  reputation: Star,
  social: Share2,
  reporting: ChartColumn,
  billing: CreditCard,
  integrations: Plug,
};

export interface SidebarProps {
  groups: SwitcherGroup[];
  current:
    | { kind: "workspace"; workspaceId: string; workspaceName: string; agencyId: string; agencyName: string; isAgencyAdmin: boolean }
    | { kind: "agency"; agencyId: string; agencyName: string };
  onNavigate?: () => void;
}

function NavLink({
  href,
  icon: Icon,
  label,
  exact,
  onNavigate,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
  onNavigate?: () => void;
  badge?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        active ? "bg-navy-800 text-white" : "text-navy-100/70 hover:bg-navy-800/60 hover:text-white",
      )}
    >
      {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-gold-400" aria-hidden />}
      <Icon className={cn("size-4 shrink-0", active ? "text-gold-400" : "text-navy-100/50 group-hover:text-navy-100/80")} />
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto rounded-sm border border-navy-600 px-1 text-[10px] font-medium tracking-wide text-navy-100/45 uppercase">
          {badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pt-4 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-navy-100/35 uppercase">{children}</p>;
}

export function Sidebar({ groups, current, onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-navy-950 text-white">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-navy-800 px-4">
        <LogoMark className="h-6 w-6 text-white" />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Eightfold</span>
      </div>
      <div className="border-b border-navy-800 p-2">
        <WorkspaceSwitcher groups={groups} current={current} />
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
        {current.kind === "workspace" ? (
          <>
            <SectionLabel>Workspace</SectionLabel>
            <NavLink href={`/w/${current.workspaceId}`} icon={LayoutDashboard} label="Dashboard" exact onNavigate={onNavigate} />
            <NavLink href={`/w/${current.workspaceId}/contacts`} icon={Users} label="Contacts" onNavigate={onNavigate} />
            <NavLink href={`/w/${current.workspaceId}/pipelines`} icon={KanbanSquare} label="Opportunities" onNavigate={onNavigate} />
            <NavLink href={`/w/${current.workspaceId}/tasks`} icon={CheckSquare} label="Tasks" onNavigate={onNavigate} />
            <SectionLabel>Coming soon</SectionLabel>
            {PLANNED_MODULES.map((m) => (
              <NavLink
                key={m.slug}
                href={`/w/${current.workspaceId}/planned/${m.slug}`}
                icon={PLANNED_ICONS[m.slug] ?? Plug}
                label={m.name}
                badge="Planned"
                onNavigate={onNavigate}
              />
            ))}
          </>
        ) : (
          <>
            <SectionLabel>Agency</SectionLabel>
            <NavLink href={`/agency/${current.agencyId}`} icon={Building2} label="Workspaces" exact onNavigate={onNavigate} />
            <NavLink href={`/agency/${current.agencyId}/members`} icon={Users} label="Team & access" onNavigate={onNavigate} />
            <NavLink href={`/agency/${current.agencyId}/audit`} icon={FileText} label="Audit log" onNavigate={onNavigate} />
            <NavLink href={`/agency/${current.agencyId}/settings`} icon={Settings} label="Agency settings" onNavigate={onNavigate} />
          </>
        )}
      </nav>
      {current.kind === "workspace" && (
        <div className="border-t border-navy-800 p-2">
          <NavLink href={`/w/${current.workspaceId}/settings`} icon={Settings} label="Workspace settings" onNavigate={onNavigate} />
          {current.isAgencyAdmin && (
            <NavLink href={`/agency/${current.agencyId}`} icon={Building2} label="Agency" exact onNavigate={onNavigate} />
          )}
        </div>
      )}
    </div>
  );
}
