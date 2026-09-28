/* Creates (or resets the password of) a supervisor account without touching other data.
   Usage: pnpm db:create-supervisor "Full Name" email@company.com "password" */
import bcrypt from "bcryptjs";
import { db } from "./index";
import { users } from "./schema";

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 8) {
    console.error('Usage: pnpm db:create-supervisor "Full Name" email@company.com "password (min 8 chars)"');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .insert(users)
    .values({ name, email: email.toLowerCase(), passwordHash, role: "supervisor" })
    .onConflictDoUpdate({ target: users.email, set: { name, passwordHash, role: "supervisor", isActive: true } });
  console.log(`Supervisor ready: ${email.toLowerCase()}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
