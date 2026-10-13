import { cn } from "@/lib/utils";

/**
 * Eightfold logomark: an octagram formed by two offset squares around an
 * octagonal core — eight points for the eight limbs.
 */
export function LogoMark({ className, title = "Eightfold" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} role="img" aria-label={title}>
      <rect x="7" y="7" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect
        x="7"
        y="7"
        width="18"
        height="18"
        rx="1.5"
        fill="none"
        stroke="var(--color-gold-400)"
        strokeWidth="2"
        transform="rotate(45 16 16)"
      />
      <path d="M13.5 10h5l3.5 3.5v5L18.5 22h-5L10 18.5v-5z" fill="var(--color-gold-400)" opacity="0.9" />
    </svg>
  );
}

export function Wordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={inverted ? "text-white" : "text-navy-900"} />
      <span className={cn("text-[17px] font-semibold tracking-[-0.01em]", inverted ? "text-white" : "text-navy-900")}>
        Eightfold
      </span>
    </span>
  );
}
