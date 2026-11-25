import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Copia solo lo que el bootstrap necesita. Así el test no depende de que el
// repositorio tenga un harness.config.json generado.
const COPY = [
  "AGENTS.md",
  "MEMORY.md",
  "bootstrap.mjs",
  ".opencode",
  "scripts",
  "docs",
  "data",
];

const FLAGS = [
  "--yes",
  "--name",
  "Acme Notes",
  "--description",
  "Notas internas del equipo",
  "--stack",
  "stack de ejemplo",
  "--source-dirs",
  "source/",
  "--build",
  "build-command",
  "--test",
  "test-command",
  "--format",
  "format-command",
  "--implement-hard",
  "provider/model-hard#high",
  "--implement-normal",
  "provider/model-normal",
  "--implement-fast",
  "provider/model-fast",
  "--review-hard",
  "provider/model-review-hard#high",
  "--review-normal",
  "provider/model-review-normal",
  "--review-fast",
  "provider/model-review-fast",
  "--review-copy-dir",
  ".review",
  "--main-branch",
  "main",
];

async function makeProject() {
  const dir = await mkdtemp(path.join(tmpdir(), "osf-bootstrap-"));
  for (const entry of COPY) {
    await cp(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  return dir;
}

function runBootstrap(dir, args = FLAGS) {
  return spawnSync(process.execPath, ["bootstrap.mjs", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

test("bootstrap sustituye placeholders, escribe configuración y valida", async () => {
  const dir = await makeProject();
  try {
    const result = runBootstrap(dir);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const config = JSON.parse(await readFile(path.join(dir, "harness.config.json"), "utf8"));
    assert.equal(config.project.slug, "acme-notes");
    assert.equal(config.project.displayName, "Acme Notes");
    assert.equal(config.stack.buildCommand, "build-command");
    assert.equal(config.models.implementHard, "provider/model-hard#high");
    assert.equal(config.reviewCopyDir, ".review");
    assert.equal(config.docs.mainBranch, "main");

    const agents = await readFile(path.join(dir, "AGENTS.md"), "utf8");
    assert.ok(!agents.includes("{{"), "AGENTS.md conserva placeholders");
    assert.ok(agents.includes("Acme Notes"));
    assert.ok(agents.includes("provider/model-hard#high"));
    assert.ok(agents.includes("provider/model-review-normal"));

    const agentsDir = path.join(dir, ".opencode/agents");
    for (const file of await readdir(agentsDir)) {
      const text = await readFile(path.join(agentsDir, file), "utf8");
      assert.ok(!text.includes("{{"), `${file} conserva placeholders`);
    }

    const reviewer = await readFile(path.join(agentsDir, "reviewer.md"), "utf8");
    assert.ok(reviewer.includes(".review"));

    const revisar = await readFile(path.join(dir, ".opencode/commands/revisar.md"), "utf8");
    assert.ok(!revisar.includes("{{"), "revisar.md conserva placeholders");
    assert.ok(revisar.includes("AGENTS.md"), "revisar.md delega la matriz en AGENTS.md");

    assert.ok(await exists(path.join(dir, "docs/index.md")));
    assert.ok(await exists(path.join(dir, "openspec/changes")));
    assert.ok(await exists(path.join(dir, "openspec/specs")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function assertSchema(example, generated, at = "harness.config") {
  if (typeof example === "string" && /^\{\{[^}]+\}\}$/.test(example)) return;

  if (Array.isArray(example)) {
    assert.ok(Array.isArray(generated), `${at}: se esperaba un array`);
    assert.equal(generated.length, example.length, `${at}: longitud`);
    example.forEach((value, index) => assertSchema(value, generated[index], `${at}[${index}]`));
    return;
  }

  if (example && typeof example === "object") {
    assert.ok(
      generated && typeof generated === "object" && !Array.isArray(generated),
      `${at}: se esperaba un objeto`,
    );
    assert.deepEqual(Object.keys(example).sort(), Object.keys(generated).sort(), `${at}: claves`);
    for (const key of Object.keys(example)) {
      assertSchema(example[key], generated[key], `${at}.${key}`);
    }
    return;
  }

  assert.deepEqual(generated, example, `${at}: valor por defecto`);
}

test("harness.config.example.json mantiene el esquema del bootstrap", async () => {
  const dir = await makeProject();
  try {
    const result = runBootstrap(dir);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const generated = JSON.parse(await readFile(path.join(dir, "harness.config.json"), "utf8"));
    const example = JSON.parse(
      await readFile(path.join(ROOT, "harness.config.example.json"), "utf8"),
    );
    assertSchema(example, generated);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bootstrap rechaza sobrescribir harness.config.json sin --force", async () => {
  const dir = await makeProject();
  try {
    const first = runBootstrap(dir);
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const second = runBootstrap(dir);
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /ya existe/);

    const forced = runBootstrap(dir, [...FLAGS, "--force"]);
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bootstrap con --yes falla si faltan valores obligatorios", async () => {
  const dir = await makeProject();
  try {
    const result = runBootstrap(dir, ["--yes", "--name", "Acme Notes"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Faltan valores/);
    assert.match(result.stderr, /Stack del proyecto/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
