#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const roots = ["app", "components"];
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|jsx)$/.test(entry.name)) files.push(full);
  }
}

for (const directory of roots) walk(join(root, directory));

const issues = [];
const forbiddenCopy = [
  { pattern: /UK delivery marketplace|UK marketplace|UK local time|United Kingdom\s*[·—-]\s*GBP|MOT valid until|V5C document URL|UK-only promotions/i, label: "market-specific copy appears hard-coded in a shared screen" },
];
const adminPath = (path) => path.startsWith("app/admin/");
const explicitlyMarketScoped = (path) => path === "app/dashboard/page.tsx" || path === "app/requirements/page.tsx";

for (const file of files) {
  const path = relative(root, file).replaceAll("\\", "/");
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (!explicitlyMarketScoped(path)) {
      for (const rule of forbiddenCopy) {
        if (rule.pattern.test(line)) issues.push(`${path}:${index + 1}: ${rule.label}`);
      }
    }
    if (!adminPath(path) && /\.toLocale(?:Date|Time)?String\(\)/.test(line)) {
      issues.push(`${path}:${index + 1}: date/number formatting relies on the browser default locale; use a market formatter or pass an explicit locale`);
    }
    if (/\{\s*(?:job|vehicle|v)\.vehicleType\s*\}/.test(line)) {
      issues.push(`${path}:${index + 1}: raw vehicle type may expose canonical/UK-oriented wording; use vehicleTypeLabel()`);
    }
    if (/\{\s*job\.weightKg\s*\}\s*kg|(?:Estimated )?Weight \(kg\)/i.test(line) && !path.includes("admin/")) {
      issues.push(`${path}:${index + 1}: hard-coded kilogram label in a market-aware screen`);
    }
  });
}

if (issues.length) {
  console.error("Localisation copy audit failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Localisation copy audit passed across ${files.length} app/component files.`);
}
