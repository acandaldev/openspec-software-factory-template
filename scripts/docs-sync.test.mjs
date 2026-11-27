// Regresión del archivado de trazas en tasks-history.md. El script se ejecuta como
// proceso hijo sobre un proyecto mínimo en un directorio temporal: docs-sync.mjs es
// un script con efectos al importarse, así que no se puede cargar como módulo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "docs-sync.mjs");
const CHANGE = "cambio-prueba";

const LONG_RESULT = `texto de resultado muy largo ${"que se repite ".repeat(40)}`.trim();

const TASKS_MD = `# Tareas

- [x] 9.9 Tarea con traza larga — [Agente: Test/Modelo (high) | Coste: ~1k tok] — Resultado: ${LONG_RESULT}
`;

// Formato canónico que escribe `renderHistoryFile`. El cuerpo de 1.1 contiene un
// `## Otra sección` que no debe truncarlo.
const CANONICAL_HISTORY = `<!-- generado/actualizado por scripts/docs-sync.mjs; archivo histórico fuera del contexto por defecto -->

# Historial detallado de tareas (\`${CHANGE}\`)

Este archivo conserva las crónicas completas (\`Resultado\`, deltas y notas extensas de revisión) extraídas de \`tasks.md\` para mantener ligero el contexto de los agentes.

### 1.1

cuerpo de la tarea 1.1

## Otra sección

contenido que debe seguir ahí

### 1.2

cuerpo de la tarea 1.2

## Notas de revisión archivadas

nota archivada de revisión
`;

const DUPLICATED_HISTORY = `### 1.1

primera sección

### 1.1

segunda sección con el mismo id
`;

async function makeProject(history) {
  const root = await mkdtemp(path.join(tmpdir(), "docs-sync-test-"));
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  const changeDir = path.join(root, "openspec", "changes", CHANGE);
  await mkdir(changeDir, { recursive: true });

  await cp(SCRIPT, path.join(root, "scripts", "docs-sync.mjs"));
  await writeFile(
    path.join(root, "docs", "guia.md"),
    "---\ntype: guia\n---\n\n# Guía\n",
    "utf8",
  );
  await writeFile(path.join(root, "MEMORY.md"), "# Memoria\n", "utf8");
  await writeFile(path.join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(path.join(changeDir, "tasks.md"), TASKS_MD, "utf8");
  await writeFile(path.join(changeDir, "tasks-history.md"), history, "utf8");
  return {
    root,
    tasks: path.join(changeDir, "tasks.md"),
    history: path.join(changeDir, "tasks-history.md"),
  };
}

function runSync(root) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "docs-sync.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
}

test("render → parse → render es byte a byte idéntico", async () => {
  const project = await makeProject(CANONICAL_HISTORY);
  assert.equal(runSync(project.root).status, 0);
  const first = await readFile(project.history, "utf8");

  // Segundo pase con el mismo estado de tasks.md que en el primero: la traza ya
  // archivada se vuelve a parsear y reescribir, y el resultado no debe cambiar.
  await writeFile(project.tasks, TASKS_MD, "utf8");
  assert.equal(runSync(project.root).status, 0);
  const second = await readFile(project.history, "utf8");

  assert.equal(second, first);
  assert.ok(first.includes("### 9.9"), "la traza nueva se archiva");
});

test("un cuerpo con '## Otra sección' no se trunca", async () => {
  const project = await makeProject(CANONICAL_HISTORY);
  assert.equal(runSync(project.root).status, 0);
  const history = await readFile(project.history, "utf8");

  assert.ok(history.includes("## Otra sección"), "conserva el encabezado del cuerpo");
  assert.ok(history.includes("contenido que debe seguir ahí"), "conserva el texto posterior");
  assert.ok(history.includes("cuerpo de la tarea 1.2"), "conserva la sección siguiente");
  assert.ok(history.includes("nota archivada de revisión"), "conserva las notas de revisión");
});

test("aborta sin escribir si hay menos secciones parseadas que encabezados", async () => {
  const project = await makeProject(DUPLICATED_HISTORY);
  const result = runSync(project.root);

  assert.equal(result.status, 1, "el script falla en lugar de escribir a ciegas");
  assert.match(result.stderr, /aborta sin escribir/);
  assert.equal(await readFile(project.history, "utf8"), DUPLICATED_HISTORY);
  assert.equal(await readFile(project.tasks, "utf8"), TASKS_MD);
});

test("ejecutar dos veces es idempotente", async () => {
  const project = await makeProject(CANONICAL_HISTORY);
  assert.equal(runSync(project.root).status, 0);
  const historyOnce = await readFile(project.history, "utf8");
  const tasksOnce = await readFile(project.tasks, "utf8");

  assert.equal(runSync(project.root).status, 0);
  assert.equal(await readFile(project.history, "utf8"), historyOnce);
  assert.equal(await readFile(project.tasks, "utf8"), tasksOnce);
});

