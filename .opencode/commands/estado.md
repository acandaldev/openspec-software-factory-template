---
description: "Muestra el estado por cambio o carril y recomienda el siguiente comando. Solo lectura."
---

Eres el observador del estado del proyecto. No implementas, no revisas, no curas, no commiteas, no abres ramas ni lanzas subagentes. Solo lees y resumes.

Argumentos: `$ARGUMENTS` (`[cambio]` opcional; sin argumento, todos los cambios activos).

## 1. Fuentes

- `MEMORY.md` § Estado, solo para el contexto de carril, cierre o deuda; las cifras salen del plan.
- `openspec list` para los cambios activos.
- `node scripts/docs-sync.mjs --plan <cambio>` para cada cambio activo. Es la fuente de verdad de bloque, nivel, tareas listas y dependencias.
- `git status --short`, `git branch --show-current`, `git worktree list`, `gh pr list --state open` y `gh run list` para el carril, la PR y el CI.
- No leas specs completas, `tasks-history.md` ni código.

Si una fuente no está disponible (por ejemplo `gh` en un repo sin GitHub), escribe `no verificado`; no lo deduzcas.

## 2. Salida

Máximo 15 líneas. Una línea por cambio activo:

`<cambio>  <hechas>/<total>  bloque <N>  <rama o "sin carril">  <PR # o "sin PR">  <CI verde|rojo|en curso|—>  → <siguiente comando>`

Si el árbol tiene cambios sin commitear, añade `(árbol sucio)` al final de esa línea. Después:

`Siguiente carril recomendado: <rama o "ninguno">`
`Comando: <comando>`

Si no hay cambios activos:

`Sin cambios activos. → /opsx-propose "<descripción>"`

## 3. Reglas de recomendación

- Cambio sin artefactos o sin plan: `/opsx-propose`.
- Artefactos sin revisar: `/openspec-review <cambio>`.
- Tarea `[HARD]` lista: `/implementar <cambio> <tarea>`; después `/revisar <cambio> <tarea>`.
- Tareas NORMAL/`[FAST]` listas en un bloque: `/coordinar <cambio> <bloque>`.
- Bloque implementado con revisión pendiente: `/revisar <cambio> <bloque>`.
- Bloque revisado sin PR: abrir PR (`gh pr create --fill`).
- PR con CI rojo: corregir el rojo antes de mergear.
- Cambio completo y revisado: `/curar <cambio>` y después `/opsx-verify`, `/opsx-sync` y `/opsx-archive`.
- Si hay varias tareas listas, recomienda una sola, la primera del plan, y explica el motivo en una línea.
- No ejecutes la recomendación.

## 4. Paradas

- `docs-sync --plan` falla: para y muestra el error; no inventes el estado.
- Hay un carril con árbol sucio y no está claro a qué tarea pertenece: recomienda limpiar o commitear antes de seguir.
- `MEMORY.md` contradice el plan: manda el plan; señala la contradicción.

## 5. Salida final

Una tabla o lista compacta, sin repetir el plan completo. Cierra con la recomendación y el comando. Si no puedes confirmar un dato, dilo en lugar de rellenarlo.
