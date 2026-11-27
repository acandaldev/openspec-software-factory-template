#!/usr/bin/env node
// Mantiene sincronizados los índices con sus fuentes:
//   - docs/index.md  ← frontmatter de docs/**/*.md
//   - MEMORY.md      ← columnas "hechas/total" de la tabla de avance, contadas en
//                      openspec/changes/*/tasks.md
//
//   node scripts/docs-sync.mjs           corrige lo que esté desfasado
//   node scripts/docs-sync.mjs --check   solo valida; falla si algo no cuadra
//   node scripts/docs-sync.mjs --estado  tabla determinista de estado y siguiente comando
//
// Reglas:
// - Todo .md bajo docs/ lleva frontmatter con `type` (excepto index.md y los
//   directorios excluidos, que se indexan como carpeta).
// - `stale_after` es opcional; si existe y ya pasó, el documento está caducado.
// - En MEMORY.md solo se reescriben los números `hechas/total` de las filas que
//   casan con un cambio de openspec. No se toca nada más del fichero.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(ROOT, "harness.config.json");

const DEFAULT_DOCS_CONFIG = {
  dir: "docs",
  indexFile: "docs/index.md",
  memoryFile: "MEMORY.md",
  agentsFile: "AGENTS.md",
  changesDir: "openspec/changes",
  mainBranch: "main",
  excludedDirs: {},
  limits: {
    maxResultChars: 240,
    memoryMaxLines: 85,
    agentsMaxLines: 125,
  },
  mutationMarkerPattern: "\\b(Mutaci[oó]n temporal|TODO:\\s*revertir)\\b",
};

async function loadDocsConfig() {
  const raw = await readFile(CONFIG_PATH, "utf8").catch((err) => {
    if (err?.code === "ENOENT") return null;
    throw err;
  });
  if (raw === null) return DEFAULT_DOCS_CONFIG;
  const parsed = JSON.parse(raw);
  const docs = parsed?.docs ?? {};
  return {
    ...DEFAULT_DOCS_CONFIG,
    ...docs,
    excludedDirs: docs.excludedDirs ?? DEFAULT_DOCS_CONFIG.excludedDirs,
    limits: {
      ...DEFAULT_DOCS_CONFIG.limits,
      ...(docs.limits ?? {}),
    },
  };
}

const DOCS_CONFIG = await loadDocsConfig();
const DOCS = path.join(ROOT, DOCS_CONFIG.dir);
const INDEX = path.join(ROOT, DOCS_CONFIG.indexFile);
const MEMORY = path.join(ROOT, DOCS_CONFIG.memoryFile);
const AGENTS_FILE = path.join(ROOT, DOCS_CONFIG.agentsFile);
const CHANGES = path.join(ROOT, DOCS_CONFIG.changesDir);
const EXCLUDED_DIRS = DOCS_CONFIG.excludedDirs;

// ---------------------------------------------------------------- plan (vista ejecutable)
//   node scripts/docs-sync.mjs --plan <cambio>
// Imprime a stdout un JSON con las tareas de tasks.md (bloque, nivel, estado,
// dependencias) y las que están listas para empezar. No escribe nada.
// Dependencias: se declaran en la línea como `dep: 8.9a, 9.15`; sin declaración,
// cada tarea depende de la anterior de su bloque.

const TASK_LINE_RE = /^- \[( |x|X)\]\s+([0-9]+(?:\.[0-9]+)*[a-z]?)(?:\s+(.*))?$/;
const BLOCK_RE = /^##\s+(\d+)\.\s*(.+)$/;
const TASK_DEP_RE = /\bdep:\s*([0-9A-Za-z.\s,;]+)/i;
const TASK_LEVEL_RE = /\[(HARD|FAST)\]/;

