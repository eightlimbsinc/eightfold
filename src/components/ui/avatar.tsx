import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-700 text-[11px] font-semibold text-gold-300",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
