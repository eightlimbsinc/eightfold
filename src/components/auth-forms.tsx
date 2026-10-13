"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

function friendlyAuthError(message: string | undefined, status?: number) {
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  return message || "Something went wrong. Please try again.";
}

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      rememberMe: form.get("remember") === "on",
    });
    if (error) {
      setPending(false);
      setError(error.status === 401 ? "Incorrect email or password." : friendlyAuthError(error.message, error.status));
      return;
    }
    router.replace(safeNextPath(params.get("next")));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
      <FormAlert>{error}</FormAlert>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between text-[13px]">
        <label className="flex items-center gap-2 text-ink-muted">
          <input type="checkbox" name="remember" defaultChecked className="accent-navy-800" /> Keep me signed in
        </label>
        <Link href="/forgot-password" className="font-medium text-navy-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Submit pending={pending}>Sign in</Submit>
    </form>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password,
    });
    if (error) {
      setPending(false);
      setError(
        error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "An account with this email already exists. Try signing in."
          : friendlyAuthError(error.message, error.status),
      );
      return;
    }
    router.replace(safeNextPath(params.get("next"), "/onboarding"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormAlert>{error}</FormAlert>
      <Field label="Full name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={80} autoFocus />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
      </Field>
      <Submit pending={pending}>Create account</Submit>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email") ?? "").trim(),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error && error.status === 429) {
      setError(friendlyAuthError(error.message, error.status));
      return;
    }
    // Always show the same message so account existence is not disclosed.
    setSent(true);
  }

  if (sent) {
    return (
      <FormAlert kind="success">
        If an account exists for that email, a reset link is on its way. In local development the link is printed in the server console.
      </FormAlert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormAlert>{error}</FormAlert>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Submit pending={pending}>Send reset link</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token || linkError) {
    return (
      <FormAlert>
        This reset link is invalid or has expired.{" "}
        <Link href="/forgot-password" className="font-medium underline">
          Request a new one
        </Link>
        .
      </FormAlert>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword !== String(form.get("confirm") ?? "")) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    if (error) {
      setPending(false);
      setError(friendlyAuthError(error.message, error.status));
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormAlert>{error}</FormAlert>
      <Field label="New password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required autoFocus />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
      </Field>
      <Submit pending={pending}>Set new password</Submit>
    </form>
  );
}
