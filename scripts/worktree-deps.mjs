#!/usr/bin/env node
// Enlaza o desenlaza directorios pesados compartidos (p. ej. node_modules) entre el
// árbol principal y un worktree o copia de revisión, leyendo `worktree.sharedDirs` de
// `harness.config.json`. Solo enlaza cuando el lockfile asociado coincide en hash
// (normalizando CRLF/LF) y al desenlazar solo elimina enlaces simbólicos/junctions.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  let root = path.resolve(HERE, "..");
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") {
      if (i + 1 >= argv.length) {
        throw new Error("Falta el valor de --root.");
      }
      root = path.resolve(argv[++i]);
    } else {
      positional.push(argv[i]);
    }
  }
  const [action, worktreeArg] = positional;
  if (!["link", "unlink"].includes(action) || !worktreeArg) {
    throw new Error(
      "Uso: node scripts/worktree-deps.mjs <link|unlink> <ruta-worktree> [--root <ruta-raiz>]",
    );
  }
  return { action, worktree: path.resolve(worktreeArg), root };
}

function loadSharedDirs(root) {
  const configPath = path.join(root, "harness.config.json");
  if (!fs.existsSync(configPath)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const entries = parsed?.worktree?.sharedDirs;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) =>
    typeof entry === "string" ? { dir: entry, lockfile: null } : entry,
  );
}

function normalizedFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const normalized = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

function lstatOrNull(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function ensureDistinctWorktree(root, worktree, requireExists) {
  const rootReal = fs.existsSync(root) ? fs.realpathSync(root) : root;
  if (!fs.existsSync(worktree)) {
    if (requireExists) {
      throw new Error(`No existe el directorio de worktree: ${worktree}`);
    }
    if (worktree === root || worktree === rootReal) {
      throw new Error("La ruta del worktree no puede ser el árbol principal.");
    }
    return false;
  }
  const worktreeReal = fs.realpathSync(worktree);
  if (worktreeReal === rootReal) {
    throw new Error("La ruta del worktree no puede ser el árbol principal.");
  }
  return true;
}

function linkSharedDirs(root, worktree, sharedDirs) {
  ensureDistinctWorktree(root, worktree, true);
  if (sharedDirs.length === 0) {
    console.log("SKIP (sin worktree.sharedDirs en harness.config.json)");
    return;
  }

  for (const { dir, lockfile } of sharedDirs) {
    const srcDir = path.resolve(root, dir);
    const dstDir = path.resolve(worktree, dir);

    if (!fs.existsSync(srcDir)) {
      console.log(
        `SKIP ${dir} (no existe en el árbol principal: instala dependencias en la raíz primero)`,
      );
      continue;
    }

    if (lockfile) {
      const rootHash = normalizedFileHash(path.resolve(root, lockfile));
      const wtHash = normalizedFileHash(path.resolve(worktree, lockfile));
      if (!rootHash || !wtHash || rootHash !== wtHash) {
        console.log(
          `SKIP ${dir} (${lockfile} difiere o falta respecto al árbol principal)`,
        );
        continue;
      }
    }

    const existing = lstatOrNull(dstDir);
    if (existing) {
      if (existing.isSymbolicLink()) {
        try {
          if (fs.realpathSync(dstDir) === fs.realpathSync(srcDir)) {
            console.log(`OK ${dir} (ya enlazado)`);
            continue;
          }
        } catch {
          // Enlace roto: se reemplaza abajo.
        }
        fs.unlinkSync(dstDir);
      } else {
        console.log(`SKIP ${dir} (ya existe directorio propio en el worktree)`);
        continue;
      }
    }

    fs.mkdirSync(path.dirname(dstDir), { recursive: true });
    fs.symlinkSync(srcDir, dstDir, "junction");
    console.log(`LINK ${dir} -> ${srcDir}`);
  }
}

function uninitCodeGraphIfPresent(worktree) {
  const cgDir = path.join(worktree, ".codegraph");
  if (!fs.existsSync(cgDir)) {
    return;
  }
  const res = spawnSync("codegraph", ["uninit", "--force", "."], {
    cwd: worktree,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  try {
    if (fs.existsSync(cgDir)) {
      fs.rmSync(cgDir, { recursive: true, force: true });
    }
    console.log(res.status === 0 ? "UNINIT .codegraph" : "CLEAN .codegraph");
  } catch {
    console.log(
      "WARN .codegraph sigue en uso (ejecuta `codegraph daemons` si bloquea el borrado)",
    );
  }
}

function unlinkSharedDirs(root, worktree, sharedDirs) {
  const exists = ensureDistinctWorktree(root, worktree, false);
  if (!exists) {
    console.log(`OK (${worktree} ya no existe)`);
    return;
  }

  uninitCodeGraphIfPresent(worktree);

  for (const { dir } of sharedDirs) {
    const dstDir = path.resolve(worktree, dir);
    const stat = lstatOrNull(dstDir);
    if (!stat) {
      console.log(`OK ${dir} (ausente)`);
      continue;
    }
    if (!stat.isSymbolicLink()) {
      console.log(`KEEP ${dir} (directorio real, no es enlace)`);
      continue;
    }
    fs.unlinkSync(dstDir);
    console.log(`UNLINK ${dir}`);
  }
}

try {
  const { action, worktree, root } = parseArgs(process.argv.slice(2));
  const sharedDirs = loadSharedDirs(root);
  if (action === "link") {
    linkSharedDirs(root, worktree, sharedDirs);
  } else {
    unlinkSharedDirs(root, worktree, sharedDirs);
  }
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
