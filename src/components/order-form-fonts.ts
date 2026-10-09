import { Inter, Lora, Montserrat, Nunito, Playfair_Display, Plus_Jakarta_Sans, Poppins } from "next/font/google";

/**
 * Fonts an order form can use, self-hosted by next/font (visitors make no request to Google). Not
 * preloaded: a browser downloads a font only when the form's theme uses it.
 */
const inter = Inter({ subsets: ["latin"], variable: "--of-font-inter", display: "swap", preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--of-font-jakarta", display: "swap", preload: false });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--of-font-poppins", display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--of-font-montserrat", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], variable: "--of-font-nunito", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--of-font-playfair", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--of-font-lora", display: "swap", preload: false });

/** Class names that define the --of-font-* variables; put them on the form's root element. */
export const ORDER_FORM_FONT_CLASSES = [inter, jakarta, poppins, montserrat, nunito, playfair, lora].map((f) => f.variable).join(" ");
