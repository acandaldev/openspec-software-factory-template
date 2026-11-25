import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "worktree-deps.mjs");

function runScript(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
  });
}

async function setupFixture(t, { rootLock = '{\n  "lock": 1\n}\n', wtLock = '{\r\n  "lock": 1\r\n}\r\n' } = {}) {
  const base = await mkdtemp(path.join(tmpdir(), "worktree-deps-test-"));
  t.after(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const root = path.join(base, "root");
  const wt = path.join(base, "wt");

  await mkdir(path.join(root, "front", "node_modules", "pkg"), { recursive: true });
  await writeFile(
    path.join(root, "front", "node_modules", "pkg", "index.js"),
    "export default 42;\n",
  );
  await writeFile(
    path.join(root, "harness.config.json"),
    JSON.stringify({
      worktree: {
        sharedDirs: [
          {
            dir: "front/node_modules",
            lockfile: "front/package-lock.json",
          },
        ],
      },
    }),
  );
  if (rootLock !== null) {
    await writeFile(path.join(root, "front", "package-lock.json"), rootLock);
  }

  await mkdir(path.join(wt, "front"), { recursive: true });
  if (wtLock !== null) {
    await writeFile(path.join(wt, "front", "package-lock.json"), wtLock);
  }

  return { root, wt };
}

test("link enlaza con lockfile equivalente (CRLF vs LF), es idempotente y unlink preserva el origen", async (t) => {
  const { root, wt } = await setupFixture(t);
  const wtNodeModules = path.join(wt, "front", "node_modules");
  const rootMarker = path.join(root, "front", "node_modules", "pkg", "index.js");

  const first = runScript(["link", wt, "--root", root]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /LINK front\/node_modules/);
  assert.equal(fs.lstatSync(wtNodeModules).isSymbolicLink(), true);
  assert.equal(
    fs.existsSync(path.join(wtNodeModules, "pkg", "index.js")),
    true,
  );

  const second = runScript(["link", wt, "--root", root]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /OK front\/node_modules \(ya enlazado\)/);

  const unlinked = runScript(["unlink", wt, "--root", root]);
  assert.equal(unlinked.status, 0, unlinked.stderr);
  assert.match(unlinked.stdout, /UNLINK front\/node_modules/);
  assert.equal(fs.existsSync(wtNodeModules), false);
  assert.equal(fs.existsSync(rootMarker), true);
});

test("link omite el enlace cuando el lockfile del worktree difiere del árbol principal", async (t) => {
  const { root, wt } = await setupFixture(t, {
    rootLock: '{"lock":1}\n',
    wtLock: '{"lock":2}\n',
  });

  const res = runScript(["link", wt, "--root", root]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /SKIP front\/node_modules .*difiere/);
  assert.equal(fs.existsSync(path.join(wt, "front", "node_modules")), false);
});

test("link y unlink respetan un directorio real preexistente en el worktree", async (t) => {
  const { root, wt } = await setupFixture(t);
  const localPkg = path.join(wt, "front", "node_modules", "local-only", "a.js");
  await mkdir(path.dirname(localPkg), { recursive: true });
  await writeFile(localPkg, "1;\n");

  const linked = runScript(["link", wt, "--root", root]);
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stdout, /SKIP front\/node_modules \(ya existe directorio propio/);
  assert.equal(fs.existsSync(localPkg), true);

  const unlinked = runScript(["unlink", wt, "--root", root]);
  assert.equal(unlinked.status, 0, unlinked.stderr);
  assert.match(unlinked.stdout, /KEEP front\/node_modules/);
  assert.equal(fs.existsSync(localPkg), true);
});

test("rechaza usar el árbol principal como ruta de worktree", async (t) => {
  const { root } = await setupFixture(t);
  const res = runScript(["link", root, "--root", root]);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /no puede ser el árbol principal/);
});

test("unlink limpia .codegraph del worktree antes de retirarlo", async (t) => {
  const { root, wt } = await setupFixture(t);
  const cgFile = path.join(wt, ".codegraph", "dummy.db");
  await mkdir(path.dirname(cgFile), { recursive: true });
  await writeFile(cgFile, "index");

  const res = runScript(["unlink", wt, "--root", root]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /(UNINIT|CLEAN) \.codegraph/);
  assert.equal(fs.existsSync(path.join(wt, ".codegraph")), false);
});
