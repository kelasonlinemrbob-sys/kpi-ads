import { OrderFormFrame, formThemeStyle } from "./order-form-frame";
import { FIELD_LABELS, type FieldKey, type OrderFields } from "@/lib/order-form-input";
import type { FormAppearance } from "@/lib/order-form-config";
import { ArrowRightCircle } from "lucide-react";
export function OrderFormPreview({title,description,product,fields,appearance}:{title:string;description:string;product?:string;fields:OrderFields;appearance:FormAppearance}){
 return <div className="of-root rounded-lg p-4" style={{...formThemeStyle(appearance),background:appearance.pageColor==="transparent"?"repeating-conic-gradient(#e2e8f0 0 25%,#fff 0 50%) 0 0/16px 16px":appearance.pageColor}} aria-hidden="true">
  <OrderFormFrame compact appearance={appearance} product={product} title={title} description={description}><div className="mt-5 grid gap-3">{(Object.keys(FIELD_LABELS) as FieldKey[]).filter(k=>fields[k]!=="off").map(k=><div key={k}>{appearance.showLabels&&<p className="mb-1 text-xs font-medium">{FIELD_LABELS[k]}{fields[k]==="required"?" *":""}</p>}<input className="of-field" data-variant={appearance.fieldStyle} readOnly tabIndex={-1} placeholder={appearance.placeholders[k]+(!appearance.showLabels&&fields[k]==="required"?" *":"")} /></div>)}<div className="of-button" data-variant={appearance.buttonStyle}>{appearance.buttonText}{appearance.showButtonIcon&&<ArrowRightCircle className="size-5 shrink-0" />}</div>{appearance.note&&<p className="of-muted text-center text-xs">{appearance.note}</p>}</div></OrderFormFrame>
 </div>;
}
