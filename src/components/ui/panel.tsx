import * as React from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-panel", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-faint">{label}</p>
      <p className="tabular mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[12.5px] text-ink-muted">{sub}</p>}
    </>
  );
  return href ? (
    <a href={href} className="block rounded-lg border border-line bg-surface px-4 py-3 shadow-panel transition-colors hover:border-line-strong">
      {body}
    </a>
  ) : (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 shadow-panel">{body}</div>
  );
}
