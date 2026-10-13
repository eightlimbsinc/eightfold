"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog as D } from "radix-ui";
import { Bell, LogOut, Menu, UserCog } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { relativeTime } from "@/lib/dates";
import { markNotificationsReadAction } from "@/actions/shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { CommandSearch } from "./command-search";
import { Sidebar, type SidebarProps } from "./sidebar";

export interface TopbarProps {
  user: { name: string; email: string };
  notifications: { unread: number; items: Array<{ id: string; title: string; href: string | null; readAt: Date | null; createdAt: Date }> };
  search?: { workspaceId: string; currency: string };
  sidebar: SidebarProps;
}

export function Topbar({ user, notifications, search, sidebar }: TopbarProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, start] = useTransition();

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-6">
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Trigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </D.Trigger>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-navy-950/50 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-pop lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation</D.Description>
            <Sidebar {...sidebar} onNavigate={() => setMobileOpen(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="min-w-0 flex-1">{search && <CommandSearch workspaceId={search.workspaceId} currency={search.currency} />}</div>

      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${notifications.unread} unread)`}>
            <Bell />
            {notifications.unread > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-navy-950">
                {notifications.unread > 9 ? "9+" : notifications.unread}
              </span>
            )}
          </Button>
        </DropdownTrigger>
        <DropdownContent className="w-80">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[13px] font-semibold">Notifications</span>
            {notifications.unread > 0 && (
              <button
                className="text-[12px] font-medium text-navy-600 hover:underline"
                onClick={() => start(async () => { await markNotificationsReadAction(); router.refresh(); })}
              >
                Mark all read
              </button>
            )}
          </div>
          <DropdownSeparator />
          {notifications.items.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-ink-faint">You&apos;re all caught up.</p>
          ) : (
            notifications.items.map((n) => (
              <DropdownItem key={n.id} asChild>
                <Link href={n.href ?? "#"} className="items-start!">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-gold-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug text-ink">{n.title}</span>
                    <span className="block text-[11.5px] text-ink-faint">{relativeTime(n.createdAt)}</span>
                  </span>
                </Link>
              </DropdownItem>
            ))
          )}
        </DropdownContent>
      </Dropdown>

      <Dropdown>
        <DropdownTrigger className="rounded-full" aria-label="Account menu">
          <Avatar name={user.name} className="h-8 w-8" />
        </DropdownTrigger>
        <DropdownContent className="w-60">
          <DropdownLabel className="normal-case tracking-normal">
            <span className="block truncate text-[13px] font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-[12px] font-normal text-ink-faint">{user.email}</span>
          </DropdownLabel>
          <DropdownSeparator />
          <DropdownItem asChild>
            <Link href="/account">
              <UserCog /> Account settings
            </Link>
          </DropdownItem>
          <DropdownItem onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </header>
  );
}
