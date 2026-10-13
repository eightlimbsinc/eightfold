"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog as D } from "radix-ui";
import { CheckSquare, KanbanSquare, Loader2, Search, User } from "lucide-react";
import { searchAction } from "@/actions/shell";
import type { SearchResults } from "@/server/services/search";
import { contactDisplayName } from "@/lib/normalize";
import { formatMoney } from "@/lib/money";

const EMPTY: SearchResults = { contacts: [], opportunities: [], tasks: [] };

export function CommandSearch({ workspaceId, currency }: { workspaceId: string; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [pending, start] = useTransition();
  const [active, setActive] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      start(async () => {
        const r = await searchAction(workspaceId, q);
        if (id === requestId.current) {
          setResults(r);
          setActive(0);
        }
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [q, workspaceId]);

  const items = [
    ...results.contacts.map((c) => ({
      key: `c-${c.id}`,
      href: `/w/${workspaceId}/contacts/${c.id}`,
      icon: User,
      label: contactDisplayName(c),
      sub: [c.email, c.company].filter(Boolean).join(" · "),
      group: "Contacts",
    })),
    ...results.opportunities.map((o) => ({
      key: `o-${o.id}`,
      href: `/w/${workspaceId}/opportunities/${o.id}`,
      icon: KanbanSquare,
      label: o.name,
      sub: `${o.stage.name} · ${formatMoney(o.valueCents, currency)}`,
      group: "Opportunities",
    })),
    ...results.tasks.map((t) => ({
      key: `t-${t.id}`,
      href: `/w/${workspaceId}/tasks`,
      icon: CheckSquare,
      label: t.title,
      sub: t.completedAt ? "Completed" : "Open",
      group: "Tasks",
    })),
  ];

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-[13px] text-ink-faint transition-colors hover:border-line-strong">
        <Search className="size-4" />
        <span className="flex-1 text-left">Search contacts, deals, tasks…</span>
        <kbd className="hidden rounded-sm border border-line bg-surface px-1.5 font-mono text-[10.5px] text-ink-muted sm:inline">⌘K</kbd>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-navy-950/40" />
        <D.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search this workspace</D.Description>
          <div className="flex items-center gap-2 border-b border-line px-3">
            {pending ? <Loader2 className="size-4 animate-spin text-ink-faint" /> : <Search className="size-4 text-ink-faint" />}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && items[active]) {
                  e.preventDefault();
                  go(items[active].href);
                }
              }}
              placeholder="Search this workspace…"
              aria-label="Search this workspace"
              className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-faint"
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
            {q.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-faint">Type at least two characters.</p>
            ) : items.length === 0 && !pending ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-faint">No results for “{q}”.</p>
            ) : (
              items.map((item, i) => (
                <div key={item.key}>
                  {(i === 0 || items[i - 1].group !== item.group) && (
                    <p className="px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.08em] text-ink-faint uppercase">{item.group}</p>
                  )}
                  <Link
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      go(item.href);
                    }}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${i === active ? "bg-navy-50" : ""}`}
                  >
                    <item.icon className="size-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{item.label}</span>
                      {item.sub && <span className="block truncate text-[12px] text-ink-faint">{item.sub}</span>}
                    </span>
                  </Link>
                </div>
              ))
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
