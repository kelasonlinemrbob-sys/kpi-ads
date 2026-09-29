"use client";

import * as React from "react";
import { useActionState } from "react";
import { LoaderIcon, PlusIcon } from "lucide-react";
import { createAppraisal } from "@/actions/appraisals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateAppraisalDialog({
  employees,
  defaultStart,
  defaultEnd,
}: {
  employees: { id: number; name: string }[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, action, pending] = useActionState(createAppraisal, undefined);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-8" disabled={!employees.length}>
          <PlusIcon /> Buat penilaian
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Penilaian kinerja baru</DialogTitle>
          <DialogDescription>
            Real jumlah lead dan CPL diisi otomatis dari laporan harian pada periode ini, dan masih bisa diubah.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <div className="grid gap-2">
            <Label>Advertiser senior</Label>
            <Select name="userId" defaultValue={employees.length === 1 ? String(employees[0]!.id) : undefined} required>
              <SelectTrigger>
                <SelectValue placeholder="Pilih karyawan" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="a-start">Awal periode</Label>
              <Input id="a-start" name="periodStart" type="date" defaultValue={defaultStart} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-end">Akhir periode</Label>
              <Input id="a-end" name="periodEnd" type="date" defaultValue={defaultEnd} required />
            </div>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderIcon className="animate-spin" />} Buat & isi borang
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
