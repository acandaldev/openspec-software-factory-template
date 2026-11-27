---
type: Proceso
hint: bucles, registro de refinamientos y mantenimiento del harness
---

# Cómo trabajamos: harness, bucles y refinamientos

Este documento explica **por qué** el harness es como es. `AGENTS.md` contiene la regla; aquí queda el incidente, la decisión y el commit que la originaron. No es un diario de tareas.

## 1. Los cuatro bucles

| Bucle | Cadencia | Artefacto | Pregunta |
|---|---|---|---|
| Proyecto | Meses | `MEMORY.md` y este registro | ¿Dónde estamos y qué viene después? |
| Cambio | Semanas | `openspec/changes/<cambio>/` | ¿Qué debe ser verdad y cómo lo demostramos? |
| Bloque | Días | Rama y PR | ¿Qué se puede integrar junto sin romper nada? |
| Tarea | Horas | Brief, gates y commit | ¿Qué hago ahora y cómo sé que está bien? |

Cada nivel contiene al siguiente y no se salta ninguna puerta.

## 2. Registro de refinamientos

Solo entran decisiones que cambiaron el comportamiento del sistema. Un ajuste de presupuesto, una versión de paquete o una preferencia no entran. `/curar` propone 0–3 filas por tanda; el humano aprueba antes de cambiar una regla.

