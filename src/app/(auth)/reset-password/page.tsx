import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Choose a new password</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-ink-muted">Signing in again will be required on all devices.</p>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
