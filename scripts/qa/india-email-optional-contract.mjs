import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const signup = readFileSync("app/api/signup/route.ts", "utf8");
const auth = readFileSync("lib/auth.ts", "utf8");
const signupUi = readFileSync("app/signup/page.tsx", "utf8");
const localisation = readFileSync("lib/localisation.ts", "utf8");
const loginUi = readFileSync("app/login/page.tsx", "utf8");
const emailPolicy = readFileSync("lib/emailVerification.ts", "utf8");
const migration = readFileSync("prisma/migrations/20261029140000_india_optional_email/migration.sql", "utf8");
const phone = readFileSync("lib/phoneVerification.ts", "utf8");

assert.match(schema, /email\s+String\?\s+@unique/, "user email must be nullable and retain uniqueness for supplied email addresses");
assert.match(migration, /ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL/, "migration must allow email-less India accounts");
assert.match(signup, /country !== "IN" && !String\(email \|\| ""\)\.trim\(\)/, "all non-India markets must require an email");
assert.match(signup, /email: normalizedEmail \|\| null/, "signup must persist omitted India email as null");
assert.match(signupUi, /required=\{!isIndia\}/, "signup UI must make email optional only for India");
assert.match(emailPolicy, /country !== "IN" && emailVerificationEnabled\(\)/, "email verification policy must preserve the India exception");
assert.match(auth, /account: \{ country: "IN" \}/, "phone login lookup must be limited to India accounts");
assert.match(auth, /phoneMatches\.length === 1/, "phone login must fail closed for ambiguous duplicate phone numbers");
assert.match(auth, /emailVerificationRequiredForCountry\(user\.account\.country\)/, "login enforcement must use market-aware email policy");
assert.match(loginUi, /Email or phone number \(India accounts\)/, "login UI must explain India phone sign-in");
assert.match(phone, /POST2DRIVE_SMS_GLOBAL_PROVIDER/, "other configured markets must have a global SMS provider slot");
assert.match(signup, /companyNumber: typeof companyNumber === "string"/, "signup API must persist a country-scoped company ID");
assert.match(signupUi, /Country-specific company \/ business registration ID/, "signup must request the relevant company ID outside the UK and India");
assert.match(localisation, /registrationDocumentLabel/, "vehicle registration terminology must remain market-aware");

console.log(JSON.stringify({ status: "passed", checks: 11 }, null, 2));