function parseTaskPlan(text, change) {
  const blocks = [];
  const tasks = [];
  let block = null;
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const b = BLOCK_RE.exec(rawLine);
    if (b) {
      block = { numero: Number(b[1]), titulo: b[2].trim() };
      blocks.push(block);
      continue;
    }
    const m = TASK_LINE_RE.exec(rawLine);
    if (!m) continue;
    const [, mark, id, rest = ""] = m;
    const explicit = (TASK_DEP_RE.exec(rest)?.[1] ?? "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^[0-9]+(\.[0-9]+)*[a-z]?$/.test(s));
    const body = rest
      .split("— [Agente:")[0]
      .replace(TASK_DEP_RE, "")
      .replace(/\s+/g, " ")
      .trim();
    tasks.push({
      id,
      bloque: block ? block.numero : null,
      nivel: TASK_LEVEL_RE.exec(rest)?.[1] ?? "NORMAL",
      estado: mark.trim() === "" ? "pendiente" : "hecha",
      deps: explicit,
      texto: body.slice(0, 160),
    });
  }
  // Dependencia implícita: dentro de un bloque, la tarea anterior.
  for (let i = 1; i < tasks.length; i += 1) {
    const prev = tasks[i - 1];
    const cur = tasks[i];
    if (cur.bloque !== null && cur.bloque === prev.bloque && !cur.deps.includes(prev.id)) {
      cur.deps.push(prev.id);
    }
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const siguientes = tasks
    .filter((t) => t.estado === "pendiente" && t.deps.every((d) => byId.get(d)?.estado === "hecha"))
    .map((t) => ({ id: t.id, bloque: t.bloque, nivel: t.nivel }));
  return {
    cambio: change,
    fuente: `${DOCS_CONFIG.changesDir}/${change}/tasks.md`.replace(/\\/g, "/"),
    generadoPor: "scripts/docs-sync.mjs --plan",
    bloques: blocks,
    tareas: tasks,
    siguientes,
  };
}

function planProblems(plan) {
  const problems = [];
  const ids = new Set();
  for (const t of plan.tareas) {
    if (ids.has(t.id)) problems.push(`id repetido: ${t.id}`);
    ids.add(t.id);
    if (t.bloque === null) problems.push(`tarea fuera de un bloque "## N.": ${t.id}`);
  }
  const byId = new Map(plan.tareas.map((t) => [t.id, t]));
  for (const t of plan.tareas) {
    for (const d of t.deps) {
      if (!ids.has(d)) problems.push(`${t.id} depende de ${d}, que no existe`);
    }
  }
  const state = new Map(plan.tareas.map((t) => [t.id, 0]));
  const visit = (id, trail) => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      problems.push(`ciclo de dependencias: ${[...trail, id].join(" > ")}`);
      return;
    }
    state.set(id, 1);
    for (const d of byId.get(id)?.deps ?? []) {
      if (byId.has(d)) visit(d, [...trail, id]);
    }
    state.set(id, 2);
  };
  for (const t of plan.tareas) visit(t.id, []);
  return [...new Set(problems)];
}

// ---------------------------------------------------------------- estado (vista determinista)
//   node scripts/docs-sync.mjs --estado
// Tabla fija por cambio activo y una única línea `COMANDO:`. No escribe nada.
// Solo lee tasks.md, MEMORY.md, git y gh; un bloqueo deja el comando en `—`.

function runCommand(command, args, allowStatus = [0]) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status === null) return null;
  if (!allowStatus.includes(result.status)) return null;
  return (result.stdout ?? "").trim();
}

function gitOutput(args) {
  return runCommand("git", args);
}

function ghOutput(args) {
  return runCommand("gh", args);
}

function memoryOrder(text) {
  const order = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (m) order.push(m[1]);
  }
  return order;
}

function sortChanges(changes, order) {
  return [...changes].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function laneFor(change, branches) {
  const lanes = branches
    .filter((branch) =>
      branch === `feat/${change}` ||
      branch.startsWith(`feat/${change}-`) ||
      branch === `paralelo/${change}` ||
      branch.startsWith(`paralelo/${change}-`))
    .sort((a, b) => {
      const na = Number(a.match(/-(\d+)$/)?.[1] ?? 0);
      const nb = Number(b.match(/-(\d+)$/)?.[1] ?? 0);
      return na - nb || a.localeCompare(b);
    });
  return lanes[0] ?? null;
}

function worktreePaths() {
  const out = gitOutput(["worktree", "list", "--porcelain"]);
  const map = new Map();
  if (out === null) return map;
  let current = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) current = line.slice("worktree ".length).trim();
    else if (line.startsWith("branch ") && current) {
      const branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      map.set(branch, current);
    }
  }
  return map;
}

