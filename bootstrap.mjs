#!/usr/bin/env node
// Configura el template en el proyecto actual: pide los datos, sustituye los
// placeholders de AGENTS.md y de los agentes, escribe harness.config.json y
// valida documentación y secretos.
//
//   node bootstrap.mjs                 # interactivo
//   node bootstrap.mjs --yes --name "Acme Notes" --slug acme-notes ...
//   node bootstrap.mjs --help
//
// No copia ficheros: el template ya está en el proyecto. Si vienes de otro
// repositorio, copia el contenido del template antes de ejecutarlo.

import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const USAGE = `Uso:
  node bootstrap.mjs [opciones]

Opciones:
  --name <texto>              Nombre del proyecto
  --slug <texto>              Slug (por defecto, derivado del nombre)
  --description <texto>       Descripción corta
  --stack <texto>             Stack del proyecto
  --source-dirs <texto>       Directorios de código, separados por comas
  --build <comando>           Comando de build
  --test <comando>            Comando de tests
  --format <comando>          Comando de formato
  --implement-hard <modelo>   Modelo de implementación [HARD]
  --implement-normal <modelo> Modelo de implementación NORMAL
  --implement-fast <modelo>   Modelo de implementación [FAST]
  --review-hard <modelo>      Modelo de revisión [HARD]
  --review-normal <modelo>    Modelo de revisión NORMAL
  --review-fast <modelo>      Modelo de revisión [FAST]
  --review-copy-dir <ruta>    Directorio de copias de revisión
  --main-branch <rama>        Rama desplegable (por defecto, main)
  --yes                       No pide confirmación
  --force                     Sobrescribe harness.config.json si existe
  --help                      Muestra esta ayuda
`;

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Argumento no reconocido: ${arg}`);
    const key = arg.slice(2);
    if (key === "yes" || key === "force" || key === "help") {
      parsed[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Falta el valor de --${key}`);
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertNoPlaceholders(file, text) {
  const found = [...text.matchAll(/\{\{([\w.-]+)\}\}/g)].map((match) => match[1]);
  if (found.length > 0) {
    throw new Error(`Placeholder sin resolver en ${file}: ${[...new Set(found)].join(", ")}`);
  }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function runNode(label, args) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`\n[${label}] falló\n`);
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`[${label}] OK\n`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(USAGE);
    return;
  }

  const values = {
    name: flags.name ?? "",
    slug: flags.slug ?? "",
    description:
      flags.description ??
      "Proyecto gestionado con OpenSpec, subagentes, gates, traza y curador.",
    stack: flags.stack ?? "",
    sourceDirs: flags["source-dirs"] ?? "",
    build: flags.build ?? "",
    test: flags.test ?? "",
    format: flags.format ?? "",
    implementHard: flags["implement-hard"] ?? "",
    implementNormal: flags["implement-normal"] ?? "",
    implementFast: flags["implement-fast"] ?? "",
    reviewHard: flags["review-hard"] ?? "",
    reviewNormal: flags["review-normal"] ?? "",
    reviewFast: flags["review-fast"] ?? "",
    reviewCopyDir: flags["review-copy-dir"] ?? ".review",
    mainBranch: flags["main-branch"] ?? "main",
  };

  const required = [
    ["name", "Nombre del proyecto"],
    ["stack", "Stack del proyecto"],
    ["sourceDirs", "Directorios de código"],
    ["build", "Comando de build"],
    ["test", "Comando de tests"],
    ["format", "Comando de formato"],
    ["implementHard", "Modelo de implementación [HARD]"],
    ["implementNormal", "Modelo de implementación NORMAL"],
    ["implementFast", "Modelo de implementación [FAST]"],
    ["reviewHard", "Modelo de revisión [HARD]"],
    ["reviewNormal", "Modelo de revisión NORMAL"],
    ["reviewFast", "Modelo de revisión [FAST]"],
  ];

  const missing = required.filter(([key]) => !values[key]);
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if (missing.length > 0 && (!interactive || flags.yes)) {
    throw new Error(
      `Faltan valores: ${missing.map(([, label]) => label).join(", ")}. Usa --help para ver las opciones.`,
    );
  }

  if (interactive && !flags.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const [key, label] of required) {
        if (!values[key]) {
          const answer = (await rl.question(`${label}: `)).trim();
          if (!answer) throw new Error(`El campo "${label}" es obligatorio.`);
          values[key] = answer;
        }
      }

      // Opcionales: se muestran con su valor por defecto; Enter lo conserva.
      values.slug = values.slug || slugify(values.name);
      const optional = [
        ["slug", `Slug [${values.slug}]`],
        ["description", `Descripción [${values.description}]`],
        ["reviewCopyDir", `Directorio de copias de revisión [${values.reviewCopyDir}]`],
        ["mainBranch", `Rama principal [${values.mainBranch}]`],
      ];
      for (const [key, label] of optional) {
        const answer = (await rl.question(`${label}: `)).trim();
        if (answer) values[key] = answer;
      }
    } finally {
      rl.close();
    }
  }

  values.slug = values.slug || slugify(values.name);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(values.slug)) {
    throw new Error(`Slug no válido: "${values.slug}". Usa minúsculas, números y guiones.`);
  }

  const configPath = path.join(ROOT, "harness.config.json");
  if ((await exists(configPath)) && !flags.force) {
    throw new Error(
      "harness.config.json ya existe. Revisa la configuración o usa --force para sobrescribirla.",
    );
  }

  const replacements = {
    projectName: values.name,
    projectSlug: values.slug,
    projectDescription: values.description,
    stackDescription: values.stack,
    sourceDirs: values.sourceDirs,
    buildCommand: values.build,
    testCommand: values.test,
    formatCommand: values.format,
    modelImplementHard: values.implementHard,
    modelImplementNormal: values.implementNormal,
    modelImplementFast: values.implementFast,
    modelReviewHard: values.reviewHard,
    modelReviewNormal: values.reviewNormal,
    modelReviewFast: values.reviewFast,
    reviewCopyDir: values.reviewCopyDir,
    mainBranch: values.mainBranch,
  };

  process.stdout.write("\nConfiguración:\n");
  for (const [key, value] of Object.entries(replacements)) {
    process.stdout.write(`  ${key}: ${value}\n`);
  }

  if (!flags.yes && !interactive) {
    throw new Error("Entorno no interactivo: añade --yes para aplicar los cambios.");
  }

  if (!flags.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question("\n¿Aplicar estos cambios? [y/N]: ")).trim().toLowerCase();
      if (answer !== "y" && answer !== "sí" && answer !== "si") {
        process.stdout.write("Cancelado.\n");
        return;
      }
    } finally {
      rl.close();
    }
  }

  const files = [
    "AGENTS.md",
    ".opencode/agents/implementer.md",
    ".opencode/agents/reviewer.md",
    ".opencode/agents/openspec-reviewer.md",
    ".opencode/commands/revisar.md",
    "MEMORY.md",
    "docs/harness.md",
  ];

  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!(await exists(full))) continue;
    let text = await readFile(full, "utf8");
    for (const [key, value] of Object.entries(replacements)) {
      text = text.replaceAll(`{{${key}}}`, value);
    }
    assertNoPlaceholders(file, text);
    await writeFile(full, text, "utf8");
  }

  const config = {
    project: { slug: values.slug, displayName: values.name },
    stack: {
      description: values.stack,
      sourceDirs: values.sourceDirs,
      buildCommand: values.build,
      testCommand: values.test,
      formatCommand: values.format,
    },
    models: {
      implementHard: values.implementHard,
      implementNormal: values.implementNormal,
      implementFast: values.implementFast,
      reviewHard: values.reviewHard,
      reviewNormal: values.reviewNormal,
      reviewFast: values.reviewFast,
    },
    reviewCopyDir: values.reviewCopyDir,
    docs: {
      dir: "docs",
      indexFile: "docs/index.md",
      memoryFile: "MEMORY.md",
      agentsFile: "AGENTS.md",
      changesDir: "openspec/changes",
      mainBranch: values.mainBranch,
      excludedDirs: {},
      limits: {
        maxResultChars: 240,
        memoryMaxLines: 85,
        agentsMaxLines: 125,
      },
      mutationMarkerPattern: "\\b(Mutaci[oó]n temporal|TODO:\\s*revertir)\\b",
    },
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  await mkdir(path.join(ROOT, "openspec", "changes"), { recursive: true });
  await mkdir(path.join(ROOT, "openspec", "specs"), { recursive: true });
  await mkdir(path.join(ROOT, "docs"), { recursive: true });

  await runNode("docs-sync", ["scripts/docs-sync.mjs"]);
  await runNode("docs-sync --check", ["scripts/docs-sync.mjs", "--check"]);
  await runNode("check-secrets", ["scripts/check-secrets.mjs"]);

  process.stdout.write(`
Listo. Siguientes pasos:
1. Revisa AGENTS.md y .opencode/agents/*.md.
2. Si el proyecto aún no usa OpenSpec: openspec init.
3. Crea el primer cambio con /opsx-propose <cambio>.
4. Implementa con /implementar, revisa con /revisar, encadena con /coordinar y cura con /curar.
`);
}

main().catch((error) => {
  process.stderr.write(`\nError: ${error.message}\n`);
  process.exit(1);
});
