import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <Wordmark />
      <p className="mt-8 text-[12px] font-semibold tracking-[0.12em] text-gold-600 uppercase">404</p>
      <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.015em]">We couldn&apos;t find that page</h1>
      <p className="mt-1.5 max-w-md text-[13.5px] text-ink-muted">
        It may have been moved or deleted, or you may not have access to it.
      </p>
      <Button asChild className="mt-6">
        <Link href="/app">Back to Eightfold</Link>
      </Button>
    </div>
  );
}
