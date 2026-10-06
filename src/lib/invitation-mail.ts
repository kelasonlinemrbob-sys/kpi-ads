import "server-only";
import { resetMailConfig, resetMailTransport } from "./reset-mail";
import { INVITATION_HOURS } from "./invitation-input";
export async function sendInvitationMail(email: string, name: string, inviter: string, token: string) {
  const config = resetMailConfig();
  const link = new URL("/accept-invitation", config.origin);
  link.searchParams.set("token", token);
  const transport = resetMailTransport();
  try {
    const info = await transport.sendMail({
      from: { name: process.env.SMTP_FROM_NAME ?? "KPI Ads", address: config.user },
      to: email, subject: "Undangan bergabung ke KPI Ads",
      text: `Halo ${name},\n\n${inviter} mengundang Anda bergabung ke KPI Ads.\n\nBuka tautan berikut untuk mengaktifkan akun dan membuat password Anda sendiri:\n${link.toString()}\n\nEmail akun: ${email}\nTautan berlaku ${INVITATION_HOURS} jam dan hanya bisa digunakan satu kali. Jika ada undangan baru, gunakan tautan dari email terbaru.\n\nRole dan target KPI sudah disiapkan supervisor. Setelah membuat password, silakan login menggunakan email di atas. Jangan bagikan tautan undangan atau password Anda.\n\nJika Anda tidak mengenali undangan ini, abaikan email ini.`,
    });
    if (!info.accepted?.length || info.rejected?.length) throw new Error("Invitation recipient not accepted by SMTP");
  } finally { transport.close(); }
}
