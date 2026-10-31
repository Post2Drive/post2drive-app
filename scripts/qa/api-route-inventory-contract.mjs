#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const apiRoot = "app/api";
const inventoryPath = "docs/security/api-route-access-inventory.md";
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : entry.isFile() && entry.name === "route.ts" ? [absolute.replaceAll("\\", "/")] : [];
  });
}
const actualFiles = walk(apiRoot).sort();
const markdown = readFileSync(inventoryPath, "utf8");
const rows = [...markdown.matchAll(/^\|\s*(\d+)\s*\|\s*\`([^\`]+)\`\s*\|\s*([^|]+)\|\s*([^|]+)\|/gm)]
  .map((match) => ({
    number: Number(match[1]),
    route: match[2].trim(),
    methods: match[3].split(",").map((method) => method.trim()).filter(Boolean),
    boundary: match[4].trim(),
  }));

assert.ok(rows.length > 0, "API access inventory must contain route rows");
assert.deepEqual(rows.map((row) => row.number), rows.map((_, index) => index + 1),
  "API inventory row numbers must be continuous and unique");
assert.equal(new Set(rows.map((row) => row.route)).size, rows.length,
  "API inventory must not duplicate a route");
assert.equal(rows.length, actualFiles.length,
  "API inventory must account for every app/api/**/route.ts file");

const documentedFiles = [];
for (const row of rows) {
  const file = "app" + row.route + "/route.ts";
  documentedFiles.push(file);
  assert.ok(actualFiles.includes(file), row.route + " must resolve to an existing route.ts file");
  assert.ok(row.boundary.length > 10, row.route + " must document its access boundary");

  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exported = new Set();
  for (const statement of ast.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) exported.add(statement.name.text);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) exported.add(declaration.name.text);
      }
    }
  }
  const expected = [...row.methods].sort();
  const actual = [...exported].filter((name) => ["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"].includes(name)).sort();
  assert.deepEqual(actual, expected,
    row.route + " documented methods must exactly match exported HTTP handlers");
}
assert.deepEqual([...documentedFiles].sort(), actualFiles,
  "API access inventory must not omit or retain stale route files");
console.log("API route inventory contract passed: " + rows.length + " route files and their exported HTTP methods are documented.");
