"use client";
import { useState } from "react";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evenWeights, rebalanceWeights, weightedRecipient } from "@/lib/order-form-config";
const COLORS=["#2563eb","#16a34a","#f59e0b","#db2777","#7c3aed","#0891b2","#dc2626","#65a30d"];
const ROUTES=[{value:"fixed",title:"CSO tetap",hint:"Semua lead ke satu CSO."},{value:"round_robin",title:"Bergiliran",hint:"Dibagi sama rata bergantian."},{value:"weighted",title:"Persentase",hint:"Porsi bebas, mis. 20% / 80%."}] as const;
const SPLITS=[[20,80],[30,70],[50,50],[70,30],[80,20]];
type Cso={id:number;name:string;phone:string|null};

export function CsoRouting({csos,routing,setRouting,assignees,setAssignees,weights,setWeights}:{csos:Cso[];routing:string;setRouting:(value:string)=>void;assignees:number[];setAssignees:(value:number[])=>void;weights:Record<string,number>;setWeights:(value:Record<string,number>)=>void}){
 const [autoBalance,setAutoBalance]=useState(true);
 const weighted=routing==="weighted";
 const total=assignees.reduce((n,id)=>n+(weights[id]??0),0);
 const name=(id:number)=>csos.find(c=>c.id===id)?.name??`CSO #${id}`;
 const color=(id:number)=>COLORS[Math.max(0,assignees.indexOf(id))%COLORS.length];
 const missing=assignees.filter(id=>!csos.some(c=>c.id===id));
 // Same algorithm as live submissions, so the preview order is what customers will get.
 const sequence:number[]=[];
 if(weighted&&total===100){let credits={};for(let i=0;i<10;i++){const next=weightedRecipient(assignees,weights,credits);if(!next)break;sequence.push(next.id);credits=next.credits;}}

 function changeRouting(next:string){
  setRouting(next);
  if(next==="fixed"&&assignees.length>1)setAssignees(assignees.slice(0,1));
  if(next==="weighted"&&assignees.length&&total!==100)setWeights({...weights,...evenWeights(assignees)});
 }
 function toggle(id:number,checked:boolean){
  if(routing==="fixed"){setAssignees(checked?[id]:[]);return;}
  const next=checked?[...assignees,id]:assignees.filter(other=>other!==id);setAssignees(next);
  if(!weighted)return;
  if(autoBalance)setWeights({...weights,...evenWeights(next)});
  else if(checked&&!weights[id])setWeights({...weights,[id]:Math.max(0,100-total)});
 }
 function setWeight(id:number,value:number){
  const clean=Math.max(0,Math.min(100,Math.round(value)||0));
  setWeights(autoBalance?{...weights,...rebalanceWeights(assignees,weights,id,clean)}:{...weights,[id]:clean});
 }

 return <Panel title="Pembagian CSO"><div className="grid gap-4 p-4">
  <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">Cara pembagian</legend><div className="grid gap-2 sm:grid-cols-3">{ROUTES.map(route=><label key={route.value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${routing===route.value?"border-primary bg-primary/5":"hover:bg-muted/50"}`}><input type="radio" name="routing" value={route.value} checked={routing===route.value} onChange={()=>changeRouting(route.value)} className="mt-0.5" /><span><span className="block font-medium">{route.title}</span><span className="block text-xs text-muted-foreground">{route.hint}</span></span></label>)}</div></fieldset>

  <div className="grid gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{routing==="fixed"?"Pilih satu CSO":"Pilih CSO penerima"}</p>{weighted&&assignees.length>0&&<label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={autoBalance} onChange={e=>setAutoBalance(e.target.checked)} />Seimbangkan otomatis ke 100%</label>}</div>
   {csos.map(c=>{const checked=assignees.includes(c.id);return <div key={c.id} className={`grid items-center gap-3 rounded-lg border p-3 text-sm ${weighted&&checked?"sm:grid-cols-[minmax(0,1fr)_minmax(140px,220px)_88px]":""} ${checked?"border-primary/40 bg-primary/[0.03]":""}`}>
    <label className="flex min-w-0 items-center gap-3"><input type={routing==="fixed"?"radio":"checkbox"} name="assigneeIds" value={c.id} checked={checked} onChange={e=>toggle(c.id,e.target.checked)} disabled={!c.phone&&!checked} />{weighted&&checked&&<span className="size-2.5 shrink-0 rounded-full" style={{background:color(c.id)}} aria-hidden="true" />}<span className="min-w-0">{c.name}<span className="block text-xs text-muted-foreground">{c.phone?`+${c.phone}`:"Nomor WA belum diatur"}</span></span></label>
    {weighted&&checked&&<><input type="range" min={0} max={100} step={5} value={weights[c.id]??0} onChange={e=>setWeight(c.id,Number(e.target.value))} aria-label={`Geser persentase ${c.name}`} style={{accentColor:color(c.id)}} className="w-full" /><div className="relative"><Input type="number" inputMode="numeric" min={0} max={100} step={1} value={weights[c.id]??0} onChange={e=>setWeight(c.id,Number(e.target.value))} aria-label={`Persentase ${c.name}`} className="pr-7 text-right tabular-nums" /><span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">%</span></div></>}
   </div>;})}
   {missing.map(id=><label key={id} className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><input type="checkbox" name="assigneeIds" value={id} checked onChange={()=>toggle(id,false)} /><span>CSO #{id}<span className="block text-xs text-destructive">Tidak aktif atau tanpa nomor WA — hapus centang lalu pilih CSO lain.</span></span></label>)}
   {!csos.length&&<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Belum ada CSO aktif. Supervisor perlu mengundang CSO melalui Team, mengisi nomor WA, dan menunggu aktivasi akun. Form dapat disimpan sebagai draf.</p>}
  </div>

  {weighted&&assignees.length>0&&<div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
   <div className="flex h-7 overflow-hidden rounded-md border bg-background" role="img" aria-label={`Porsi lead: ${assignees.map(id=>`${name(id)} ${weights[id]??0}%`).join(", ")}`}>{assignees.filter(id=>(weights[id]??0)>0).map(id=><div key={id} className="flex min-w-0 items-center justify-center overflow-hidden text-[11px] font-semibold text-white transition-[width]" style={{width:`${Math.min(100,weights[id])/Math.max(100,total)*100}%`,background:color(id)}} title={`${name(id)} ${weights[id]}%`}>{weights[id]>=8?`${weights[id]}%`:""}</div>)}{total<100&&<div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">Sisa {100-total}%</div>}</div>
   <div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-sm font-medium tabular-nums ${total===100?"text-emerald-600":"text-destructive"}`}>Total {total}% / 100%{total>100?` — kelebihan ${total-100}%`:total<100?` — kurang ${100-total}%`:" ✓"}</p><div className="flex flex-wrap gap-1.5"><Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={()=>setWeights({...weights,...evenWeights(assignees)})}>Bagi rata</Button>{assignees.length===2&&SPLITS.map(([a,b])=><Button key={`${a}-${b}`} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs tabular-nums" onClick={()=>setWeights({...weights,[assignees[0]]:a,[assignees[1]]:b})}>{a}/{b}</Button>)}</div></div>
   {sequence.length>0&&<div className="grid gap-1.5"><p className="text-xs text-muted-foreground">Urutan 10 lead berikutnya</p><ol className="flex flex-wrap gap-1">{sequence.map((id,index)=><li key={index} title={name(id)} className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{background:color(id)}}>{name(id).trim().charAt(0).toUpperCase()}</li>)}</ol></div>}
   <p className="text-xs text-muted-foreground">Bobot 0% tidak menerima lead. Pembagian dihitung berurutan sehingga porsi tetap akurat walau lead masih sedikit. Jika CSO nonaktif, porsi CSO lain menyesuaikan proporsinya.</p>
  </div>}
  {routing==="fixed"&&<p className="text-xs text-muted-foreground">Semua lead diteruskan ke CSO terpilih. Jika CSO tersebut nonaktif, pendaftaran dihentikan sementara.</p>}
  {routing==="round_robin"&&<p className="text-xs text-muted-foreground">Lead dibagi bergantian dan melewati CSO yang dinonaktifkan. Jika tidak ada CSO tersedia, pendaftaran dihentikan sementara.</p>}
 </div></Panel>;
}
