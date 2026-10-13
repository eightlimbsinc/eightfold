import { Wordmark } from "@/components/brand";
import { OnboardingForm } from "@/components/tenancy/onboarding-form";
import { requireUser } from "@/server/request";

export const metadata = { title: "Set up your agency" };

export default async function OnboardingPage() {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-6">
          <Wordmark />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-6 py-12">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-gold-600">Welcome, {user.name.split(" ")[0]}</p>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">Set up your agency</h1>
        <p className="mt-1.5 text-[14px] text-ink-muted">
          Create your agency and its first client workspace. You can add more workspaces and invite your team afterwards.
        </p>
        <div className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-panel">
          <OnboardingForm />
        </div>
        <p className="mt-6 text-[13px] text-ink-muted">
          Joining an existing agency? Ask an administrator to send you an invitation link instead.
        </p>
      </main>
    </div>
  );
}
