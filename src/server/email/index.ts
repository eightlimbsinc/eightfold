/**
 * Email delivery adapter. The core application never depends on a paid email
 * provider: the default "console" adapter prints messages to the server log so
 * password-reset and invitation links can be used during local development.
 * A real provider (SMTP, Resend, Postmark, SES, ...) can be added by
 * implementing `EmailAdapter` and selecting it with EMAIL_ADAPTER.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Messages captured by the console adapter (most recent first), for tests and the dev outbox. */
const outbox: Array<EmailMessage & { sentAt: Date }> = [];

export const consoleEmailAdapter: EmailAdapter = {
  name: "console",
  async send(message) {
    outbox.unshift({ ...message, sentAt: new Date() });
    outbox.length = Math.min(outbox.length, 50);
    console.info(
      `\n[email:console] To: ${message.to}\n[email:console] Subject: ${message.subject}\n${message.text}\n`,
    );
  },
};

export function getEmailAdapter(): EmailAdapter {
  const selected = process.env.EMAIL_ADAPTER ?? "console";
  switch (selected) {
    case "console":
      return consoleEmailAdapter;
    default:
      console.warn(`[email] Unknown EMAIL_ADAPTER "${selected}", falling back to console.`);
      return consoleEmailAdapter;
  }
}

export function getCapturedEmails() {
  return [...outbox];
}

export async function sendEmail(message: EmailMessage) {
  await getEmailAdapter().send(message);
}
