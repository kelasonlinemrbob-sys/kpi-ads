import type { CSSProperties, ReactNode } from "react";
import { OrderFormBenefits } from "./order-form-benefits";
import { buttonForeground, type FormAppearance } from "@/lib/order-form-config";
const FONT_STACKS:Record<FormAppearance["font"],string>={sans:"var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",rounded:"ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', var(--font-dm-sans), sans-serif",serif:"ui-serif, Georgia, Cambria, 'Times New Roman', serif",mono:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"};
const RADII:Record<FormAppearance["radius"],[string,string]>={none:["0","0"],sm:["8px","4px"],md:["16px","8px"],lg:["24px","12px"],full:["28px","9999px"]};
/** CSS variables consumed by the .of-* classes in globals.css. */
export function formThemeStyle(appearance:FormAppearance):CSSProperties{
 return {"--of-accent":appearance.buttonColor,"--of-accent-fg":buttonForeground(appearance.buttonColor),"--of-bg":appearance.backgroundColor,"--of-text":appearance.textColor,"--of-font":FONT_STACKS[appearance.font],"--of-card-radius":RADII[appearance.radius][0],"--of-field-radius":RADII[appearance.radius][1]} as CSSProperties;
}
/** Shared by the public page and the editor preview so both render the same design. */
export function OrderFormFrame({appearance,product,title,description,compact,children}:{appearance:FormAppearance;product?:string;title:string;description:string;compact?:boolean;children:ReactNode}){
 const Heading=compact?"h3":"h1";
 return <div className="of-card" data-layout={appearance.layout}>{appearance.showBenefits&&<OrderFormBenefits labels={appearance.benefits} />}<div className={compact?"p-6":"p-5 sm:p-8"}><div style={{textAlign:appearance.align}}>{appearance.showProduct&&product&&<p className="of-muted mb-3 text-xs font-medium">{product}</p>}<Heading className="of-line border-b pb-4 text-xl font-semibold">{title}</Heading>{description&&<p className="of-muted mt-3 whitespace-pre-wrap text-sm">{description}</p>}</div>{children}</div></div>;
}
