---
description: "Revisa el código y tests de una tarea o bloque con el subagente reviewer según la matriz de AGENTS.md"
---

Usa el subagente `reviewer` para auditar la implementación contra el cambio OpenSpec indicado.

Argumentos: `$ARGUMENTS` (ejemplo: `<cambio> 2.1-2.7` o `<cambio> 2.2`).

## Modelo de la revisión

Tabla única: `AGENTS.md` § Comandos («Modelo por nivel»). El nivel se toma del alcance más alto: si la revisión incluye una tarea `[HARD]`, todo el alcance se revisa con el modelo de `[HARD]`. El coordinador pasa el `model` explícito en la invocación; el defecto del agente es el de `[HARD]`, así que un olvido no degrada la revisión, pero NORMAL y `[FAST]` deben llevar su modelo explícito.

## Reglas para esta sesión principal (coordinador)

1. **Verifica el alcance y el modelo**:
   - Necesitas el nombre del cambio, el alcance (IDs de tarea) y la **rama del bloque** (`feat/<cambio>-<bloque>`); la base es `main`. Si falta alguno en `$ARGUMENTS` y no es inequívoco por el último mensaje de la conversación, pregunta antes de lanzar el subagente.
   - Invoca `reviewer` según `AGENTS.md` § Comandos («Modelo por nivel») para el nivel del alcance, pasando el `model` explícito.
2. **No revises ni cargues el diff en la sesión principal**:
   - No ejecutes `git diff`, tests ni leas las specs o archivos de código desde la sesión principal; todo ese trabajo debe ocurrir dentro de la sesión aislada de `reviewer`.
3. **Crea la copia de revisión** (antes de invocar al subagente):
   - `git worktree add "{{reviewCopyDir}}/<cambio>-rev<bloque>" <commit revisado>` para congelar el estado y no leer un árbol que sigue avanzando.
   - Si usas una herramienta de indexado, inicialízala en la copia; si no, el reviewer usará `grep`/`read`.
4. **Invoca al subagente `reviewer`** pasándole en el brief:
   - **Cambio**: `<cambio>`
   - **Alcance**: IDs de tarea (indicando cuáles son `[HARD]` y si es revisión `delta`).
   - **Rama y commits**: `feat/<cambio>-<bloque>`; el rango a revisar es `main..feat/<cambio>-<bloque>` (y el commit del delta si es `delta`), no el árbol.
   - **Entorno y Modelo**: el modelo explícito de la tabla, para que lo incluya junto con el coste/tokens en la cabecera del informe (`Agente: ... | Coste: ...`).
5. **Verifica el modelo del informe antes de aceptarlo**:
   - La línea `Agente: ...` del informe debe coincidir con el modelo que exige la matriz para el nivel del alcance. Si no coincide, la revisión **no es válida**: relánzala con el modelo correcto y no registres la fila.
6. **Salida y registro automático**:
   - No edites código ni artefactos: la revisión es de solo lectura.
   - Devuelve el informe de `reviewer` tal cual (con su `VEREDICTO`, línea `Agente: ... | Coste: ...`, tabla requisito → evidencia → estado y hallazgos), sin recortarlo.
   - Añade **siempre** una fila a la sección `## Revisiones` de `openspec/changes/<cambio>/tasks.md` con el alcance, el veredicto, el agente/modelo, el coste y la fecha y hora (`YYYY-MM-DD HH:mm`). Si la sección no existe, créala al final con la cabecera `| Alcance | Veredicto | Agente | Coste | Fecha y hora |`. No modifiques ninguna otra parte del archivo y no preguntes si hay que añadirla. Si el veredicto es `CAMBIOS NECESARIOS`, añade la causa en esa celda con el formato `CAMBIOS NECESARIOS · causa: <brief|regla|test|alcance>`: `brief` = la tarea o el brief no estaban claros; `regla` = una regla del harness se contradice o falta; `test` = el test no cubre lo que dice; `alcance` = el cambio se salió de lo pedido.
   - Si el alcance tocó `docs/` o se está cerrando el bloque antes de la PR, ejecuta `node scripts/docs-sync.mjs`.
   - Si el veredicto es **APROBADO**, haz commit **solo de esa fila** con el mensaje `chore: registra revisión <alcance>` —tras una línea en blanco lleva `Review-Veredicto`, `Review-Modelo` y `Review-Ronda`, copiados del informe— y empuja (salvo que el usuario haya pedido no empujar). Los cambios del alcance ya vienen en los commits de `implementer`. Si el árbol contiene cambios fuera del alcance, no commitees y avísalo. El push va a la **rama del bloque**; nunca a `main` si el alcance contiene código.
   - Si has empujado, espera el run de esa rama según `AGENTS.md`. Si falla por causas del cambio, pásale el log a `implementer` como brief, corrige y vuelve a empujar; no cierres la revisión con el run en rojo.
   - Si el veredicto es **CAMBIOS NECESARIOS**: añade y commitea la fila (`chore: registra revisión <alcance>` con los mismos trailers más `Review-Causa: <causa>`), empuja (salvo que el usuario haya pedido no empujar) y, **sin preguntar**, continúa en el `implementer` existente de la tarea con los hallazgos como brief, `CRITICAL` primero. Commitea, empuja (si aplica), espera el run y vuelve a invocar a `reviewer` sobre el rango nuevo.
   - **Tope de 3 rondas de corrección por alcance, obligatorio.** Si tras la tercera sigue en `CAMBIOS NECESARIOS`, para y muestra al usuario el veredicto, los hallazgos pendientes y qué se intentó en cada ronda; no lances una cuarta. El tope no es orientativo: no se salta sin autorización explícita del usuario en ese mismo turno, y se anota cualquier desviación en `## Revisiones`.
   - El criterio no cambia entre rondas: misma spec y mismo brief, más los hallazgos. No se ablanda para cerrar el bucle ni se añaden requisitos nuevos que la primera ronda no pidió.
   - **Al cerrar la revisión** (veredicto registrado y empujado), borra la copia: `git worktree remove "<ruta de la copia>"` y `git worktree prune`. Si el comando se niega por ficheros «modificados», comprueba con `git -C "<ruta>" diff --quiet` (exit 0 = solo ruido de finales de línea) y usa `--force` solo en ese caso.

## Rama y PR

Sigue la política de `AGENTS.md` (§ Ramas y PR). El commit de la revisión va a la rama actual; nunca a `main` si el alcance contiene código.
