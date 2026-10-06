"use client";
import { Check, RotateCcw } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_LABELS, type FieldKey, type OrderFields } from "@/lib/order-form-input";
import { contrastRatio, DEFAULT_APPEARANCE, FIELD_STYLES, FORM_FONTS, FORM_RADII, FORM_THEMES, type FormAppearance, type FormThemeId } from "@/lib/order-form-config";
const selectClass="h-10 w-full rounded-md border bg-background px-3 text-sm";
/** Changing any of these by hand turns the preset into "custom". */
const THEME_KEYS=["buttonColor","backgroundColor","textColor","pageColor","font","radius","fieldStyle","buttonStyle"] as const;

function Segmented<T extends string>({label,value,options,onChange}:{label:string;value:T;options:Record<T,string>;onChange:(value:T)=>void}){
 return <fieldset className="grid gap-2"><legend className="mb-2 text-sm">{label}</legend><div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">{(Object.keys(options) as T[]).map(key=><button key={key} type="button" aria-pressed={value===key} onClick={()=>onChange(key)} className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors ${value===key?"bg-background font-medium shadow-sm":"text-muted-foreground hover:text-foreground"}`}>{options[key]}</button>)}</div></fieldset>;
}
function ColorField({id,label,value,onChange,warning}:{id:string;label:string;value:string;onChange:(value:string)=>void;warning?:string}){
 return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><div className="flex gap-2"><input id={id} type="color" value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1" /><Input aria-label={`${label} (hex)`} value={value} maxLength={7} spellCheck={false} className="font-mono uppercase" onChange={e=>{const next=e.target.value.startsWith("#")?e.target.value:`#${e.target.value}`;if(/^#[0-9a-fA-F]{0,6}$/.test(next))onChange(next.toLowerCase());}} /></div>{warning&&<p className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>}</div>;
}
function Toggle({checked,onChange,children}:{checked:boolean;onChange:(value:boolean)=>void;children:React.ReactNode}){
 return <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={checked} onChange={e=>onChange(e.target.checked)} />{children}</label>;
}

