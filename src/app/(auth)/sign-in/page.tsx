import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { FormAlert } from "@/components/ui/form";
import { getSession } from "@/server/request";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getSession()) redirect("/app");
  const { reset } = await searchParams;
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Sign in to Eightfold</h1>
      <p className="mt-1 mb-6 text-[13.5px] text-ink-muted">Welcome back. Enter your credentials to continue.</p>
      {reset && (
        <div className="mb-4">
          <FormAlert kind="success">Your password was reset. Sign in with your new password.</FormAlert>
        </div>
      )}
      <Suspense>
        <SignInForm />
      </Suspense>
      <p className="mt-6 text-center text-[13px] text-ink-muted">
        New to Eightfold?{" "}
        <Link href="/sign-up" className="font-medium text-navy-700 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
