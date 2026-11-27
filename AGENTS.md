# Contrato del proyecto

## Proyecto

- **{{projectName}}**: {{projectDescription}}
- Stack: {{stackDescription}}
- Estructura: {{sourceDirs}}
- Specs: `openspec/`. Estado: `MEMORY.md`. Operación: `docs/`.
- Documentación: empieza por `docs/index.md` (mapa con tipo, secciones, estado y caducidad).
- El porqué de una regla está en `docs/harness.md`; aquí solo la regla.
- Documenta solo lo propio del proyecto: nada de semántica genérica del framework.

## Comandos

- Build: `{{buildCommand}}`
- Test: `{{testCommand}}`
- Formato: `{{formatCommand}}`
- Validar spec tocada: `openspec validate <cambio> --strict`
- Sincronizar índices: `node scripts/docs-sync.mjs` (regenera `docs/index.md` y corrige el avance de `MEMORY.md`); CI usa `--check`
- Plan ejecutable: `node scripts/docs-sync.mjs --plan <cambio>` imprime JSON (bloque, nivel, estado, dependencias y tareas listas) y falla con ciclos o dependencias rotas; no escribe ficheros.
- Estado actual: `/estado` ejecuta `node scripts/docs-sync.mjs --estado` y devuelve una tabla fija por cambio con `ESTADO` y una última línea `COMANDO`; un bloqueo deja `COMANDO: —` y espera decisión humana. Es solo lectura y no ejecuta la recomendación.
- Implementar tarea (**obligatorio**): `/implementar <cambio> <tarea>` (subagente `implementer`); revisar (**obligatorio**): `/revisar <cambio> <alcance>` (subagente `reviewer`); `/opsx-*` para crear, verificar y archivar cambios. La sesión principal coordina: escribe el brief, lanza el comando y ejecuta los gates; no implementa ni revisa la tarea.
- Continuidad dentro del bloque: `/coordinar <cambio> <bloque>` encadena las tareas listas del bloque (orden de `docs-sync --plan`) sin preguntar entre una y otra. Paradas: tarea `[HARD]` tras su revisión, tercera ronda de `CAMBIOS NECESARIOS`, permiso denegado, hallazgo fuera del plan, fichero en colisión con otro carril, CI rojo, fin de bloque (PR) o el umbral de contexto.
- Curar el harness: `/curar <cambio> [bloque]` o `/curar --semana` (propone filas para `docs/harness.md` §2; no cambia reglas sin aprobación). No se ejecuta por tarea: se hace al cerrar bloque o cambio; `--semana` es un barrido opcional de mantenimiento.
- Gates de una tarea: build, tests filtrados, formato y `git status` en una sola llamada encadenada, con la salida filtrada; sin scripts intermedios.
- Esperar un run: usa el comando bloqueante de tu CI (`gh run watch <id> --exit-status` en GitHub Actions). Prohibido `sleep` o sondeos en bucle cuando el comando puede esperar la respuesta.
- Shell de los agentes: Bash (Git Bash en Windows o WSL). Los gates se encadenan con `&&`; PowerShell no está soportado.
- Exploración opcional: si el proyecto activa `codegraph` (ver `docs/codegraph.md`), indexa cada worktree con `codegraph init . --yes` y usa `codegraph_explore` con `projectPath` del worktree; si no hay índice, `grep -n` y `read`. Sin `projectPath`, la consulta devuelve el árbol principal.

### Modelo por nivel

La etiqueta de `tasks.md` decide el modelo de la sesión hija; el coordinador lo pasa explícito y anota cualquier desviación en la traza.

| Nivel | Implementar | Revisar | Ejecución |
|---|---|---|---|
| `[HARD]` | `{{modelImplementHard}}` | `{{modelReviewHard}}` | 1 a 1 |
| NORMAL | `{{modelImplementNormal}}` | `{{modelReviewNormal}}` | Lotes de 1–3, una invocación por lote |
| `[FAST]` | `{{modelImplementFast}}` | `{{modelReviewFast}}` | Lotes de 3–5 |

