import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink placeholder:text-ink-faint shadow-[inset_0_1px_0_rgb(12_21_38/0.02)] transition-colors focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-gold-300/60 disabled:bg-canvas disabled:text-ink-muted aria-[invalid=true]:border-red-500";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-8.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        control,
        "h-8.5 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%23586174%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%23586174%22 stroke-width=%221.6%22 fill=%22none%22/></svg>')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-[12.5px] font-medium text-ink-muted", className)} {...props} />;
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("h-4 w-4 rounded-sm border-line-strong accent-navy-800", className)} {...props} />;
}

/** Label + control + hint/error, wired up for accessibility. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string | string[];
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-gold-600" aria-hidden>*</span>}
      </Label>
      {children}
      {message ? (
        <p className="text-[12px] text-red-700" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {message}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormAlert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-[13px]",
        kind === "error" && "border-red-200 bg-red-50 text-red-800",
        kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        kind === "info" && "border-navy-100 bg-navy-50 text-navy-700",
      )}
    >
      {children}
    </div>
  );
}
