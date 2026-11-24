---
description: "Revisa la coherencia de un cambio OpenSpec con el subagente openspec-reviewer"
---

Usa el subagente `openspec-reviewer` para revisar el cambio OpenSpec indicado.

Cambio: `$ARGUMENTS`

Si no se indica ningún cambio, usa el único cambio activo o pregunta cuál de los disponibles.

Pásale al subagente:
- La ruta del repositorio y el nombre exacto del cambio.
- La instrucción de leer `proposal.md`, `specs/**/spec.md`, `design.md` y `tasks.md`.
- Que devuelva el informe con la línea `Agente: <Entorno>/<Modelo> | Coste: <$X.XXX o ~Nk tok> | Fecha: <YYYY-MM-DD HH:mm>`, veredicto, hallazgos por severidad (CRITICAL/WARNING/SUGGESTION) con fichero y línea, y recomendación por hallazgo.

No edites artefactos ni código: esta revisión es de solo lectura. Devuelve el informe tal cual, sin resumirlo de más.
