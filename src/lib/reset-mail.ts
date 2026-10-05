import "server-only";
import nodemailer from "nodemailer";
import { RESET_MINUTES } from "./password-reset";

export function resetMailConfig() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass || !process.env.APP_URL) throw new Error("Reset email is not configured");
  const origin = new URL(process.env.APP_URL);
  if (!['https:', 'http:'].includes(origin.protocol) || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:'))
    throw new Error("APP_URL must use HTTPS in production");
  const port = Number(process.env.SMTP_PORT ?? 465);
  return { user, pass, origin: origin.origin, port, host: process.env.SMTP_HOST ?? "smtp.gmail.com" };
}

export function resetMailTransport() {
  const config = resetMailConfig();
  return nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: true, auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}

export async function sendPasswordReset(email: string, token: string) {
  const config = resetMailConfig();
  // Never derive reset links from untrusted Host or forwarded headers.
  const link = new URL("/reset-password", config.origin);
  link.searchParams.set("token", token);
  const transport = resetMailTransport();
  try {
    await transport.sendMail({
      from: { name: process.env.SMTP_FROM_NAME ?? "KPI Ads", address: config.user },
      to: email, subject: "Reset password KPI Ads",
      text: `Permintaan reset password KPI Ads\n\nBuka tautan berikut untuk membuat password baru:\n${link.toString()}\n\nTautan berlaku ${RESET_MINUTES} menit dan hanya dapat digunakan sekali. Jika Anda meminta tautan baru, gunakan email terbaru.\n\nJika Anda tidak meminta reset password, abaikan email ini. Password Anda belum berubah.`,
    });
  } finally { transport.close(); }
}
