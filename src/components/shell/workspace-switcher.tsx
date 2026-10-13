"use client";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import type { SidebarProps } from "./sidebar";

export interface SwitcherGroup {
  agencyId: string;
  agencyName: string;
  agencyRole: string | null;
  workspaces: Array<{ id: string; name: string }>;
}

export function WorkspaceSwitcher({ groups, current }: { groups: SwitcherGroup[]; current: SidebarProps["current"] }) {
  const title = current.kind === "workspace" ? current.workspaceName : current.agencyName;
  const subtitle = current.kind === "workspace" ? current.agencyName : "Agency management";
  return (
    <Dropdown>
      <DropdownTrigger
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-navy-800 data-[state=open]:bg-navy-800"
        aria-label="Switch workspace"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gold-500 text-[12px] font-bold text-navy-950">
          {title.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{title}</span>
          <span className="block truncate text-[11.5px] text-navy-100/50">{subtitle}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-navy-100/40" />
      </DropdownTrigger>
      <DropdownContent align="start" className="w-72 max-h-[70vh] overflow-y-auto">
        {groups.map((g, i) => (
          <div key={g.agencyId}>
            {i > 0 && <DropdownSeparator />}
            <DropdownLabel className="flex items-center justify-between">
              <span className="truncate">{g.agencyName}</span>
              {g.agencyRole && (
                <Link href={`/agency/${g.agencyId}`} className="font-medium normal-case tracking-normal text-navy-600 hover:underline">
                  Manage
                </Link>
              )}
            </DropdownLabel>
            {g.workspaces.length === 0 && <p className="px-2 py-1.5 text-[12.5px] text-ink-faint">No workspaces yet</p>}
            {g.workspaces.map((w) => {
              const active = current.kind === "workspace" && current.workspaceId === w.id;
              return (
                <DropdownItem key={w.id} asChild>
                  <Link href={`/w/${w.id}`}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-navy-100 text-[10px] font-bold text-navy-700">
                      {w.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{w.name}</span>
                    {active && <Check className="text-gold-600!" />}
                  </Link>
                </DropdownItem>
              );
            })}
            {g.agencyRole && (
              <DropdownItem asChild>
                <Link href={`/agency/${g.agencyId}?new=1`} className="text-ink-muted">
                  <Plus /> New workspace
                </Link>
              </DropdownItem>
            )}
          </div>
        ))}
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/onboarding">
            <Building2 /> Create another agency
          </Link>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