El coordinador pasa el modelo explícito según la etiqueta y verifica la línea `Agente:` del informe contra esta tabla; si no coincide, la revisión no es válida: se relanza con el modelo correcto y no se registra la fila. Cualquier otra elección se anota en la traza.

### Tamaño de una tarea

Una tarea se parte **antes de empezar** si cumple dos o más de: toca más de 3 ficheros de producción, mezcla dos flujos independientes, cruza más de un sistema externo o tiene más de 5 escenarios verificables por separado. Cada subtarea es un flujo observable con ≤3 ficheros de producción, ≤1 de test y su commit; las dependencias (`a` → `b`) se declaran en `tasks.md`. `[HARD]` no autoriza tareas grandes: cambia la revisión (1 a 1) y el modelo, no el tamaño.

## Ramas y PR

- `{{mainBranch}}` es la rama de integración: recibe merges de PR; el proyecto define cómo se despliega. La excepción es documentación y harness (`docs/`, `openspec/`, `.opencode/`, `AGENTS.md`).
- Un bloque es una fase entregable y su PR es el merge. Una rama por bloque (`## N.` de `tasks.md`): `feat/<cambio>-<bloque>`. Sus tareas son **commits dentro de esa rama**, no ramas aparte.
- Una ejecución = un commit. El `implementer` commitea cada tarea en el worktree del bloque cuando los gates post-reversión están en verde y **no empuja**; el padre empuja la rama al cerrar el bloque y espera el CI. El `reviewer` revisa `main..<rama>`, nunca un árbol sin commitear: antes de su brief, `git status` debe estar limpio.
- El commit de tarea lleva el brief en trailers al final del mensaje, copiados literales: `Brief-Cambio`, `Brief-Tareas`, `Brief-Nivel`, `Brief-Modelo`, `Brief-Aceptacion` y, si aplica, `Brief-Ficheros` y `Brief-Ronda`. El commit `chore: registra revisión` lleva a su vez `Review-Veredicto`, `Review-Modelo`, `Review-Ronda` y, en `CAMBIOS NECESARIOS`, `Review-Causa`; se hace **también** en una urgencia fuera de bloque (`fix/<tema>`), que no tiene `tasks.md` donde anotar la fila. La PR se mergea con merge commit, **nunca squash**, o los trailers se pierden.
- Revisión: `[HARD]` por tarea; NORMAL y `[FAST]` por bloque, antes de la PR. Excepción: el primer lote de un carril se revisa antes de seguir.
- Cobertura de escenarios: `openspec-reviewer` devuelve la matriz escenario → tarea; un escenario sin tarea ni cobertura delegada citada (cambio, tarea y dueño) es `CRITICAL` salvo `Fuera del MVP` con motivo y dueño; un `SHALL`/`MUST` de entrega sin escenario que lo refleje es `CRITICAL`. `reviewer` devuelve la matriz escenario → test/mutación; un test que solo comprueba el encolado o el registro no cubre un escenario ni un requisito de entrega. Todo punto de integración nuevo lleva mutación de omisión: quitar el cableado y exigir un test rojo. Un registro DI nuevo (`AddScoped`/`AddSingleton`/`AddTransient`) de un servicio que otro registrado recibe por constructor lleva además un test que resuelva el consumidor desde el `ServiceProvider` real de la aplicación (con scope): sin él la mutación de omisión del registro no puede ponerse roja y el fallo alcanza a todos los mensajes del worker, no solo a los del tipo nuevo.
- Un `CAMBIOS NECESARIOS` no crea tarea nueva: se reabre la tarea (`[ ]`), se arregla y se vuelve a marcar; la revisión del arreglo se registra en `## Revisiones` con el mismo ID y el sufijo `(delta)`. Una tarea solo se divide por tamaño, y antes de dividirla se pregunta al usuario.
- Un carril es una rama con worktree en `paralelo/<cambio>-<bloque>` (ignorado por git), preparado con `node scripts/worktree-deps.mjs link paralelo/<cambio>-<bloque>` (y limpiado con `unlink` antes de `git worktree remove`). No se abre si su dominio de colisión está ocupado.
- La PR se abre cuando la última tarea del bloque está `[x]` y revisada, **cuando el usuario lo pida**. Un bloque = un merge; un carril = una ventana de deploy. Los merges no despliegan: el deploy se decide al cerrar el carril con el mecanismo del proyecto.
- El push es del bloque; el CI de código se espera al abrir la PR, no tras cada tarea: la evidencia intra-bloque son los gates locales y el commit. El run que exista se espera y se corrige el rojo antes de seguir: no se deja para después ni se pregunta si hay que mirarlo.
- Urgencias fuera de bloque: `fix/<tema>` con PR. Tras el merge: borrar la rama y `git switch {{mainBranch}} && git pull`.

