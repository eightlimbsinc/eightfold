import "server-only";
import { headers, cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { prisma } from "./db";
import { loadAgencyContext, loadWorkspaceContext, type RequestMeta } from "./authz/context";
import { NotFoundError, UnauthenticatedError } from "./errors";

export const LAST_WORKSPACE_COOKIE = "ef_last_ws";

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ipAddress: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

/** The current Better Auth session (memoized per request). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, emailVerified: true, isPlatformAdmin: true },
  });
  return user;
});

/** For pages: redirects anonymous visitors to sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** For pages: resolves workspace access or renders 404 (never reveals other tenants). */
export const requireWorkspacePage = cache(async (workspaceId: string) => {
  const user = await requireUser();
  const ctx = await loadWorkspaceContext(user.id, workspaceId);
  if (!ctx) notFound();
  return { ...ctx, request: await getRequestMeta(), user };
});

export const requireAgencyPage = cache(async (agencyId: string) => {
  const user = await requireUser();
  const ctx = await loadAgencyContext(user.id, agencyId);
  if (!ctx) notFound();
  return { ...ctx, request: await getRequestMeta(), user };
});

/** For Server Actions: re-authenticates and re-authorizes on every call. */
export async function actionUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function actionWorkspaceContext(workspaceId: unknown) {
  const user = await actionUser();
  if (typeof workspaceId !== "string") throw new NotFoundError("Workspace");
  const ctx = await loadWorkspaceContext(user.id, workspaceId);
  if (!ctx) throw new NotFoundError("Workspace");
  return { ...ctx, request: await getRequestMeta() };
}

export async function actionAgencyContext(agencyId: unknown) {
  const user = await actionUser();
  if (typeof agencyId !== "string") throw new NotFoundError("Agency");
  const ctx = await loadAgencyContext(user.id, agencyId);
  if (!ctx) throw new NotFoundError("Agency");
  return { ...ctx, request: await getRequestMeta() };
}

export async function getLastWorkspaceId(): Promise<string | undefined> {
  return (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;
}
