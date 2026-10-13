"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { acceptInvitationAction } from "@/actions/tenancy";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <FormAlert>{error}</FormAlert>}
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvitationAction(token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Accept invitation
      </Button>
    </div>
  );
}
