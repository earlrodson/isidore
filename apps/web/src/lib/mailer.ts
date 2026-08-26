import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    throw new Error("SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS must be set to send magic links");
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return transporter;
}

/** Sends the magic-link email (docs/specifications/viewer-magic-link-access.md
 * AC-004/013). Callers are responsible for not calling this when the
 * response to the requester must stay identical either way (AC-004) — this
 * function itself always sends. */
export async function sendMagicLinkEmail(email: string, verifyUrl: string): Promise<void> {
  const from = process.env.SMTP_FROM;
  if (!from) throw new Error("SMTP_FROM must be set to send magic links");

  await getTransporter().sendMail({
    from,
    to: email,
    subject: "Your Isidore sign-in link",
    text: `Sign in to Isidore: ${verifyUrl}\n\nThis link expires in 15 minutes and can only be used once.`,
    html: `<p><a href="${verifyUrl}">Sign in to Isidore</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
  });
}
