import { ShoppingBag, Zap, ShieldCheck } from "lucide-react";
export function OrderFormBenefits({labels}:{labels:readonly [string,string,string]}){
 return <div className="of-benefits flex items-center justify-center gap-5 px-4 py-4 text-xs font-semibold sm:gap-8 sm:text-sm">{[ShoppingBag,Zap,ShieldCheck].map((Symbol,index)=> <span key={index} className="flex items-center gap-1.5"><Symbol className="size-5" aria-hidden="true" />{labels[index]}</span>)}</div>;
}
