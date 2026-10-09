import type { CSSProperties, ReactNode } from "react";
import { OrderFormBenefits } from "./order-form-benefits";
import { buttonForeground, FORM_WIDTH_PX, type FormAppearance } from "@/lib/order-form-config";

const FONT_STACKS: Record<FormAppearance["font"], string> = {
  sans: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
  inter: "var(--of-font-inter), ui-sans-serif, system-ui, sans-serif",
  jakarta: "var(--of-font-jakarta), ui-sans-serif, system-ui, sans-serif",
  poppins: "var(--of-font-poppins), ui-sans-serif, system-ui, sans-serif",
  montserrat: "var(--of-font-montserrat), ui-sans-serif, system-ui, sans-serif",
  nunito: "var(--of-font-nunito), ui-rounded, ui-sans-serif, sans-serif",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', var(--font-dm-sans), sans-serif",
  playfair: "var(--of-font-playfair), ui-serif, Georgia, serif",
  lora: "var(--of-font-lora), ui-serif, Georgia, serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};
/** Card corner, then the field / button corner that goes with it. */
const RADII: Record<FormAppearance["radius"], [string, string]> = { none: ["0", "0"], sm: ["8px", "4px"], md: ["16px", "8px"], lg: ["24px", "12px"], full: ["28px", "9999px"] };
const SHADOWS: Record<FormAppearance["shadow"], string> = {
  none: "none",
  sm: "0 1px 3px rgb(0 0 0 / 0.06)",
  md: "0 8px 24px -6px rgb(0 0 0 / 0.14)",
  lg: "0 24px 48px -12px rgb(0 0 0 / 0.25)",
};
const PADDING: Record<FormAppearance["padding"], [string, string]> = { compact: ["1rem", "1.5rem"], normal: ["1.25rem", "2rem"], spacious: ["1.75rem", "2.75rem"] };
const TEXT_SIZE: Record<FormAppearance["textSize"], string> = { sm: "0.9375rem", md: "1rem", lg: "1.0625rem" };
const TITLE_SIZE: Record<FormAppearance["titleSize"], string> = { sm: "1.125rem", md: "1.25rem", lg: "1.5rem", xl: "1.875rem" };
const TITLE_WEIGHT: Record<FormAppearance["titleWeight"], number> = { semibold: 600, bold: 700, extrabold: 800 };
const GAP: Record<FormAppearance["fieldGap"], string> = { compact: "0.625rem", normal: "1rem", relaxed: "1.375rem" };
const LOGO_HEIGHT: Record<FormAppearance["logoSize"], number> = { sm: 28, md: 40, lg: 60 };

/** A darker shade for the automatic end of a gradient button. */
function darker(hex: string, amount = 0.28) {
  const n = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)).toString(16).padStart(2, "0");
  return `#${n(1)}${n(3)}${n(5)}`;
}

/** Optional custom properties: unset ones fall back to the derived colours in globals.css. */
const optional = (entries: [string, string | null][]) => Object.fromEntries(entries.filter(([, v]) => v !== null));

/** CSS variables consumed by the .of-* classes in globals.css. */
export function formThemeStyle(a: FormAppearance): CSSProperties {
  const accentFg = a.buttonTextColor ?? buttonForeground(a.buttonColor);
  return {
    "--of-accent": a.buttonColor,
    "--of-accent-to": a.buttonColorTo ?? darker(a.buttonColor),
    "--of-accent-fg": accentFg,
    "--of-bg": a.backgroundColor,
    "--of-text": a.textColor,
    "--of-font": FONT_STACKS[a.font],
    "--of-card-radius": RADII[a.radius][0],
    "--of-field-radius": RADII[a.fieldRadius ?? a.radius][1],
    "--of-button-radius": RADII[a.buttonRadius ?? a.radius][1],
    "--of-shadow": SHADOWS[a.shadow],
    "--of-border-w": a.border === "none" ? "0px" : a.border === "thick" ? "2px" : "1px",
    "--of-pad": PADDING[a.padding][0],
    "--of-pad-lg": PADDING[a.padding][1],
    "--of-text-size": TEXT_SIZE[a.textSize],
    "--of-gap": GAP[a.fieldGap],
    "--of-button-h": a.buttonSize === "lg" ? "3.5rem" : "3rem",
    "--of-button-fs": a.buttonSize === "lg" ? "1.0625rem" : "1rem",
    "--of-button-shadow": a.buttonShadow ? "0 10px 20px -8px color-mix(in srgb, var(--of-accent) 70%, transparent)" : "none",
    ...optional([
      ["--of-heading", a.headingColor],
      ["--of-muted-c", a.mutedColor],
      ["--of-line-c", a.borderColor],
      ["--of-field-bg", a.fieldBgColor],
      ["--of-field-line", a.fieldBorderColor],
      ["--of-button-text", a.buttonTextColor],
      ["--of-benefits-bg", a.benefitsBgColor],
      ["--of-benefits-text", a.benefitsTextColor],
    ]),
  } as CSSProperties;
}

/** Page background: solid, gradient, or transparent for an embed that takes the landing page's background. */
export function formPageBackground(a: FormAppearance) {
  if (a.pageColor === "transparent") return "transparent";
  return a.pageStyle === "gradient" ? `linear-gradient(${a.pageGradientAngle}deg, ${a.pageColor}, ${a.pageGradientTo})` : a.pageColor;
}

export const formMaxWidth = (a: FormAppearance) => FORM_WIDTH_PX[a.width];

/** Shared by the public page and the editor preview so both render the same design. */
export function OrderFormFrame({ appearance: a, product, title, description, compact, children }: { appearance: FormAppearance; product?: string; title: string; description: string; compact?: boolean; children: ReactNode }) {
  const Heading = compact ? "h3" : "h1";
  const benefits = a.showBenefits && <OrderFormBenefits labels={a.benefits} icons={a.benefitsIcons} position={a.benefitsPosition} />;
  return (
    <div className="of-card" data-layout={a.layout}>
      {a.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.bannerUrl} alt="" className="block max-h-56 w-full object-cover" referrerPolicy="no-referrer" />
      )}
      {a.benefitsPosition === "top" && benefits}
      <div className="of-body">
        <div style={{ textAlign: a.align }}>
          {a.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.logoUrl} alt="" referrerPolicy="no-referrer" className="mb-4 inline-block w-auto max-w-[70%] object-contain" style={{ height: LOGO_HEIGHT[a.logoSize] }} />
          )}
          {a.showProduct && product && <p className="of-muted mb-3 text-xs font-medium">{product}</p>}
          <Heading
            className={`of-heading of-line ${a.titleDivider ? "border-b pb-4" : ""}`}
            style={{ fontSize: compact ? `calc(${TITLE_SIZE[a.titleSize]} * 0.92)` : TITLE_SIZE[a.titleSize], fontWeight: TITLE_WEIGHT[a.titleWeight], lineHeight: 1.25 }}
          >
            {title}
          </Heading>
          {description && <p className="of-muted of-description mt-3 whitespace-pre-wrap">{description}</p>}
        </div>
        {children}
      </div>
      {a.benefitsPosition === "bottom" && benefits}
    </div>
  );
}
