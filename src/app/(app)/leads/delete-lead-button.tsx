"use client";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteLeadAction } from "@/actions/delete-lead";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteLeadButton({ id, name }: { id: number; name: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <Dialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(""); } }}>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Hapus lead ${id}`}>
      <Trash2 className="size-3.5" />Hapus
    </Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Hapus lead?</DialogTitle><DialogDescription>
      Lead #{id} — {name || "Tanpa nama"} beserta riwayat tindak lanjutnya akan dihapus permanen. Jumlah lead dan laporan yang memakai lead form akan dihitung ulang. Tindakan ini tidak dapat dibatalkan.
    </DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Batal</Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => startTransition(async () => {
          setError("");
          try {
            const result = await deleteLeadAction(id);
            if (!result.ok) { setError(result.error); return; }
            setOpen(false); toast.success("Lead berhasil dihapus.");
          } catch { setError("Lead belum berhasil dihapus. Coba lagi."); }
        })}>{pending ? "Menghapus…" : "Ya, hapus lead"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