## Triaje

Cuando aparece algo que no estaba en el plan —hallazgo de revisión, alerta, bug o petición— se clasifica antes de tocarlo:

| Categoría | Cuándo | Dónde queda |
|---|---|---|
| **Ahora** | Rompe contrato, spec o seguridad, o bloquea el deploy del bloque en curso | Se arregla antes de seguir; tarea en el `tasks.md` del cambio |
| **Bloque** | Deuda del bloque actual que no impide desplegar | Se cierra antes de la PR; fila en `## Revisiones` |
| **Después** | Deuda real con destino conocido | `MEMORY.md` § Pendiente o tarea del cambio, con dueño |
| **Fuera** | No entra en el MVP | Motivo escrito en `docs/` o en el `tasks.md`; la pista no se borra |

- No hay tablero ni reunión: se escribe donde vive el trabajo.
- Si la categoría no está clara, decide el usuario; el agente no inventa prioridad.

## Límites

- Siempre: abrir specs y docs por la sección que toque y empezar `git diff` por `--stat` o filtrar por ruta. Antes de cerrar, los gates de § Comandos del lado tocado.
- Pregunta antes: cambios de esquema, DNS, archivos nuevos o cualquier cambio en los permisos o el contrato de los agentes (`.opencode/agents/`).
- Nunca: tocar producción sin rollback, editar migraciones ya aplicadas.
- Nunca: implementar o revisar una tarea en la sesión principal; el cauce obligatorio es `/implementar` y `/revisar`. Cualquier otro subagente requiere petición explícita del usuario en ese mismo turno. Un «para» detiene toda ejecución hasta nueva autorización.
- Subagentes: nunca dos sesiones simultáneas sobre la misma tarea o rama; sin brief cerrado no se lanza; si el `implementer` de la tarea sigue vivo en la sesión actual, el delta se le envía por continuación para reutilizar su contexto en caché en vez de abrir otro desde cero; un subagente no puede aprobar una confirmación de permiso.
- No guardes secretos.

## Memoria y contexto

- Lee `MEMORY.md` al iniciar sesión, al cambiar de bloque o tras compactar (no en cada tarea). No sustituye a OpenSpec.
- `MEMORY.md` es **memoria operativa, no un registro**: solo estado, decisiones y pendientes vigentes; el detalle técnico vive en `docs/`.
- Actualízalo al cerrar un bloque o un cambio, no en cada tarea ni revisión.
- Orientación: ≤85 líneas. En `Estado`, una fila por cambio con hechas/total y el siguiente paso.
- Si algo se vuelve regla permanente, muévelo al `AGENTS.md` correspondiente.
- Antes de compactar: checkpoint en `MEMORY.md`; después, lee `MEMORY.md` y solo la sección en curso. Umbrales en % del modelo: checkpoint 75–80 %, parar 85–87 %.
- No guardes secretos.
