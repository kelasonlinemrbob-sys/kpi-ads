import "server-only";
import { KIE_MODEL } from "./kie-client";
import { KIE_GEMINI_MODEL } from "./kie-gemini";

/**
 * Which model writes the Ringkasan analysis. Gemini is the default: on Kie it really sees images and
 * costs a fraction of Opus, while Kie's Claude drops images and rejects tools (checked 2026-10-07).
 * AI_SUMMARY_MODEL=claude switches back to Claude Opus.
 */
export const SUMMARY_PROVIDER: "gemini" | "claude" = process.env.AI_SUMMARY_MODEL === "claude" ? "claude" : "gemini";
export const SUMMARY_MODEL = SUMMARY_PROVIDER === "gemini" ? KIE_GEMINI_MODEL : KIE_MODEL;
/** Model of "Analisa creative" for one content. */
export const CONTENT_MODEL = KIE_GEMINI_MODEL;

/**
 * Creative images in the Ringkasan analysis: on with Gemini, off with Claude, whose Kie endpoint drops
 * image blocks without an error. AI_ANALYSIS_IMAGES=true/false overrides.
 */
export const ANALYSIS_IMAGES_ENABLED = process.env.AI_ANALYSIS_IMAGES ? process.env.AI_ANALYSIS_IMAGES === "true" : SUMMARY_PROVIDER === "gemini";
