"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { duplicateOrderFormAction, deleteOrderFormAction } from "@/actions/order-form-management";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function FormCardActions({ id, title }: { id: number; title: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<"duplicate" | "delete">("duplicate");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  function run(action: "duplicate" | "delete") {
    if (busy.current) return;
    busy.current = true;
    setOperation(action);
    setError("");
    startTransition(async () => {
      try {
        if (action === "duplicate") {
          const result = await duplicateOrderFormAction(id);
          if (!result.ok) { setError(result.error); return; }
          toast.success("Form berhasil diduplikat sebagai draf.");
          router.push(`/forms/${result.id}`);
        } else {
          const result = await deleteOrderFormAction(id);
          if (!result.ok) { setError(result.error); return; }
          setConfirmDelete(false);
          toast.success("Form dihapus. Riwayat lead tetap tersimpan.");
        }
        router.refresh();
      } catch { setError("Permintaan belum berhasil. Periksa koneksi lalu coba lagi."); }
      finally { busy.current = false; }
    });
  }

  return <>
    <div className="flex flex-wrap gap-2 border-t pt-3">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run("duplicate")} title="Salin pengaturan sebagai draf baru, tanpa lead dan custom domain">
        <Copy className="size-3.5" />{pending && operation === "duplicate" ? "Menduplikat…" : "Duplikat"}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => { setError(""); setConfirmDelete(true); }}>
        <Trash2 className="size-3.5" />Hapus
      </Button>
    </div>
    {error && !confirmDelete && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Dialog open={confirmDelete} onOpenChange={open => { if (!pending) setConfirmDelete(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Hapus form?</DialogTitle><DialogDescription>
          Form “{title}” akan dihapus dari daftar dan berhenti menerima pendaftaran. Tautan, embed, dan custom domain form akan dinonaktifkan. Riwayat lead serta laporan KPI tetap tersimpan.
        </DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmDelete(false)}>Batal</Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => run("delete")}>{pending ? "Menghapus…" : "Ya, hapus form"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
