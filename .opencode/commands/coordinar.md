---
description: "Encadena las tareas listas de un bloque de un cambio OpenSpec delegando en implementer y reviewer, con paradas tasadas"
---

Coordina el bloque indicado de un cambio OpenSpec de principio a fin, sin pedir confirmación entre tareas.

Argumentos: `$ARGUMENTS` (`<cambio> <bloque>`; ejemplo: `notas 1`).

## Reglas de esta sesión (coordinador)

1. **No implementes ni revises aquí.** Delega siempre en `implementer` y `reviewer` con el mismo brief y los mismos gates que `/implementar` y `/revisar`; esta sesión escribe el brief, verifica y encadena.
2. **El orden lo da el plan, no la memoria**: `node scripts/docs-sync.mjs --plan <cambio>` y toma, en orden, las tareas con `bloque == <bloque>`, `estado: pendiente` y todas sus `deps` en `hecha`. Si el plan falla (ciclo, dependencia rota), PARA y muestra el error.
3. **Antes de empezar**: worktree del bloque limpio y al día con `main`; si no lo está, PARA y dilo. No abras un carril nuevo.
4. **Nivel de cada tarea**: `[HARD]` 1 a 1 · NORMAL 1–3 · `[FAST]` 3–5. No mezcles niveles en un lote: el modelo lo fija el nivel más alto.
5. **Bucle por tarea**: brief con las claves `Brief-*` → `implementer` → gates post-reversión → commit en el worktree → push y espera del CI según `AGENTS.md` → siguiente tarea. Revisión: `[HARD]` tras cada tarea; NORMAL y `[FAST]` al cerrar el bloque, antes de la PR (excepción: el primer lote del carril se revisa antes de seguir); si el veredicto es `CAMBIOS NECESARIOS`, delta al implementer vivo (máx. 3 rondas, tope obligatorio). El brief no endurece el protocolo: las mutaciones y pasadas verdes las fija `implementer.md` según el nivel; si hace falta más evidencia, sube el nivel de la tarea, no la cifra.
6. **Paradas**: informa con una línea de motivo y termina el bucle.
   - Tarea `[HARD]` recién revisada (no encadenes la siguiente sin que el usuario la vea).
   - Tercera ronda de `CAMBIOS NECESARIOS` en la misma tarea (tope obligatorio de `revisar`: no se lanza una cuarta sin autorización del usuario).
   - `permission.rejected` o permiso que necesita al usuario.
   - Hallazgo que no está en el plan (triaje: `Ahora`, `Bloque`, `Después`, `Fuera`).
   - Fichero de un dominio en colisión con otro carril.
   - CI en rojo que el reintento no arregla.
   - Fin del bloque.
   - Umbral de contexto: checkpoint en `MEMORY.md` al 75–80 %, parar al 85–87 %.
7. **Al cerrar el bloque**: revisión pendiente del bloque para NORMAL/`[FAST]`, suite completa, `node scripts/docs-sync.mjs`, push, y pregunta si abrir el PR. No edites `MEMORY.md` a mano; las cifras las ajusta `docs-sync`.
8. **Salida**: una línea por tarea (id, nivel, modelo, resultado, coste) y, al final, qué tareas quedan pendientes del bloque y por qué se paró.
