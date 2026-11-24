#!/usr/bin/env node
// Gate de secretos y datos privados. Sin dependencias.
//   node scripts/check-secrets.mjs
// Falla si encuentra una credencial o un término prohibido en los ficheros de texto.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "dist", "node_modules"]);
const SKIP_FILES = new Set([
  "scripts/check-secrets.mjs",
  "data/forbidden.json",
  "data/forbidden.local.json",
]);
const TEXT = /\.(md|json|mjs|js|css|svg|yml|yaml|txt|html)$/i;

const CREDENTIALS = [
  ["GitHub fine-grained PAT", /github_pat_[A-Za-z0-9_]{20,}/],
  ["GitHub classic token", /ghp_[A-Za-z0-9]{20,}/],
  ["OpenAI key", /sk-[A-Za-z0-9]{20,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Private key", /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["GitLab token", /glpat-[A-Za-z0-9_-]{20,}/],
  ["Password assignment", /(password|passwd|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i],
  ["Windows user path", /[A-Z]:\\Users\\/],
];

// La lista pública solo lleva ejemplos genéricos. Los términos del proyecto real
// viven fuera del repositorio, en ~/.config/openspec-software-factory/forbidden.json
// o en la ruta que indique OPENSPEC_FORBIDDEN_FILE.
const LOCAL_TERMS_FILE = process.env.OPENSPEC_FORBIDDEN_FILE
  ? path.resolve(process.env.OPENSPEC_FORBIDDEN_FILE)
  : path.join(os.homedir(), ".config", "openspec-software-factory", "forbidden.json");

function readTerms(full) {
  if (!existsSync(full)) return [];
  const parsed = JSON.parse(readFileSync(full, "utf8"));
  return Array.isArray(parsed.terms) ? parsed.terms : [];
}

const forbidden = [...new Set([
  ...readTerms(path.join(ROOT, "data", "forbidden.json")),
  ...readTerms(LOCAL_TERMS_FILE),
])];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (TEXT.test(entry) && !SKIP_FILES.has(rel)) yield { full, rel };
  }
}

const findings = [];
for (const { full, rel } of walk(ROOT)) {
  const lines = readFileSync(full, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [name, re] of CREDENTIALS) {
      if (re.test(line)) findings.push(`${rel}:${i + 1}: ${name}`);
    }
    const lower = line.toLowerCase();
    for (const term of forbidden) {
      if (term && lower.includes(term.toLowerCase())) {
        findings.push(`${rel}:${i + 1}: término prohibido "${term}"`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`\n${findings.length} hallazgo(s):`);
  for (const f of findings) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`Sin secretos ni datos privados (${forbidden.length} términos vigilados).`);
