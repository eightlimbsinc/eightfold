import * as React from "react";
import { cn } from "@/lib/utils";

const TONES = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  gold: "bg-gold-100 text-gold-700 ring-gold-300/60",
  navy: "bg-navy-100 text-navy-700 ring-navy-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  pink: "bg-pink-50 text-pink-700 ring-pink-200",
} as const;
export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "slate", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone | string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[(tone in TONES ? tone : "slate") as BadgeTone],
        className,
      )}
      {...props}
    />
  );
}

export const LIFECYCLE_TONES: Record<string, BadgeTone> = {
  LEAD: "blue",
  QUALIFIED: "gold",
  CUSTOMER: "green",
  INACTIVE: "slate",
};

export const STATUS_TONES: Record<string, BadgeTone> = { OPEN: "navy", WON: "green", LOST: "red" };
