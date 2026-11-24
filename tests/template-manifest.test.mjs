import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(ROOT, "template.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

test("template.json declara la versión del paquete y el harness", () => {
  assert.equal(manifest.name, pkg.name);
  assert.equal(manifest.version, pkg.version);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.label, `v${manifest.version.split(".").slice(0, 2).join(".")}`);
  assert.equal(manifest.harness, "opencode");
  assert.match(manifest.repository, /^https:\/\/github\.com\//);
  assert.match(manifest.site, /^https:\/\//);
});

test("template.json solo referencia comandos y agentes que existen", async () => {
  assert.ok(manifest.commands.length > 0);
  assert.ok(manifest.agents.length > 0);

  for (const command of manifest.commands) {
    await stat(path.join(ROOT, ".opencode", "commands", `${command}.md`));
  }
  for (const agent of manifest.agents) {
    await stat(path.join(ROOT, ".opencode", "agents", `${agent}.md`));
  }
});