export function AppearanceSettings({fields,setFields,appearance,setAppearance}:{fields:OrderFields;setFields:(value:OrderFields)=>void;appearance:FormAppearance;setAppearance:(value:FormAppearance)=>void}){
 const set=<K extends keyof FormAppearance>(key:K,value:FormAppearance[K])=>setAppearance({...appearance,[key]:value,...((THEME_KEYS as readonly string[]).includes(key)?{theme:"custom" as const}:{})});
 const applyTheme=(id:FormThemeId)=>{const {label:_,...tokens}=FORM_THEMES[id];setAppearance({...appearance,...tokens,theme:id});};
 const hex=(value:string)=>/^#[0-9a-f]{6}$/i.test(value);
 const transparent=appearance.pageColor==="transparent";
 const textContrast=hex(appearance.textColor)&&hex(appearance.backgroundColor)?contrastRatio(appearance.textColor,appearance.backgroundColor):21;
 const buttonContrast=appearance.buttonStyle==="outline"&&hex(appearance.buttonColor)&&hex(appearance.backgroundColor)?contrastRatio(appearance.buttonColor,appearance.backgroundColor):21;
 return <div className="grid gap-4">
  <Panel title="Field customer"><div className="grid gap-3 p-4">{(Object.keys(FIELD_LABELS) as FieldKey[]).map(key=><div key={key} className="grid items-center gap-2 sm:grid-cols-[90px_170px_1fr] sm:gap-3"><Label htmlFor={`field_${key}`}>{FIELD_LABELS[key]}</Label><select id={`field_${key}`} name={`field_${key}`} value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value as OrderFields[FieldKey]})} className={selectClass}><option value="required">Aktif · wajib</option><option value="optional">Aktif · opsional</option><option value="off">Nonaktif</option></select><Input aria-label={`Placeholder ${FIELD_LABELS[key]}`} placeholder="Placeholder" value={appearance.placeholders[key]} maxLength={80} disabled={fields[key]==="off"} onChange={e=>setAppearance({...appearance,placeholders:{...appearance.placeholders,[key]:e.target.value}})} /></div>)}<p className="text-xs text-muted-foreground">Minimal No. HP atau Email wajib diisi agar customer bisa dihubungi. Kolom kanan adalah teks contoh di dalam field.</p></div></Panel>

  <Panel title="Tema" action={<Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={()=>setAppearance({...DEFAULT_APPEARANCE,placeholders:appearance.placeholders,buttonText:appearance.buttonText,benefits:appearance.benefits,note:appearance.note})}><RotateCcw className="size-3.5" />Reset gaya</Button>}><div className="grid gap-5 p-4">
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(Object.keys(FORM_THEMES) as FormThemeId[]).map(id=>{const theme=FORM_THEMES[id];const active=appearance.theme===id;return <button key={id} type="button" aria-pressed={active} onClick={()=>applyTheme(id)} className={`relative overflow-hidden rounded-lg border text-left text-xs transition-shadow ${active?"ring-2 ring-primary":"hover:shadow-sm"}`}><span className="block p-2.5" style={{background:theme.pageColor}}><span className="block border p-2" style={{background:theme.backgroundColor,color:theme.textColor,borderRadius:theme.radius==="none"?0:theme.radius==="full"?14:8,borderColor:`${theme.textColor}22`}}><span className="block h-1.5 w-2/3 rounded-full opacity-70" style={{background:theme.textColor}} /><span className="mt-1.5 block h-3 border" style={{borderColor:`${theme.textColor}33`,borderRadius:theme.radius==="full"?99:theme.radius==="none"?0:4}} /><span className="mt-1.5 block h-3.5" style={{background:theme.buttonStyle==="solid"?theme.buttonColor:"transparent",border:`1.5px solid ${theme.buttonColor}`,borderRadius:theme.radius==="full"?99:theme.radius==="none"?0:4}} /></span></span><span className="flex items-center justify-between gap-1 border-t bg-card px-2.5 py-2 font-medium">{theme.label}{active&&<Check className="size-3.5 text-primary" />}</span></button>;})}</div>
   {appearance.theme==="custom"&&<p className="-mt-2 text-xs text-muted-foreground">Tema kustom — pilih salah satu tema di atas untuk mengganti semua warna dan gaya sekaligus.</p>}
   <div className="grid gap-4 sm:grid-cols-2">
    <ColorField id="of-color-button" label="Warna tombol / aksen" value={appearance.buttonColor} onChange={v=>set("buttonColor",v)} warning={buttonContrast<3?"Tombol garis kurang kontras dengan latar form.":undefined} />
    <ColorField id="of-color-bg" label="Latar form" value={appearance.backgroundColor} onChange={v=>set("backgroundColor",v)} />
    <ColorField id="of-color-text" label="Warna teks" value={appearance.textColor} onChange={v=>set("textColor",v)} warning={textContrast<4.5?`Kontras teks ${textContrast.toFixed(1)}:1 — sulit dibaca (disarankan ≥ 4.5:1).`:undefined} />
    <div className="grid gap-2">{transparent?<><Label>Latar halaman</Label><p className="flex h-10 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">Transparan</p></>:<ColorField id="of-color-page" label="Latar halaman" value={appearance.pageColor} onChange={v=>set("pageColor",v)} />}<Toggle checked={transparent} onChange={v=>set("pageColor",v?"transparent":"#f8fafc")}>Transparan — ikut latar landing page (embed)</Toggle></div>
   </div>
  </div></Panel>

  <Panel title="Gaya"><div className="grid gap-4 p-4 sm:grid-cols-2">
   <div className="grid gap-2"><Label htmlFor="of-font">Font</Label><select id="of-font" className={selectClass} value={appearance.font} onChange={e=>set("font",e.target.value as FormAppearance["font"])}>{(Object.keys(FORM_FONTS) as FormAppearance["font"][]).map(key=><option key={key} value={key}>{FORM_FONTS[key]}</option>)}</select></div>
   <Segmented label="Tampilan" value={appearance.layout} options={{card:"Kartu",plain:"Tanpa kartu"}} onChange={v=>set("layout",v)} />
   <div className="sm:col-span-2"><Segmented label="Sudut" value={appearance.radius} options={FORM_RADII} onChange={v=>set("radius",v)} /></div>
   <Segmented label="Gaya field" value={appearance.fieldStyle} options={FIELD_STYLES} onChange={v=>set("fieldStyle",v)} />
   <Segmented label="Gaya tombol" value={appearance.buttonStyle} options={{solid:"Penuh",outline:"Garis"}} onChange={v=>set("buttonStyle",v)} />
   <Segmented label="Rata judul" value={appearance.align} options={{left:"Kiri",center:"Tengah"}} onChange={v=>set("align",v)} />
  </div></Panel>

  <Panel title="Teks & elemen"><div className="grid gap-4 p-4">
   <div className="grid gap-2"><Label htmlFor="of-button-text">Teks tombol</Label><Input id="of-button-text" value={appearance.buttonText} maxLength={60} onChange={e=>set("buttonText",e.target.value)} /></div>
   <div className="grid gap-2"><Label htmlFor="of-note">Catatan di bawah tombol</Label><Input id="of-note" value={appearance.note} maxLength={160} placeholder="Kosongkan untuk menyembunyikan" onChange={e=>set("note",e.target.value)} /></div>
   <div className="grid gap-2.5 sm:grid-cols-2"><Toggle checked={appearance.showLabels} onChange={v=>set("showLabels",v)}>Tampilkan label di atas field</Toggle><Toggle checked={appearance.showButtonIcon} onChange={v=>set("showButtonIcon",v)}>Ikon panah pada tombol</Toggle><Toggle checked={appearance.showProduct} onChange={v=>set("showProduct",v)}>Tampilkan nama produk</Toggle><Toggle checked={appearance.showBenefits} onChange={v=>set("showBenefits",v)}>Tampilkan baris keunggulan</Toggle></div>
   {appearance.showBenefits&&<div className="grid gap-2"><p className="text-sm">Teks keunggulan</p><div className="grid grid-cols-3 gap-2">{appearance.benefits.map((value,index)=><Input key={index} aria-label={`Keunggulan ${index+1}`} value={value} maxLength={20} onChange={e=>{const next=[...appearance.benefits] as FormAppearance["benefits"];next[index]=e.target.value;set("benefits",next);}} />)}</div></div>}
  </div></Panel>
 </div>;
}
