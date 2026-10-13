import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { AcceptInvitationButton } from "@/components/tenancy/accept-invitation";
import { getInvitationByToken } from "@/server/services/invitations";
import { getCurrentUser } from "@/server/request";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { normalizeEmail } from "@/lib/normalize";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [{ status, invitation }, user] = await Promise.all([getInvitationByToken(token), getCurrentUser()]);
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-panel">
          {status !== "valid" || !invitation ? (
            <>
              <h1 className="text-[18px] font-semibold">Invitation unavailable</h1>
              <div className="mt-3">
                <FormAlert>
                  {status === "expired"
                    ? "This invitation has expired. Ask the person who invited you for a new link."
                    : status === "accepted"
                      ? "This invitation has already been used."
                      : "This invitation link is invalid or has been revoked."}
                </FormAlert>
              </div>
              <Button asChild variant="secondary" className="mt-4">
                <Link href="/app">Go to Eightfold</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-gold-600">You&apos;re invited</p>
              <h1 className="mt-2 text-[19px] font-semibold tracking-[-0.01em]">
                Join {invitation.workspace ? `${invitation.workspace.name} at ` : ""}
                {invitation.agency.name}
              </h1>
              <p className="mt-1.5 text-[13.5px] text-ink-muted">
                Role: <strong className="text-ink">{ROLE_LABELS[invitation.role as Role]}</strong> · Sent to {invitation.email}
              </p>
              <div className="mt-6">
                {!user ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild>
                      <Link href={`/sign-up?next=${next}`}>Create an account</Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href={`/sign-in?next=${next}`}>Sign in</Link>
                    </Button>
                  </div>
                ) : normalizeEmail(user.email) !== invitation.email ? (
                  <FormAlert>
                    You are signed in as {user.email}, but this invitation was sent to {invitation.email}. Sign out and sign in with
                    the invited address to accept it.
                  </FormAlert>
                ) : (
                  <AcceptInvitationButton token={token} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