function openPullRequests() {
  const out = ghOutput(["pr", "list", "--state", "open", "--limit", "100", "--json", "number,headRefName"]);
  if (out === null) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function pullRequestFor(lane, prs) {
  if (!lane || !prs) return null;
  return prs
    .filter((pr) => pr.headRefName === lane)
    .sort((a, b) => a.number - b.number)[0] ?? null;
}

function ciState(prNumber) {
  const out = ghOutput(["pr", "view", String(prNumber), "--json", "statusCheckRollup"]);
  if (out === null) return "?";
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    return "?";
  }
  const checks = data.statusCheckRollup;
  if (!Array.isArray(checks) || checks.length === 0) return "—";
  const failed = new Set(["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
  const pending = new Set(["QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "EXPECTED", "REQUESTED"]);
  const states = checks.map((check) => String(check.conclusion ?? check.state ?? check.status ?? "").toUpperCase());
  if (states.some((state) => failed.has(state))) return "rojo";
  if (states.some((state) => pending.has(state))) return "en curso";
  if (states.every((state) => ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state))) return "verde";
  return "?";
}

function laneDirty(lane, worktrees) {
  const dir = lane ? worktrees.get(lane) : null;
  if (!dir) return null;
  const out = gitOutput(["-C", dir, "status", "--porcelain"]);
  return out === null ? null : out.length > 0;
}

function planSummary(plan) {
  const done = plan.tareas.filter((task) => task.estado === "hecha").length;
  const total = plan.tareas.length;
  const pending = plan.tareas.filter((task) => task.estado === "pendiente");
  const block = pending.length > 0
    ? Math.min(...pending.map((task) => task.bloque).filter(Number.isFinite))
    : Math.max(...plan.bloques.map((b) => b.numero).filter(Number.isFinite));
  return { done, total, block: Number.isFinite(block) ? String(block) : "—" };
}

function rowCommand(row, plan) {
  if (row.estado === "completo") return `/opsx-archive ${row.change}`;
  if (row.estado !== "listo") return "—";
  const next = plan.siguientes[0];
  if (!next) return "—";
  if (next.nivel === "HARD") return `/implementar ${row.change} ${next.id}`;
  return `/coordinar ${row.change} ${next.bloque}`;
}

function formatEstado(rows, command) {
  const header = "| CAMBIO | TAREAS | BLOQUE | CARRIL | PR | CI | ESTADO | MOTIVO |";
  const separator = "|---|---|---|---|---|---|---|---|";
  const body = rows.length > 0
    ? rows.map((row) => {
        const tasks = row.total === 0 ? "—" : `${row.done}/${row.total}`;
        const lane = row.lane ? `\`${row.lane}\`` : "—";
        const pr = row.pr ? `#${row.pr}` : row.prUnknown ? "?" : "—";
        return `| \`${row.change}\` | ${tasks} | ${row.block} | ${lane} | ${pr} | ${row.ci} | ${row.estado} | ${row.motivo} |`;
      })
    : ["| — | — | — | — | — | — | — | — |"];
  return `${header}\n${separator}\n${body.join("\n")}\nCOMANDO: ${command}\n`;
}

async function buildEstado() {
  const entries = await readdir(CHANGES, { withFileTypes: true });
  const memory = await readFile(MEMORY, "utf8").catch(() => "");
  const order = memoryOrder(memory);
  const changes = sortChanges(
    entries.filter((entry) => entry.isDirectory() && entry.name !== "archive").map((entry) => entry.name),
    order,
  );
  const branches = (gitOutput(["branch", "--format=%(refname:short)"]) ?? "")
    .split("\n")
    .filter(Boolean);
  const worktrees = worktreePaths();
  const lanes = changes.map((change) => laneFor(change, branches)).filter(Boolean);
  const prs = lanes.length > 0 ? openPullRequests() : [];
  const rows = [];
  for (const change of changes) {
    const raw = await readFile(path.join(CHANGES, change, "tasks.md"), "utf8").catch(() => null);
    if (raw === null) continue;
    const plan = parseTaskPlan(raw, change);
    const { done, total, block } = planSummary(plan);
    const lane = laneFor(change, branches);
    const pr = pullRequestFor(lane, prs);
    const ci = pr ? ciState(pr.number) : lane && prs === null ? "?" : "—";
    const dirty = laneDirty(lane, worktrees);
    let estado = "listo";
    let motivo = "—";
    if (ci === "rojo" || dirty === true) {
      estado = "bloqueado";
      motivo = ci === "rojo" ? "CI rojo" : "árbol sucio";
    } else if (ci === "en curso") {
      estado = "esperando";
      motivo = "CI en curso";
    } else if (total > 0 && done === total) {
      estado = "completo";
    } else if (plan.siguientes.length === 0) {
      estado = "aparcado";
      motivo = "sin tarea lista";
    }
    const row = {
      change,
      done,
      total,
      block,
      lane,
      pr: pr?.number ?? null,
      prUnknown: lane !== null && prs === null,
      ci,
      estado,
      motivo,
    };
    row.command = rowCommand(row, plan);
    rows.push(row);
  }
  const command = rows.find((row) => row.command !== "—")?.command ??
    (rows.length === 0 ? '/opsx-propose "<descripción>"' : "—");
  return { rows, command };
}

const estadoFlag = process.argv.indexOf("--estado");
if (estadoFlag !== -1) {
  const { rows, command } = await buildEstado();
  process.stdout.write(formatEstado(rows, command), () => process.exit(0));
}

const planFlag = process.argv.indexOf("--plan");
if (planFlag !== -1) {
  const change = process.argv[planFlag + 1];
  if (!change) {
    console.error("uso: node scripts/docs-sync.mjs --plan <cambio>");
    process.exit(2);
  }
  const file = path.join(CHANGES, change, "tasks.md");
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    console.error(`no existe ${file}`);
    process.exit(2);
  }
  const plan = parseTaskPlan(raw, change);
  const problems = planProblems(plan);
  if (problems.length > 0) {
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`, () => process.exit(0));
}

const checkOnly = process.argv.includes("--check");
const errors = [];
const warnings = [];

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { data: null, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { data: null, body: text };
  const data = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim());
    if (m) data[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: text.slice(end + 4) };
}

function titleOf(rel, data, body) {
  if (data?.title) return data.title;
  const h1 = /^#\s+(.+)$/m.exec(body);
  return h1 ? h1[1].trim() : path.basename(rel, ".md");
}

async function walk(dir, rel = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!rel && EXCLUDED_DIRS[entry.name]) continue;
      out.push(...(await walk(path.join(dir, entry.name), relPath)));
    } else if (entry.name.endsWith(".md") && relPath !== "index.md") {
      out.push(relPath);
    }
  }
  return out;
}

const cell = (v) => String(v ?? "—").replace(/\|/g, "\\|");
const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

// ---------------------------------------------------------------- docs/index.md

const today = new Date().toISOString().slice(0, 10);
const rows = [];

for (const rel of (await walk(DOCS)).sort()) {
  // En Windows (`core.autocrlf=true`) el fichero llega con CRLF; el frontmatter
  // y los tamaños se calculan siempre sobre LF para que el resultado coincida
  // con el de CI.
  const text = (await readFile(path.join(DOCS, rel), "utf8")).replace(/\r\n/g, "\n");
  const { data, body } = parseFrontmatter(text);

  if (!data) errors.push(`${rel}: falta frontmatter (añade al menos "type:")`);
  else if (!data.type) errors.push(`${rel}: el frontmatter no tiene "type"`);

  if (data?.stale_after) {
    const when = new Date(data.stale_after);
    if (Number.isNaN(when.getTime())) {
      errors.push(`${rel}: "stale_after" no es una fecha ISO 8601 válida (${data.stale_after})`);
    } else if (when.toISOString().slice(0, 10) <= today) {
      errors.push(`${rel}: caducado (stale_after ${data.stale_after}). Revísalo o pásalo a "status: draft"`);
    }
  }

  rows.push({
    link: rel,
    title: titleOf(rel, data, body),
    type: data?.type,
    hint: data?.hint,
    status: data?.status ?? (data ? "stable" : "sin frontmatter"),
    stale: data?.stale_after,
    size: kb(Buffer.byteLength(text, "utf8")),
  });
}

const excludedEntries = Object.entries(EXCLUDED_DIRS);
const indexText = [
  "<!-- generado por scripts/docs-sync.mjs; no editar a mano -->",
  "",
  "# Índice de documentación",
  "",
  "Mapa de `docs/`. Abre el documento y solo la sección que toque.",
  "",
  "| Documento | Tipo | Secciones | Estado | Revisar antes de | Tamaño |",
  "|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| [${cell(r.title)}](${r.link}) | ${cell(r.type)} | ${cell(r.hint)} | ${cell(r.status)} | ${cell(r.stale)} | ${cell(r.size)} |`,
  ),
  ...(excludedEntries.length > 0
    ? [
        "",
        "## Carpetas",
        "",
        ...excludedEntries.map(([name, note]) => `- \`${name}/\` — ${note}.`),
      ]
    : []),
  "",
].join("\n");

if (checkOnly) {
  const current = (await readFile(INDEX, "utf8").catch(() => "")).replace(/\r\n/g, "\n");
  if (current !== indexText) {
    errors.push("docs/index.md está desfasado: ejecuta `node scripts/docs-sync.mjs`");
  }
} else {
  await writeFile(INDEX, indexText, "utf8");
  console.log(`docs/index.md regenerado (${rows.length} documentos)`);
}

// ------------------------------------------------------------- tasks.md (compactación y candados)

const MAX_RESULT_CHARS = DOCS_CONFIG.limits.maxResultChars;
const MUTATION_MARKER_RE = new RegExp(DOCS_CONFIG.mutationMarkerPattern, "i");

function summarizeResultText(rawResult, taskId) {
  const clean = rawResult.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_RESULT_CHARS) return clean;

  const sinTestMatch = /\bsin test:\s*[^.;—]+/i.exec(clean);
  const sinTestPart = sinTestMatch ? `${sinTestMatch[0].trim()}; ` : "";

  const budget = Math.max(80, 165 - sinTestPart.length);
  let snippet = clean.slice(0, budget);
  const lastSep = Math.max(snippet.lastIndexOf("; "), snippet.lastIndexOf(". "), snippet.lastIndexOf(", "));
  if (lastSep >= 60) {
    snippet = snippet.slice(0, lastSep);
  } else {
    const lastSpace = snippet.lastIndexOf(" ");
    if (lastSpace >= 50) snippet = snippet.slice(0, lastSpace);
  }
  snippet = snippet.replace(/[.,;:\s]+$/, "");

  return `${sinTestPart}${snippet}… (detalle en tasks-history.md#${taskId})`;
}

function compactTaskLine(line) {
  const taskMatch = /^(- \[[ xX]\]\s+([0-9]+\.[0-9]+[a-z0-9]*)\b.*)$/.exec(line);
  if (!taskMatch) return { line, archived: null };

  const taskId = taskMatch[2];
  const firstTraceIdx = line.search(/ — (?:\[Agente:|Resultado:|Delta\b)/);
  if (firstTraceIdx === -1) return { line, archived: null };

  let statement = line.slice(0, firstTraceIdx);
  let traceTail = line.slice(firstTraceIdx);

  // Si la tarea está reabierta con "— Pendiente de la revisión: ...", se conserva íntegro al final.
  let pendingReviewSuffix = "";
  const pendingMatch = /( — Pendiente de la revisión:\s*.+)$/.exec(traceTail);
  if (pendingMatch) {
    pendingReviewSuffix = pendingMatch[1];
    traceTail = traceTail.slice(0, traceTail.length - pendingReviewSuffix.length);
  }

  // Si ya está compactada y por debajo del límite, no se vuelve a archivar.
  const alreadyRef = traceTail.includes(`(detalle en tasks-history.md#${taskId})`);
  if (alreadyRef && traceTail.length <= MAX_RESULT_CHARS + 180) {
    return { line, archived: null };
  }

  if (traceTail.length <= MAX_RESULT_CHARS + 120) {
    return { line, archived: null };
  }

  // Extraemos todos los "[Agente: ...]" (primera pasada y deltas) para conservar la trazabilidad de modelos.
  const agentMatches = [...traceTail.matchAll(/\[Agente:\s*[^\]]+\]/g)].map((m) => m[0]);
  const firstResultMatch = / — Resultado:\s*(.+)$/.exec(traceTail);
  if (!firstResultMatch) {
    return { line, archived: null };
  }

  const rawResultFull = firstResultMatch[1];
  const shortResult = summarizeResultText(rawResultFull, taskId);
  const agentsSegment = agentMatches.length > 0 ? ` — ${agentMatches.join(" + ")}` : "";
  const compactedLine = `${statement}${agentsSegment} — Resultado: ${shortResult}${pendingReviewSuffix}`;

  if (compactedLine.length >= line.length) {
    return { line, archived: null };
  }

  return {
    line: compactedLine,
    archived: {
      taskId,
      fullTrace: traceTail.replace(/^ — /, "").trim(),
    },
  };
}

const NOTES_HEADING = "## Notas de revisión archivadas";
// Encabezado de sección archivable: es el formato que escribe `renderHistoryFile`.
const ARCHIVABLE_HEADER_RE = /^### [0-9]+\.[0-9]+[a-z0-9]*$/gm;

// Separa la parte de tareas de las notas de revisión. El `## Notas...` cierra la
// última sección: no forma parte de ningún cuerpo.
function splitHistoryParts(historyText) {
  const marker = `\n${NOTES_HEADING}\n`;
  const idx = historyText.indexOf(marker);
  if (idx === -1) return { tasksPart: historyText, reviewNotes: "" };
  return {
    tasksPart: historyText.slice(0, idx),
    reviewNotes: historyText.slice(idx + marker.length).trim(),
  };
}

function countArchivableHeaders(tasksPart) {
  return (tasksPart.match(ARCHIVABLE_HEADER_RE) ?? []).length;
}

function parseHistoryEntries(historyText) {
  const entries = new Map();
  if (!historyText) return { entries, reviewNotes: "" };
  const { tasksPart, reviewNotes } = splitHistoryParts(historyText);

  // El cuerpo acaba solo en el siguiente encabezado archivable (`### <id>`), en
  // `## Notas de revisión archivadas` (ya recortado en `tasksPart`) o al final del
  // fichero. Cualquier otro `## ` o `### ` dentro del cuerpo es texto del cuerpo y
  // no debe truncarlo: truncar aquí se persiste en la reescritura.
  const regex =
    /^### ([0-9]+\.[0-9]+[a-z0-9]*)\n([\s\S]*?)(?=\n### [0-9]+\.[0-9]+[a-z0-9]*(?:\n|(?![\s\S]))|(?![\s\S]))/gm;
  let m;
  while ((m = regex.exec(tasksPart)) !== null) {
    entries.set(m[1], m[2].trim());
  }
  return { entries, reviewNotes };
}

// Salvaguarda: si el parser reconoce menos secciones que encabezados archivables
// hay en el fichero, la reescritura perdería historial. Devuelve el motivo o null.
function historyCoverageError(historyText, entries) {
  const { tasksPart } = splitHistoryParts(historyText);
  const headers = countArchivableHeaders(tasksPart);
  if (entries.size >= headers) return null;
  return `el parser solo reconoció ${entries.size} de ${headers} sección(es) archivables; se aborta sin escribir para no perder historial`;
}

function renderHistoryFile(changeName, entries, reviewNotes) {
  const lines = [
    "<!-- generado/actualizado por scripts/docs-sync.mjs; archivo histórico fuera del contexto por defecto -->",
    "",
    `# Historial detallado de tareas (\`${changeName}\`)`,
    "",
    "Este archivo conserva las crónicas completas (`Resultado`, deltas y notas extensas de revisión) extraídas de `tasks.md` para mantener ligero el contexto de los agentes.",
    "",
  ];
  for (const [taskId, text] of entries) {
    lines.push(`### ${taskId}`, "", text, "");
  }
  if (reviewNotes) {
    lines.push("## Notas de revisión archivadas", "", reviewNotes.trim(), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

async function syncAndValidateTasks() {
  for (const entry of (await readdir(CHANGES, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    const changeName = entry.name;
    const tasksPath = path.join(CHANGES, changeName, "tasks.md");
    const historyPath = path.join(CHANGES, changeName, "tasks-history.md");
    const rawTasks = await readFile(tasksPath, "utf8").catch(() => null);
    if (rawTasks === null) continue;

    const tasksText = rawTasks.replace(/\r\n/g, "\n");
    const existingHistory = (await readFile(historyPath, "utf8").catch(() => "")).replace(/\r\n/g, "\n");
    const { entries: historyEntries, reviewNotes: existingReviewNotes } = parseHistoryEntries(existingHistory);
    if (existingHistory) {
      const coverageError = historyCoverageError(existingHistory, historyEntries);
      if (coverageError) {
        errors.push(`openspec/changes/${changeName}/tasks-history.md: ${coverageError}`);
        continue;
      }
    }

    const taskLines = tasksText.split("\n");
    const updatedLines = [];
    const archivedReviewBlocks = [];
    let compactedCount = 0;
    let inRevisiones = false;

    for (let i = 0; i < taskLines.length; i++) {
      const line = taskLines[i];
      if (MUTATION_MARKER_RE.test(line)) {
        errors.push(`openspec/changes/${changeName}/tasks.md:${i + 1}: contiene marcador de mutación sin limpiar`);
      }

      if (/^##\s+Revisiones\b/.test(line)) {
        inRevisiones = true;
        updatedLines.push(line);
        continue;
      }
      if (inRevisiones && /^##\s+/.test(line)) {
        inRevisiones = false;
      }

      // En ## Revisiones solo se conservan las filas de la tabla ("| ... |") y líneas en blanco simples;
      // las crónicas narrativas ("### ...", bullets, párrafos) se archivan en tasks-history.md.
      if (inRevisiones) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("|")) {
          // Evitar múltiples líneas en blanco seguidas dentro de la tabla de revisiones
          if (trimmed === "" && updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() === "") {
            continue;
          }
          updatedLines.push(line);
        } else {
          archivedReviewBlocks.push(line);
          compactedCount += 1;
        }
        continue;
      }

      const { line: newLine, archived } = compactTaskLine(line);
      updatedLines.push(newLine);
      if (archived) {
        compactedCount += 1;
        const prev = historyEntries.get(archived.taskId);
        if (!prev || archived.fullTrace.length >= prev.length) {
          historyEntries.set(archived.taskId, archived.fullTrace);
        } else if (!prev.includes(archived.fullTrace)) {
          historyEntries.set(archived.taskId, `${prev}\n\n${archived.fullTrace}`);
        }
      }
    }

    let mergedReviewNotes = existingReviewNotes;
    if (archivedReviewBlocks.length > 0) {
      const blockText = archivedReviewBlocks.join("\n").trim();
      if (!mergedReviewNotes) {
        mergedReviewNotes = blockText;
      } else if (!mergedReviewNotes.includes(blockText)) {
        mergedReviewNotes = `${mergedReviewNotes}\n\n${blockText}`;
      }
    }

    const newTasksText = `${updatedLines.join("\n").trimEnd()}\n`;
    if (checkOnly) {
      if (newTasksText !== tasksText) {
        // Aviso suave en --check: no rompe CI por longitud de trazas, pero avisa para ejecutar docs-sync.mjs
        warnings.push(
          `openspec/changes/${changeName}/tasks.md tiene ${compactedCount} traza(s)/nota(s) larga(s) que se pueden archivar ejecutando \`node scripts/docs-sync.mjs\``,
        );
      }
    } else if (newTasksText !== tasksText) {
      await writeFile(tasksPath, newTasksText, "utf8");
      if (historyEntries.size > 0 || mergedReviewNotes) {
        await writeFile(historyPath, renderHistoryFile(changeName, historyEntries, mergedReviewNotes), "utf8");
      }
      console.log(
        `openspec/changes/${changeName}/tasks.md: ${compactedCount} elemento(s) archivado(s) en tasks-history.md`,
      );
    }
  }
}

await syncAndValidateTasks();

// ------------------------------------------------------------- MEMORY.md (avance)

async function taskCounts() {
  const counts = new Map();
  for (const entry of await readdir(CHANGES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(CHANGES, entry.name, "tasks.md");
    const text = await readFile(file, "utf8").catch(() => null);
    if (text === null) continue;
    const done = text.split("\n").filter((l) => /^- \[[xX]\]/.test(l)).length;
    const total = text.split("\n").filter((l) => /^- \[[ xX]\]/.test(l)).length;
    counts.set(entry.name, { done, total });
  }
  return counts;
}

const counts = await taskCounts();
const memory = (await readFile(MEMORY, "utf8")).replace(/\r\n/g, "\n");
const rowRe = /^(\|\s*`)([^`]+)(`\s*\|\s*)(\d+)\/(\d+)(\s*\|.*)$/;
const seen = new Set();
let corrected = 0;

const isMainBranch =
  !process.env.GITHUB_REF_NAME || process.env.GITHUB_REF_NAME === DOCS_CONFIG.mainBranch;

const memoryText = memory
  .split("\n")
  .map((line) => {
    const m = rowRe.exec(line);
    if (!m) return line;
    const name = m[2];
    const real = counts.get(name);
    if (!real) {
      warnings.push(`MEMORY.md: la fila "${name}" no tiene tasks.md`);
      return line;
    }
    seen.add(name);
    if (`${m[4]}/${m[5]}` === `${real.done}/${real.total}`) return line;
    corrected += 1;
    const fixed = `${m[1]}${name}${m[3]}${real.done}/${real.total}${m[6]}`;
    if (checkOnly) {
      const msg = `MEMORY.md: "${name}" dice ${m[4]}/${m[5]} y tasks.md tiene ${real.done}/${real.total} (se actualiza al cerrar el bloque con \`node scripts/docs-sync.mjs\`)`;
      if (isMainBranch) errors.push(msg);
      else warnings.push(msg);
    }
    return fixed;
  })
  .join("\n");

for (const name of counts.keys()) {
  if (!seen.has(name)) warnings.push(`MEMORY.md: no hay fila para el cambio "${name}"`);
}

if (checkOnly) {
  if (memoryText !== memory && isMainBranch) {
    errors.push("MEMORY.md está desfasado en main: ejecuta `node scripts/docs-sync.mjs`");
  }
} else {
  if (memoryText !== memory) {
    await writeFile(MEMORY, memoryText, "utf8");
    console.log(`MEMORY.md: ${corrected} fila(s) corregida(s)`);
  } else {
    console.log("MEMORY.md: al día");
  }
}

// Avisos suaves de higiene de contexto (nunca rompen CI)
const memoryMaxLines = DOCS_CONFIG.limits.memoryMaxLines;
const memoryLineCount = memoryText.split("\n").length;
if (memoryLineCount > memoryMaxLines) {
  warnings.push(
    `MEMORY.md tiene ${memoryLineCount} líneas (orientación: ≤${memoryMaxLines} líneas para no cargar contexto de inicio)`,
  );
}
const agentsMaxLines = DOCS_CONFIG.limits.agentsMaxLines;
const agentsRaw = await readFile(AGENTS_FILE, "utf8").catch(() => "");
if (agentsRaw) {
  const agentsLineCount = agentsRaw.replace(/\r\n/g, "\n").split("\n").length;
  if (agentsLineCount > agentsMaxLines) {
    warnings.push(
      `AGENTS.md tiene ${agentsLineCount} líneas (orientación: ≤${agentsMaxLines} líneas)`,
    );
  }
}

// ------------------------------------------------------------------------ salida

for (const w of warnings) console.warn(`aviso: ${w}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} problema(s):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log("Documentación y memoria conformes.");
