import { getRegistrationApiKey, REGISTRATION_SOURCES, RegistrationApiError, syncRegistrations } from "@/lib/registrations";
// Run by kpiads-registrations.timer every five minutes, as the APIs recommend: each configured
// registration app (LKBI, Kelas Online) in turn; one failing doesn't stop the other.
let failed = false;
for (const source of REGISTRATION_SOURCES) {
  try {
    if (!(await getRegistrationApiKey(source))) {
      console.log(`[registrations:${source}] not configured`);
      continue;
    }
    console.log(`[registrations:${source}]`, JSON.stringify(await syncRegistrations({ source })));
  } catch (error) {
    failed = true;
    console.error(`[registrations:${source}]`, error instanceof RegistrationApiError ? error.message : "sync failed");
  }
}
process.exit(failed ? 1 : 0);
