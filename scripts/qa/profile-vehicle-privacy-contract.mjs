import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const api = read("app/api/profile/[id]/route.ts");
const page = read("app/profile/[id]/page.tsx");

assert.match(api, /vehicles:\s*\{[\s\S]*?select:\s*\{\s*vehicleType:\s*true\s*\}/,
  "public profiles may expose vehicle type, not registration plate or internal vehicle ID");
assert.doesNotMatch(api, /select:\s*\{[^}]*regPlate:\s*true/,
  "public profile API must not select vehicle registration plates");
assert.doesNotMatch(page, /v\.regPlate/,
  "public profile UI must not display vehicle registration plates");
console.log("Public profile vehicle privacy contract passed.");
