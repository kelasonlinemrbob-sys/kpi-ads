import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getWaTemplates, listWaTemplateProducts } from "@/lib/lead-whatsapp";
import { PageHeader, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "Template WA" };
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const actor = await requireRole("supervisor", "advertiser", "cso");
  const products = await listWaTemplateProducts(actor);
  const selected = (await searchParams).product;
  const product = selected ? products.find(p => p.id === Number(selected)) : products[0];
  if (selected && !product) notFound();
  return <>
    <PageHeader title="Template WA" description="Siapkan pesan WA 1 sampai WA 5 untuk menghubungi customer dari daftar lead."
      actions={<Button asChild variant="outline"><Link href="/leads">Kembali ke Leads</Link></Button>} />
    {!products.length ? <Panel title="Belum ada produk"><p className="p-4 text-sm text-muted-foreground">{actor.role === "cso" ? "Template produk akan muncul setelah Anda mendapat lead." : "Tambahkan produk di Campaigns untuk menyiapkan template WA."}</p></Panel> : <>
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="grid min-w-0 flex-1 gap-2 text-sm">Produk
          <select name="product" defaultValue={product!.id} className="h-10 w-full rounded-md border bg-background px-3">
            {products.map(p => <option key={p.id} value={p.id}>{p.product || p.name} · {p.owner}{p.status !== "active" ? " (nonaktif)" : ""}</option>)}
          </select>
        </label><Button type="submit" variant="outline">Tampilkan</Button>
      </form>
      <TemplateEditor key={product!.id} campaignId={product!.id} product={product!.product || product!.name}
        initial={await getWaTemplates(product!.id)} canEdit={actor.role !== "cso"} />
    </>}
  </>;
}
