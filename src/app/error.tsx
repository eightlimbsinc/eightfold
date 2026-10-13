"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[12px] font-semibold tracking-[0.12em] text-red-700 uppercase">Something went wrong</p>
      <h1 className="mt-2 text-[20px] font-semibold">This page failed to load</h1>
      <p className="mt-1.5 max-w-md text-[13.5px] text-ink-muted">
        The error has been logged. Try again, and if the problem persists contact your administrator
        {error.digest ? ` with reference ${error.digest}` : ""}.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
