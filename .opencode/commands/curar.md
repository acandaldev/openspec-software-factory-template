---
description: "Convierte la traza de un bloque o cambio (o de los últimos 7 días con `--semana`) en propuestas de refinamiento para docs/harness.md, con aprobación humana"
---

Convierte la traza de un bloque o cambio, o de los últimos 7 días con `--semana`, en **propuestas** de refinamiento. No implementa, no revisa código y no cambia reglas sin aprobación.

Argumentos: `$ARGUMENTS`

- `<cambio> [bloque]`: traza de un cambio o de un bloque concreto.
- `--semana`: barrido opcional de mantenimiento de los últimos 7 días; no sustituye el cierre de bloque o cambio.

## 1. Alcance

- La cadencia la fija `AGENTS.md` § Comandos; este comando no la redefine.
- Si es `--semana`, usa `git log --since="7 days ago"` y revisa `MEMORY.md` § Pendiente; si no hay traza, para.
- Si es `<cambio> [bloque]`, lee solo `openspec/changes/<cambio>/tasks.md` (líneas de tarea y `## Revisiones`), no el cambio entero. Usa el rango de commits del bloque o del cambio; si está en un worktree, usa su ruta.
- No leas código de producción salvo que la traza lo exija. El curador trabaja con evidencia, no con el diff completo.

## 2. Evidencia

Recoge, como máximo, lo que exista:

- filas de `## Revisiones` y sus `Review-Causa` (`brief`, `regla`, `test`, `alcance`);
- trailers `Brief-*` y `Review-*` del rango;
- paradas: permisos denegados, hallazgos fuera del plan, colisiones, CI rojo, umbral de contexto;
- tareas divididas, reabiertas o con más de una ronda;
- fallos de `docs-sync --check` o del gate de secretos;
- las últimas filas de `docs/harness.md` §2 para no duplicar.

## 3. Pregunta

Para cada señal, pregunta: **¿qué regla permitió que esto pasara?**

- **Incidente**: algo falló y se corrigió.
- **Propio**: una decisión de diseño que se quiere dejar registrada.
- **Ruido**: un ajuste de presupuesto, versión o preferencia. No entra.

## 4. Propuesta

Devuelve **hasta 3 filas por tanda**. Cada una con:

| Fecha | Origen | Hueco | Decisión | Dónde | Commit |
|---|---|---|---|---|---|
| `YYYY-MM-DD` | Incidente / Propio | Qué falló o qué faltó | La regla o el cambio mínimo | `AGENTS.md`, comando, script, config o `docs/` | `pendiente` |

Si no hay evidencia suficiente, di «no hay nada que curar» y para. Si queda evidencia de §2 que no sea ruido y no entra en la tanda, no la descartes: propón otra tanda (§5).

## 5. Aprobación y aplicación

- Muestra las filas y pide aprobación explícita. No edites `AGENTS.md`, comandos, scripts ni permisos en este paso.
- Si el usuario aprueba una fila que cambia una regla, aplica el cambio mínimo en el fichero correspondiente y actualiza `Commit` con el hash real.
- Añade las filas aprobadas al final de `docs/harness.md` §2, sin reordenar las existentes.
- Ejecuta `node scripts/docs-sync.mjs --check`; si falla, corrige solo lo que haya introducido el curador.
- Haz commit de `docs(harness): registra <resumen>` con las filas; no empujes salvo que el usuario lo pida.
- No edites `MEMORY.md` a mano.
- **Tandas**: cada tanda se aprueba, se aplica, se valida y se commitea antes de empezar la siguiente; nunca dos tandas sin aprobación entre medias. Si el usuario para a mitad, no apliques las filas restantes: lístalas en la salida como pendientes, con su evidencia y el motivo por el que no entraron.

## 6. Paradas

- No hay traza suficiente: para y dilo.
- La decisión propuesta debilita un test o un gate: recházala.
- La causa es un bug de producto, no del harness: deriva a triaje (`Ahora`, `Bloque`, `Después`, `Fuera`).
- La decisión cambia el alcance o el contrato: pide al usuario antes de tocar nada.
- El usuario no aprueba la tanda o para a mitad: no insistas; deja las filas restantes como pendientes con su evidencia.

## Salida

Un párrafo con: señales leídas, filas propuestas por tanda, filas rechazadas y por qué, filas pendientes si el usuario paró, y el fichero tocado. Sin rellenar con cambios que no tengan evidencia.
