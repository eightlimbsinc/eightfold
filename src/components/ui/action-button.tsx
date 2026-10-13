"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Dialog, DialogContent } from "./dialog";

type Result = { ok: boolean; error?: string } | void | undefined;

/**
 * Invokes a bound Server Action, optionally behind a confirmation dialog, and
 * surfaces failures inline instead of failing silently.
 */
export function ActionButton({
  action,
  confirm,
  children,
  ...buttonProps
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: () => Promise<Result>;
  confirm?: { title: string; body: React.ReactNode; confirmLabel?: string; destructive?: boolean };
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const result = await action();
      if (result && !result.ok) setError(result.error ?? "Something went wrong.");
      else setOpen(false);
    });
  }

  return (
    <>
      <Button {...buttonProps} disabled={pending || buttonProps.disabled} aria-busy={pending} onClick={() => (confirm ? setOpen(true) : run())}>
        {pending && !confirm && <Loader2 className="animate-spin" />}
        {children}
      </Button>
      {error && !confirm && (
        <span role="alert" className="text-[12px] text-red-700">
          {error}
        </span>
      )}
      {confirm && (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
          <DialogContent title={confirm.title}>
            <div className="text-[13.5px] text-ink-muted">{confirm.body}</div>
            {error && (
              <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant={confirm.destructive ? "danger" : "primary"} onClick={run} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {confirm.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
