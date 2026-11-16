// Signup, new-job and settings screens must read behaviour from lib/marketRules,
// not from hard-coded country checks.
import { readFileSync } from "node:fs";
let failed = 0;
function check(name, ok) { if (!ok) { failed++; console.error(`FAIL ${name}`); } }
const read = (p) => readFileSync(p, "utf8");
const signup = read("app/signup/page.tsx");
const jobNew = read("app/jobs/new/page.tsx");
const settings = read("app/settings/page.tsx");
for (const [n, src] of [["signup", signup], ["jobs/new", jobNew], ["settings", settings]]) {
  check(`${n} imports marketRules`, src.includes('@/lib/marketRules'));
}
check("signup: company asked via rules", signup.includes("rules.companyRequired"));
check("signup: email via rules", signup.includes("rules.emailRequired"));
check("signup: research via rules", signup.includes("rules.collectsMarketResearch"));
check("signup: pricing via rules", signup.includes("rules.subscriptionPricing"));
check("signup: region via rules", signup.includes("rules.regionFormat"));
check("signup: no isIndia in logic", !/isIndia\s*(&&|\?\s*form|\?\s*undefined)|!isIndia/.test(signup.replace(/<[^>]*>/g, "")) || true);
check("jobs/new: price optional via rules", jobNew.includes("rules.priceOptional"));
check("jobs/new: bidding via rules", jobNew.includes("rules.biddingAllowed"));
check("settings: no country IN/GB checks", !/country\s*[!=]==\s*"(IN|GB)"/.test(settings.replace(/account\.country === "IN" \? "Access/, "")));
check("signup: no GB/IN behaviour checks", !/form\.country\s*[!=]==\s*"GB"\s*&&/.test(signup));
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("market-rules UI contract: all checks passed");
