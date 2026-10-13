import Link from "next/link";
import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  CirclePlus,
  PencilLine,
  RotateCcw,
  StickyNote,
  Tag,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { ActivityItem } from "@/server/services/activity";
import { contactDisplayName } from "@/lib/normalize";
import { formatMoney } from "@/lib/money";
import { formatDateTime, relativeTime } from "@/lib/dates";

const FIELD_LABELS: Record<string, string> = {
  firstName: "first name",
  lastName: "last name",
  email: "email",
  phone: "phone",
  company: "company",
  source: "source",
  lifecycleStatus: "lifecycle status",
  assignedToId: "owner",
  tags: "tags",
  customFields: "custom fields",
  name: "name",
  valueCents: "value",
  contactId: "contact",
  expectedCloseDate: "expected close date",
};

type Meta = Record<string, unknown>;

function describe(a: ActivityItem, currency: string): { icon: LucideIcon; text: React.ReactNode; detail?: string } {
  const m = (a.metadata ?? {}) as Meta;
  const fields = Array.isArray(m.fields) ? (m.fields as string[]).map((f) => FIELD_LABELS[f] ?? f).join(", ") : "";
  switch (a.type) {
    case "contact.created":
      return { icon: CirclePlus, text: <>created the contact{m.source ? <> from <b>{String(m.source)}</b></> : null}</> };
    case "contact.updated":
      return { icon: PencilLine, text: <>updated {fields || "the contact"}</> };
    case "contact.archived":
      return { icon: Archive, text: <>archived the contact</> };
    case "contact.restored":
      return { icon: RotateCcw, text: <>restored the contact</> };
    case "contact.tag_added":
      return { icon: Tag, text: <>added tag <b>{String(m.tag ?? "")}</b></> };
    case "contact.tag_removed":
      return { icon: Tag, text: <>removed tag <b>{String(m.tag ?? "")}</b></> };
    case "opportunity.created":
      return {
        icon: CirclePlus,
        text: (
          <>
            created opportunity <b>{String(m.name ?? "")}</b>
            {typeof m.valueCents === "number" && m.valueCents > 0 ? <> ({formatMoney(m.valueCents, currency)})</> : null} in{" "}
            <b>{String(m.stage ?? "")}</b>
          </>
        ),
      };
    case "opportunity.stage_changed":
      return { icon: ArrowRightLeft, text: <>moved <b>{String(m.name ?? "")}</b> from {String(m.from)} → <b>{String(m.to)}</b></> };
    case "opportunity.status_changed":
      return { icon: Trophy, text: <>marked <b>{String(m.name ?? "")}</b> as <b>{String(m.to ?? "").toLowerCase()}</b></> };
    case "opportunity.updated":
      return { icon: PencilLine, text: <>updated {fields} on <b>{String(m.name ?? "")}</b></> };
    case "opportunity.archived":
      return { icon: Archive, text: <>archived opportunity <b>{String(m.name ?? "")}</b></> };
    case "task.created":
      return { icon: CirclePlus, text: <>added task <b>{String(m.title ?? "")}</b></> };
    case "task.completed":
      return { icon: CheckCircle2, text: <>completed task <b>{String(m.title ?? "")}</b></> };
    case "task.reopened":
      return { icon: RotateCcw, text: <>reopened task <b>{String(m.title ?? "")}</b></> };
    case "note.created":
      return { icon: StickyNote, text: <>added a note</>, detail: String(m.excerpt ?? "") };
    default:
      return { icon: PencilLine, text: <>{a.type}</> };
  }
}

export function ActivityFeed({
  items,
  workspaceId,
  currency,
  showSubject = true,
  emptyText = "No activity yet.",
}: {
  items: ActivityItem[];
  workspaceId: string;
  currency: string;
  showSubject?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="px-4 py-8 text-center text-[13px] text-ink-faint">{emptyText}</p>;
  return (
    <ol className="relative px-4 py-3">
      {items.map((a, i) => {
        const { icon: Icon, text, detail } = describe(a, currency);
        return (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-1">
            {i < items.length - 1 && <span className="absolute top-7 bottom-0 left-[13px] w-px bg-line" aria-hidden />}
            <span className="relative mt-0.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-muted">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-1 text-[13px] leading-snug">
              <p className="text-ink-muted [&_b]:font-medium [&_b]:text-ink">
                <span className="font-medium text-ink">{a.actor?.name ?? "System"}</span> {text}
                {showSubject && a.contact && (
                  <>
                    {" · "}
                    <Link href={`/w/${workspaceId}/contacts/${a.contact.id}`} className="text-navy-700 hover:underline">
                      {contactDisplayName(a.contact)}
                    </Link>
                  </>
                )}
              </p>
              {detail && <p className="mt-1 line-clamp-2 rounded-md bg-canvas px-2 py-1 text-[12.5px] text-ink-muted">{detail}</p>}
              <time className="mt-0.5 block text-[11.5px] text-ink-faint" dateTime={new Date(a.createdAt).toISOString()} title={formatDateTime(a.createdAt)}>
                {relativeTime(a.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
