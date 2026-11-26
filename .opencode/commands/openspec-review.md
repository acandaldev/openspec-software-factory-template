---
description: "Revisa la coherencia de un cambio OpenSpec con el subagente openspec-reviewer"
---

Usa el subagente `openspec-reviewer` para revisar el cambio OpenSpec indicado.

Cambio: `$ARGUMENTS`

Si no se indica ningún cambio, usa el único cambio activo o pregunta cuál de los disponibles.

Pásale al subagente:
- La ruta del repositorio y el nombre exacto del cambio.
- La instrucción de leer `proposal.md`, `specs/**/spec.md`, `design.md` y `tasks.md`.
- Que construya la **matriz escenario → tarea** de todos los escenarios del cambio. Un escenario sin tarea ni cobertura delegada citada (cambio, tarea y dueño) es `CRITICAL` salvo `Fuera del MVP` con motivo y dueño; una cobertura delegada citada es `CUBIERTO (delegado)` y una tarea que solo cubre una parte del escenario es `WARNING`. El `SHALL`/`MUST` manda: si exige entregar, enviar o notificar y ningún escenario lo refleja, es `CRITICAL`, y una tarea que solo encola no lo cubre aunque el escenario solo diga «se encola».
- Que devuelva el informe con la línea `Agente: <Entorno>/<Modelo> | Coste: <$X.XXX o ~Nk tok> | Fecha: <YYYY-MM-DD HH:mm>`, veredicto, matriz escenario → tarea, hallazgos por severidad (CRITICAL/WARNING/SUGGESTION) con fichero y línea, y recomendación por hallazgo.

No edites artefactos ni código: esta revisión es de solo lectura. Devuelve el informe tal cual, sin resumirlo de más.
