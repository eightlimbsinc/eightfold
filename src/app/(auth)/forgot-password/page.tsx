import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Reset your password</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-ink-muted">We&apos;ll send a link to reset your password.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-[13px] text-ink-muted">
        <Link href="/sign-in" className="font-medium text-navy-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
