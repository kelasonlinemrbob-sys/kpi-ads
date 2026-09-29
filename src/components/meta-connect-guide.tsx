import { ExternalLinkIcon } from "lucide-react";

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2">
      {children}
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}

const B = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-foreground">{children}</span>;

/** Step-by-step: getting a Meta Marketing API token that doesn't expire (System User). */
export function MetaConnectGuide() {
  return (
    <div className="grid gap-4 text-sm leading-relaxed text-muted-foreground">
      <div className="grid gap-2">
        <p className="font-medium text-foreground">Cara A — Token System User (disarankan, tidak kedaluwarsa)</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Pastikan akun iklan sudah ada di Business Manager / portofolio bisnis:{" "}
            <A href="https://business.facebook.com/settings/ad-accounts">Pengaturan bisnis → Akun → Akun iklan</A>.
          </li>
          <li>
            Buat aplikasi di <A href="https://developers.facebook.com/apps">Meta for Developers</A>: <B>Buat aplikasi</B> → pilih
            kasus penggunaan <B>Lainnya</B> → tipe <B>Bisnis</B> → hubungkan ke portofolio bisnis yang sama. Lalu tambahkan produk{" "}
            <B>Marketing API</B>.
          </li>
          <li>
            Buka <A href="https://business.facebook.com/settings/system-users">Pengaturan bisnis → Pengguna → Pengguna sistem</A> →{" "}
            <B>Tambahkan</B>, beri nama mis. <code className="rounded bg-muted px-1">kpi-ads</code>, peran <B>Admin</B>.
          </li>
          <li>
            Pilih pengguna sistem tersebut → <B>Tetapkan aset</B>:
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <B>Akun iklan</B> → centang semua akun yang dilaporkan → izin <B>Lihat performa</B> (cukup, tidak perlu kelola
                campaign).
              </li>
              <li>
                <B>Aplikasi</B> → pilih aplikasi dari langkah 2 → <B>Kelola aplikasi / Kembangkan aplikasi</B>.
              </li>
            </ul>
          </li>
          <li>
            Klik <B>Buat token</B> (Generate new token) → pilih aplikasi → <B>Masa berlaku token: Tidak pernah</B> → centang izin{" "}
            <code className="rounded bg-muted px-1">ads_read</code> (opsional <code className="rounded bg-muted px-1">read_insights</code>)
            → <B>Buat token</B> → salin tokennya (hanya tampil sekali).
          </li>
          <li>
            Tempel token di form <B>Koneksi Meta Ads</B> → <B>Simpan &amp; tes</B>. Daftar akun iklan yang bisa dibaca akan muncul.
          </li>
          <li>
            Daftarkan akunnya di <B>Campaigns → Akun iklan</B> (atau klik <B>Tambahkan</B> di daftar hasil tes). ID akun adalah
            angka setelah <code className="rounded bg-muted px-1">act=</code> di URL Ads Manager, tanpa{" "}
            <code className="rounded bg-muted px-1">act_</code>.
          </li>
        </ol>
      </div>

      <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
        <p className="font-medium text-foreground">Agar token awet</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Pakai token <B>System User</B> dengan masa berlaku <B>Tidak pernah</B>. Token ini tidak ikut mati saat password
            karyawan diganti, karyawan keluar, atau sesi Facebook logout.
          </li>
          <li>
            Token hanya mati bila: dicabut (<i>Revoke</i>), pengguna sistem dihapus, akses aset/aplikasinya dicabut, atau aplikasi
            dihapus/dinonaktifkan. Jangan hapus aplikasi dan pengguna sistem tersebut.
          </li>
          <li>
            Jangan pakai token dari <B>Graph API Explorer</B> apa adanya — umurnya hanya 1–2 jam.
          </li>
          <li>
            Akun iklan baru cukup di-assign ke pengguna sistem yang sama — token tidak perlu dibuat ulang.
          </li>
          <li>Aplikasi ini mengecek masa berlaku token dan menampilkan peringatan 14 hari sebelum kedaluwarsa.</li>
        </ul>
      </div>

      <div className="grid gap-2">
        <p className="font-medium text-foreground">Cara B — Token user (bila tidak punya akses Business Manager)</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Buka <A href="https://developers.facebook.com/tools/explorer">Graph API Explorer</A>, pilih aplikasimu, tambahkan izin{" "}
            <code className="rounded bg-muted px-1">ads_read</code>, klik <B>Generate Access Token</B>, lalu salin.
          </li>
          <li>
            Isi juga <B>App ID</B> dan <B>App Secret</B> (dari{" "}
            <A href="https://developers.facebook.com/apps">Pengaturan aplikasi → Dasar</A>). Saat disimpan, token otomatis
            ditukar menjadi token jangka panjang (±60 hari).
          </li>
          <li>Token ini harus diperbarui sebelum 60 hari (ulangi langkah di atas). Cara A lebih praktis untuk jangka panjang.</li>
        </ol>
      </div>
    </div>
  );
}