test("lee excludedDirs y límites desde harness.config.json", async () => {
  const project = await makeProject(CANONICAL_HISTORY);
  await mkdir(path.join(project.root, "docs", "privado"), { recursive: true });
  await writeFile(
    path.join(project.root, "docs", "privado", "sin-frontmatter.md"),
    "# Sin frontmatter pero excluido\n",
    "utf8",
  );
  await writeFile(
    path.join(project.root, "harness.config.json"),
    JSON.stringify({
      docs: {
        excludedDirs: { privado: "carpeta de prueba excluida" },
        limits: { memoryMaxLines: 1 },
      },
    }),
    "utf8",
  );
  await writeFile(path.join(project.root, "MEMORY.md"), "# Memoria\n\nlínea extra\n", "utf8");

  const result = runSync(project.root);
  assert.equal(result.status, 0);
  const index = await readFile(path.join(project.root, "docs", "index.md"), "utf8");
  assert.ok(index.includes("- `privado/` — carpeta de prueba excluida."));
  assert.ok(!index.includes("sin-frontmatter.md"));
  assert.match(result.stderr, /orientación: ≤1 líneas/);
});

// ------------------------------------------------------------------ --plan

const PLAN_TASKS = `# Tareas

## 1. Fundamentos

- [x] 1.1 Base
- [x] 1.2 Encima de 1.1

## 2. Datos

- [ ] 2.1 Primera del bloque
- [ ] 2.2 dep: 1.2
- [ ] 2.3
`;

function runPlan(root, change = CHANGE) {
  return spawnSync(
    process.execPath,
    [path.join(root, "scripts", "docs-sync.mjs"), "--plan", change],
    { cwd: root, encoding: "utf8" },
  );
}

test("--plan emite tareas, dependencias y las siguientes", async () => {
  const project = await makeProject(CANONICAL_HISTORY);
  await writeFile(project.tasks, PLAN_TASKS, "utf8");

  const result = runPlan(project.root);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);

  assert.equal(plan.cambio, CHANGE);
  assert.equal(plan.tareas.length, 5);
  assert.equal(plan.bloques.length, 2);

  const byId = new Map(plan.tareas.map((t) => [t.id, t]));
  assert.equal(byId.get("1.2").bloque, 1);
  assert.equal(byId.get("1.2").estado, "hecha");
  assert.deepEqual(byId.get("1.2").deps, ["1.1"], "dependencia implícita del bloque");
  assert.deepEqual(byId.get("2.2").deps, ["1.2", "2.1"], "explícita + implícita");
  assert.deepEqual(
    plan.siguientes.map((t) => t.id),
    ["2.1"],
    "solo la primera pendiente del bloque está lista",
  );
});

test("--plan falla con un ciclo o con una dependencia inexistente", async () => {
  const project = await makeProject(CANONICAL_HISTORY);
  await writeFile(
    project.tasks,
    "# Tareas\n\n## 1. A\n\n- [ ] 1.1 dep: 1.2\n- [ ] 1.2 dep: 1.1\n",
    "utf8",
  );
  const cycle = runPlan(project.root);
  assert.equal(cycle.status, 1);
  assert.match(cycle.stderr, /ciclo/);

  await writeFile(project.tasks, "# Tareas\n\n## 1. A\n\n- [ ] 1.1 dep: 9.9\n", "utf8");
  const missing = runPlan(project.root);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no existe/);
});

// ------------------------------------------------------------------ --estado

const ESTADO_MEMORY = `# Memoria

| Cambio | Hechas/Total | Estado |
|---|---|---|
| \`completo\` | 2/2 | cerrado |
| \`pendiente\` | 1/3 | en curso |
`;

async function makeEstadoProject() {
  const root = await mkdtemp(path.join(tmpdir(), "docs-sync-estado-"));
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await mkdir(path.join(root, "openspec", "changes", "completo"), { recursive: true });
  await mkdir(path.join(root, "openspec", "changes", "pendiente"), { recursive: true });
  await cp(SCRIPT, path.join(root, "scripts", "docs-sync.mjs"));
  await writeFile(path.join(root, "docs", "guia.md"), "---\ntype: guia\n---\n\n# Guía\n", "utf8");
  await writeFile(path.join(root, "MEMORY.md"), ESTADO_MEMORY, "utf8");
  await writeFile(path.join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(
    path.join(root, "openspec", "changes", "completo", "tasks.md"),
    "# Tareas\n\n## 1. A\n\n- [x] 1.1 Hecha\n- [x] 1.2 Hecha\n",
    "utf8",
  );
  await writeFile(
    path.join(root, "openspec", "changes", "pendiente", "tasks.md"),
    "# Tareas\n\n## 1. A\n\n- [x] 1.1 Hecha\n\n## 2. B\n\n- [ ] 2.1 Pendiente\n- [ ] 2.2 Pendiente\n",
    "utf8",
  );
  spawnSync("git", ["init", "-b", "main"], { cwd: root, encoding: "utf8" });
  return root;
}

test("--estado emite la tabla fija y manda verificar el cambio completo", async () => {
  const root = await makeEstadoProject();
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "docs-sync.mjs"), "--estado"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;

  assert.match(out, /^\| CAMBIO \| TAREAS \| BLOQUE \| CARRIL \| PR \| CI \| ESTADO \| MOTIVO \|$/m);
  assert.ok(out.includes("|---|---|---|---|---|---|---|---|"));
  assert.match(out, /\| `completo` \| 2\/2 \| 1 \| — \| — \| — \| completo \| — \|/);
  assert.match(out, /\| `pendiente` \| 1\/3 \| 2 \| — \| — \| — \| listo \| — \|/);
  assert.match(out, /^COMANDO: \/opsx-verify completo$/m);
});
