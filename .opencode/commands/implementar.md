---
description: "Implementa una o varias tareas de un cambio OpenSpec delegando en implementer según el nivel ([FAST], NORMAL, [HARD]) y registrando agente y coste"
---

Coordina la implementación de la(s) tarea(s) indicada(s) delegando el trabajo en el subagente `implementer`.

Argumentos: `$ARGUMENTS` (ejemplo: `<cambio> 2.1` o `<cambio> 1.2-1.5`).

## Modelo y ejecución

Tabla única: `AGENTS.md` § Comandos («Modelo por nivel»). Aplica la fila del nivel de la tarea; no la repitas aquí.

## Rama y PR

Sigue la política de `AGENTS.md` (§ Ramas y PR). Antes de invocar `implementer`, si la tarea cambia código, prepara el worktree del bloque desde `main` actualizado: `git worktree add paralelo/<cambio>-<bloque> -b feat/<cambio>-<bloque>` la primera vez, y reutilízalo en las tareas siguientes. Comprueba que está limpio (`git status`) antes de cada invocación.

## Reglas para esta sesión principal (coordinador)

1. **Identifica el cambio, la(s) tarea(s) y su etiqueta en `tasks.md`**:
   - Si falta el cambio o la tarea, pregúntalo antes de seguir (o si se indicó el cambio pero no la tarea, lee solo la siguiente línea `- [ ]` en `openspec/changes/<cambio>/tasks.md` sin cargar el archivo entero).
   - Comprueba si cada tarea lleva `[HARD]`, `[FAST]` o ninguna etiqueta (`NORMAL`) e invoca `implementer` según `AGENTS.md` § Comandos («Modelo por nivel»), pasando el `model` explícito que corresponda.
2. **No cargues contexto pesado en la sesión principal**:
   - No leas `proposal.md`, `design.md`, `specs/**` ni `tasks.md` completo aquí.
   - No ejecutes `openspec instructions apply` ni escribas el código directamente en la sesión principal.
3. **Invocación al subagente `implementer`**:
   - Agrupa por nivel dentro del mismo bloque: `[HARD]` siempre **1 a 1**; NORMAL **1–3 tareas del mismo bloque** en una invocación; `[FAST]` **3–5 tareas** del mismo grupo. No mezcles niveles en una invocación: el modelo lo fija el nivel más alto del lote.
   - Pásale en el brief, con estas claves exactas (el implementer las copia literales en el commit):
     - `Brief-Cambio`: `<cambio>` · **Worktree**: `paralelo/<cambio>-<bloque>` (ruta absoluta); trabaja y commitea ahí, nunca en el árbol principal.
     - `Brief-Tareas`: `<id>` o la lista del lote · `Brief-Nivel`: `[FAST]` | `NORMAL` | `[HARD]` (si es `[HARD]`, exige verificar atomicidad transaccional, concurrencia, idempotencia y casos borde).
     - `Brief-Modelo`: el modelo explícito de la tabla de `AGENTS.md` · **Entorno y Modelo (traza)**: `<Entorno> / <Modelo (variante)>`, con la variante obligatoria.
     - `Brief-Aceptacion`: el criterio de aceptación en una línea, observable y verificable.
     - `Brief-Ficheros`: las rutas que el alcance debe tocar, y solo esas.
     - `Brief-Ronda`: solo en un delta de revisión.
     - **El brief no endurece el protocolo**: `implementer.md` fija mutaciones y pasadas verdes (1 mutación y 1 pasada en NORMAL/`[FAST]`; 2 y 2 en `[HARD]` o concurrencia). No pidas más en el brief: si hace falta más evidencia, sube el nivel de la tarea. El filtro de test son las clases tocadas; el filtro ancho solo si el cambio toca un contrato compartido. Y si la tarea cumple dos o más de los criterios de `AGENTS.md` § Tamaño de una tarea (más de 3 ficheros de producción, mezcla de flujos, más de un sistema externo o más de 5 escenarios), se parte antes de empezar; no se lanza entera.
4. **Control de parada y verificación de coste**:
   - Si `implementer` devuelve bloqueo, fallo de tests/build no resuelto, necesidad de nueva dependencia o incoherencia del plan, **detén la secuencia inmediatamente** y muéstrale el problema al usuario.
   - Si `implementer` agota pasos sin marcar `tasks.md`, **no marques a ciegas**: ejecuta tú los gates de `AGENTS.md` y, solo si están en verde, marca la tarea con la traza advirtiendo de que el cierre lo hizo el coordinador.
   - Si tu entorno te muestra el coste exacto de la llamada al subagente tras finalizar y difiere de la estimación anotada en `tasks.md`, actualiza el valor de `Coste:` en esa línea de `tasks.md`.
   - Tras cada tarea con gates verdes y su commit (`feat(<cambio>): <tarea>`), empuja la rama (`git push -u origin feat/<cambio>-<bloque>`) y espera el CI según `AGENTS.md`, **salvo que el usuario haya pedido no empujar**. Si el run sale rojo por causas del cambio, lanza otra pasada de `implementer` con el log como brief y repite; no se deja para la revisión.
5. **Documentación**:
   - Si la tarea crea o modifica documentos de `docs/`, el documento nuevo lleva frontmatter con `type:` (y `stale_after` si envejece). No lo inventes: la regla está en `AGENTS.md` y el mapa en `docs/index.md`.
   - Al cerrar el bloque o el cambio, ejecuta `node scripts/docs-sync.mjs`: regenera `docs/index.md` y corrige las cifras de avance de `MEMORY.md`. El CI lo verifica con `--check`.
6. **Salida**:
   - Si el usuario pide commit o push, espera el run correspondiente y corrige el rojo antes de dar la tarea por cerrada.
   - Muestra por cada tarea completada el resumen de `implementer`, incluyendo `[Agente: ... | Coste: ...]`, y cuál es la siguiente tarea pendiente del bloque (indicando su etiqueta y el modelo que requiere).
   - No edites `MEMORY.md` a mano: las cifras de avance las ajusta `docs-sync.mjs`. No toques `main`: el trabajo vive en la rama del bloque hasta la PR.
