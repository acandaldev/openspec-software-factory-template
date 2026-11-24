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

test("la tabla de comandos vive solo en README.md", async () => {
  const readme = await readFile(path.join(ROOT, "README.md"), "utf8");
  const spec = await readFile(path.join(ROOT, "docs", "template-spec.md"), "utf8");

  for (const command of manifest.commands) {
    assert.match(readme, new RegExp(`\\| \`/${command}\` \\|`), `README no lista /${command}`);
  }
  assert.ok(!spec.includes("| Comando |"), "template-spec.md no debe duplicar la tabla de comandos");
});

test("opencode.jsonc deja codegraph desactivado por defecto", async () => {
  const config = JSON.parse(await readFile(path.join(ROOT, "opencode.jsonc"), "utf8"));
  const server = config.mcp?.servers?.codegraph;

  assert.ok(server, "falta el servidor codegraph");
  assert.equal(server.type, "local");
  assert.deepEqual(server.command, ["codegraph", "serve", "--mcp"]);
  assert.equal(server.disabled, true);
  assert.equal(server.codemode, false);
});
