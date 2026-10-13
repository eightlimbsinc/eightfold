import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { getSession } from "@/server/request";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/app");
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Create your account</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-ink-muted">Set up your agency and first client workspace in minutes.</p>
      <Suspense>
        <SignUpForm />
      </Suspense>
      <p className="mt-6 text-center text-[13px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-navy-700 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
