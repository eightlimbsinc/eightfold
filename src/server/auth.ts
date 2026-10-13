import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { sendEmail } from "./email";

const rateLimitEnabled = (process.env.AUTH_RATE_LIMIT_ENABLED ?? "true") !== "false";

export const auth = betterAuth({
  appName: "Eightfold",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  telemetry: { enabled: false },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Verification is architecture-ready but not required for the MVP
    // (no paid email provider is needed to use the product locally).
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Reset your Eightfold password",
        text: `Someone requested a password reset for your Eightfold account.\n\nReset it here (valid for 30 minutes):\n${url}\n\nIf this wasn't you, you can ignore this email.`,
      });
    },
    async onPasswordReset({ user }) {
      await prisma.auditLog.create({ data: { actorId: user.id, action: "auth.password_reset", targetType: "user", targetId: user.id } });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Verify your Eightfold email address",
        text: `Welcome to Eightfold.\n\nConfirm your email address:\n${url}`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh expiry daily on activity
  },
  rateLimit: {
    enabled: rateLimitEnabled,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 5 },
      "/reset-password": { window: 300, max: 10 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          await prisma.auditLog.create({
            data: { actorId: user.id, action: "auth.user_registered", targetType: "user", targetId: user.id },
          });
        },
      },
    },
  },
  // nextCookies must be the last plugin so Server Actions can set auth cookies.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
