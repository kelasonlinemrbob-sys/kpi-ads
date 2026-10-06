import { syncGoogleSheets } from "@/lib/google-sheets";
import { sheetsErrorMessage } from "@/lib/google-sheets-client";
try {
  const sync = await syncGoogleSheets({ automatic: true });
  console.log("[sheets]", sync.skipped ? "disabled / not configured" : JSON.stringify(sync.result));
  process.exit(0);
} catch (error) {
  console.error("[sheets]", sheetsErrorMessage(error));
  process.exit(1);
}
