# OpenSpec Software Factory Template

Template ejecutable del método **OpenSpec + subagentes + gates + traza + curador**, para proyectos que ya usan [OpenSpec](https://github.com/Fission-AI/OpenSpec) y trabajan con [OpenCode](https://opencode.ai).

La v0.1 es **OpenCode-only**. No incluye datos, dominios, rutas, modelos ni secretos de ningún proyecto concreto: cada proyecto ejecuta `bootstrap.mjs` y escribe su propio contrato.

## Qué incluye

- `AGENTS.md` con placeholders: contrato de proyecto, comandos, ramas, triaje y memoria.
- Tres subagentes: `implementer`, `reviewer` y `openspec-reviewer`.
- Comandos propios: `/implementar`, `/revisar`, `/coordinar`, `/curar` y `/openspec-review`.
- `scripts/docs-sync.mjs`: genera `docs/index.md`, compacta `tasks.md`, archiva el detalle en `tasks-history.md` y corrige el avance de `MEMORY.md`.
- `scripts/check-secrets.mjs`: gate de credenciales y términos prohibidos.
- `bootstrap.mjs`: sustituye placeholders, escribe `harness.config.json` y valida el resultado.
- `template.json`: manifiesto legible por máquina (versión, harness, repositorio, sitio, comandos y agentes). El sitio lo copia y comprueba que no diverge.
- Tests de `docs-sync`, de `bootstrap`, del manifiesto y de permisos de agentes.
- Workflow de CI para documentación, tests y secretos.
- `docs/harness.md` como registro de refinamientos y `MEMORY.md` como memoria operativa.

## Qué no incluye

- Un segundo harness (otros agentes o CLIs).
- Wiki implementada; el diseño queda en `docs/template-spec.md`.
- Panel de métricas: la traza vive en git y en `tasks.md`.
- Código, datos o infraestructura de ningún proyecto.

## Módulos opcionales

- `codegraph`: índice local de código por MCP, **desactivado por defecto**. No es una dependencia del template ni de CI. Guía: `docs/codegraph.md`.

## Requisitos

- Node.js 22 o superior.
- Git.
- Bash (Git Bash en Windows o WSL). Los agentes ejecutan los gates en Bash; PowerShell no es un shell soportado.
- OpenCode instalado y funcionando en el proyecto.
- OpenSpec instalado. El template asume que el proyecto ya está inicializado; si no, ejecuta `openspec init` antes del primer cambio.
- Los modelos que configures deben existir en OpenCode. El template no fija proveedor.

## Puesta en marcha

1. Crea el repositorio del proyecto desde este template (botón **Use this template** de GitHub) o copia el contenido en un proyecto existente.
2. Ejecuta el bootstrap:

```bash
node bootstrap.mjs
```

El modo interactivo pide nombre, slug, descripción, stack, directorios de código, comandos de build/test/formato, modelos por nivel, directorio de copias de revisión y rama principal.

También acepta flags para automatizar:

```bash
node bootstrap.mjs --yes \
  --name "Acme Notes" \
  --description "Notas internas del equipo" \
  --stack "stack del proyecto" \
  --source-dirs "ruta/al/codigo/" \
  --build "comando-de-build" \
  --test "comando-de-test" \
  --format "comando-de-formato" \
  --implement-hard "<proveedor>/<modelo>#high" \
  --implement-normal "<proveedor>/<modelo>" \
  --implement-fast "<proveedor>/<modelo>" \
  --review-hard "<proveedor>/<modelo>#high" \
  --review-normal "<proveedor>/<modelo>" \
  --review-fast "<proveedor>/<modelo>" \
  --review-copy-dir ".review" \
  --main-branch main
```

`node bootstrap.mjs --help` muestra todas las opciones. Sustituye los valores de ejemplo por los comandos reales de tu proyecto. Si `harness.config.json` ya existe, el bootstrap se niega a sobrescribirlo salvo que uses `--force`.

3. Revisa `AGENTS.md`, `.opencode/agents/*.md` y `.opencode/commands/revisar.md`: los placeholders deben haber desaparecido.
4. Comprueba los gates:

```bash
node scripts/docs-sync.mjs --check
node scripts/check-secrets.mjs
npm test
```

5. Crea el primer cambio con `/opsx-propose <cambio>`.

## Estructura

| Ruta | Para qué |
|---|---|
| `AGENTS.md` | Contrato del proyecto: comandos, niveles, ramas, triaje y memoria. |
| `harness.config.json` | Configuración generada por `bootstrap.mjs`; el ejemplo versionado es `harness.config.example.json`. |
| `opencode.jsonc` | Configuración de OpenCode; `codegraph` queda desactivado por defecto. |
| `.opencode/agents/` | Subagentes de implementación y revisión. |
| `.opencode/commands/` | Comandos del flujo. |
| `scripts/docs-sync.mjs` | Índices, memoria, compactación de tareas y plan ejecutable. |
| `scripts/check-secrets.mjs` | Gate de secretos y términos prohibidos. |
| `docs/` | Operación y decisiones. Empieza por `docs/index.md`. |
| `docs/codegraph.md` | Módulo opcional de exploración de código. |
| `openspec/changes/` | Cambios activos. |
| `openspec/specs/` | Especificaciones vivas. |
| `MEMORY.md` | Estado operativo, no registro histórico. |

## Comandos

| Comando | Cuándo | Qué hace |
|---|---|---|
| `/opsx-propose` | Antes de código | Crea proposal, spec, design y tasks. |
| `/implementar` | Una tarea | Brief + `implementer`; gates y commit en el worktree del bloque. |
| `/revisar` | Tarea o bloque | `reviewer` sobre el rango de commits. |
| `/coordinar` | Bloque | Encadena las tareas listas y para en las paradas. |
| `/curar` | Cierre de bloque o cambio; `--semana` opcional | Propone filas para `docs/harness.md`; no cambia reglas sin aprobación. |
| `/openspec-review` | Antes de codificar o al cerrar un cambio | Revisa coherencia entre artefactos. |
| `/opsx-verify`, `/opsx-sync`, `/opsx-archive` | Cierre | Verifica, sincroniza y archiva. |

`/opsx-*` vienen de OpenSpec; el resto los aporta el template.

## Niveles y modelos

La etiqueta de `tasks.md` decide el modelo de la sesión hija y el tamaño del lote:

- `[HARD]`: una tarea por ejecución y revisión por tarea.
- NORMAL: lotes de tareas del mismo bloque; revisión al cerrar el bloque.
- `[FAST]`: lotes mayores del mismo grupo; revisión al cerrar el bloque.

La tabla canónica, con modelos y umbrales exactos, vive en `AGENTS.md` § Comandos («Modelo por nivel»). El coordinador pasa el modelo explícito y verifica la línea `Agente:` del informe de revisión contra `AGENTS.md`. Si no coincide, la revisión no es válida.

## Secretos y datos

`data/forbidden.json` solo lleva ejemplos genéricos. Los términos del proyecto real se leen de un fichero local fuera del repositorio:

- `~/.config/openspec-software-factory/forbidden.json`, o
- la ruta indicada por `OPENSPEC_FORBIDDEN_FILE`.

No guardes credenciales en el repositorio. `scripts/check-secrets.mjs` corre en CI y falla si encuentra una.

## Actualizar el template

El template no se sincroniza automáticamente con los proyectos que lo usan. Cada release se compara y se porta a mano, revisando primero qué aplica y qué no. Los cambios de una v0.1 no prometen compatibilidad con adaptaciones locales.

`template.json` es el contrato legible por máquina. Si cambias la versión, un comando o un agente, actualízalo en el mismo commit; el test de manifest lo verifica. El sitio público guarda una copia en `data/template.json` y su CI falla si divergen.

## Documentación

- `docs/template-spec.md`: alcance, bootstrap, comandos, módulos opcionales y criterios de aceptación.
- `docs/harness.md`: por qué el harness es como es y registro de refinamientos.
- `docs/codegraph.md`: módulo opcional de exploración de código.
- `docs/index.md`: mapa generado de la documentación.

## Licencia

MIT. Ver `LICENSE`.