| Fecha | Origen | Hueco | Decisión | Dónde | Commit |
|---|---|---|---|---|---|
| 24-nov | Incidente | Los briefs del coordinador endurecían el protocolo: pedían 2 pasadas y 3 mutaciones en tareas NORMAL, contra `implementer.md` y el `AGENTS.md` del stack, con filtro ancho | El brief no endurece el protocolo: mutaciones y pasadas verdes las fija el nivel (1 y 1 en NORMAL/`[FAST]`; 2 y 2 en `[HARD]` o concurrencia); el filtro son las clases tocadas; si hace falta más evidencia, se sube el nivel de la tarea | `implementar`, `coordinar`, `implementer` | `6b752e5` |
| 25-nov | Propio | El coordinador empujaba y esperaba CI por tarea, pero los workflows de código corren en la PR; el push por tarea añadía pasos sin gate de código | El push y la espera del CI son del bloque o de la PR; la evidencia intra-bloque son los gates locales y el commit | `AGENTS.md`, `coordinar`, `implementar`, `revisar` | `9ca6c0c` |
| 25-nov | Propio | La mutación manual se pedía por tarea aunque NORMAL/`[FAST]` se revisan por bloque; en las tareas con mutación manual multiplicaba el coste | NORMAL/`[FAST]`: una mutación manual por bloque en la revisión, sobre el comportamiento de mayor riesgo; `[HARD]`: 2 por tarea; la lógica pura puede usar la herramienta de mutación del proyecto | `implementer`, `reviewer` | `d366a3b` |
| 25-nov | Incidente | Reinstalar directorios pesados (`node_modules`) en cada worktree/copia de revisión añadía minutos por tarea, indexar `codegraph` en copias efímeras pequeñas no se amortizaba y su daemon bloqueaba `git worktree remove` en Windows | `worktree.sharedDirs` en `harness.config.json`, `scripts/worktree-deps.mjs` (`link`/`unlink` verificando SHA-256 del lockfile y `codegraph uninit --force`) e indexado de copias solo con >8 ficheros | `harness.config.example.json`, `bootstrap.mjs`, `scripts/worktree-deps.*`, `implementar`, `revisar`, `docs/codegraph.md` | `5eb19f7` |
| 25-nov | Incidente | Se esperaba el CI con `sleep` de 5–8 min; en una sesión se perdieron ~35 min en esperas fijas | Esperar con el comando bloqueante del CI (`gh run watch <id> --exit-status` en GitHub Actions); prohibido `sleep` o sondeo en bucle cuando el comando puede esperar | `AGENTS.md` | `b49e89d` |
| 25-nov | Propio | La revisión repetía gates y mutaba alcances sin lógica de producción (docs, tests, verificación) | El reviewer ejecuta los gates mínimos sin duplicar el build y no muta si no hay lógica de producción; la suite completa sigue siendo una por bloque | `reviewer`, `implementer` | `b49e89d` |
| 25-nov | Propio | Cada bloque se trataba como ventana de deploy; los merges encadenaban despliegues y CI duplicado | El deploy es del carril: los bloques se mergean sin desplegar; el proyecto define su mecanismo y se lanza al cerrar el carril | `AGENTS.md`, `coordinar` | este commit |
| 26-nov | Incidente | Los revisores comprobaban requisitos, no escenarios: un mensaje podía quedarse encolado y aprobarse porque el test solo miraba la fila del outbox | Matriz escenario → tarea en `openspec-reviewer` y escenario → evidencia en `reviewer`; un `SHALL`/`MUST` de entrega manda sobre el escenario, la evidencia llega al borde de entrega y todo punto de integración nuevo exige mutación de omisión | `.opencode/agents/reviewer.md`, `.opencode/agents/openspec-reviewer.md`, `.opencode/commands/revisar.md`, `.opencode/commands/openspec-review.md`, `AGENTS.md` | `b730662` |
| 27-nov | Incidente | `/estado` dependía del modelo: la misma tabla salía distinta, el CI sin PR aparecía verde y el rojo no tenía una acción definida | `/estado` ejecuta `docs-sync --estado`: tabla fija por cambio, `ESTADO` y `COMANDO`; un bloqueo (CI rojo, árbol sucio, CI en curso) deja `COMANDO: —` y espera decisión humana. `coordinar` sigue siendo el ejecutor del bloque | `.opencode/commands/estado.md`, `scripts/docs-sync.mjs`, `scripts/docs-sync.test.mjs`, `AGENTS.md`, `README.md` | este commit |
| 27-nov | Incidente | Un `AddScoped` nuevo de un servicio que otro registrado recibe por constructor no lo ponía rojo ninguna mutación: ningún test resolvía el consumidor desde el contenedor de la aplicación, así que quitar la línea de registro dejaba la suite en verde | Un registro DI nuevo exige un test que resuelva el consumidor desde el `ServiceProvider` real (con scope); la mutación quita la línea del arranque y exige ese rojo | `AGENTS.md`, `.opencode/agents/reviewer.md`, `.opencode/commands/revisar.md` | este commit |
| 27-nov | Incidente | El contrato del reviewer permitía escribir en la copia de revisión pero no fijaba dónde está ni quién la crea: intentó mutar el worktree del carril y recibió `permission.rejected`, así que el rojo lo ejecutó el implementer | La copia se fija en `{{reviewCopyDir}}/<cambio>-rev<bloque>`, la crea el coordinador al abrir la revisión (el reviewer si no existe) y `permission.rejected` significa que está editando el carril: no se rodea con scripts | `.opencode/agents/reviewer.md`, `.opencode/commands/revisar.md` | este commit |
| 27-nov | Incidente | Las urgencias fuera de OpenSpec no tienen `tasks.md` y su revisión no dejaba rastro en git: veredicto, modelo y ronda vivían solo en la conversación | Toda revisión deja `chore: registra revisión` con `Review-*`, también sin cambio OpenSpec; si la urgencia toca un cambio, además fila en su `## Revisiones` | `AGENTS.md`, `.opencode/commands/revisar.md` | este commit |

## 3. Métricas

Las métricas se leen de la traza, no de un panel:

- tareas con test, con mutación roja y con formato;
- rondas de revisión por tarea y causa (`brief`, `regla`, `test`, `alcance`);
- paradas por permisos, colisiones, CI rojo o contexto;
- tiempo y coste por tarea, cuando el entorno lo expone.

## 4. Lo que no copiamos, y por qué

- **Un segundo harness en la v0.1.** OpenCode es el único soportado; los adaptadores quedan para después.
- **Herramientas de diagnóstico personal.** Sin consumidor en CI, se pudren.
- **Datos, dominios, rutas o decisiones del proyecto de origen.** Cada proyecto escribe su historia.
- **Un agente autónomo que cambie reglas.** El curador propone; el humano aprueba.

## 5. Cómo se mantiene

La cadencia y el alcance de `/curar` viven en `AGENTS.md` § Comandos. No hay un cron que cure: la comprobación periódica solo valida la documentación.
