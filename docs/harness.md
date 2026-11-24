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
| Bloque | Días | Rama, PR y despliegue | ¿Qué se puede desplegar junto sin romper nada? |
| Tarea | Horas | Brief, gates y commit | ¿Qué hago ahora y cómo sé que está bien? |

Cada nivel contiene al siguiente y no se salta ninguna puerta.

## 2. Registro de refinamientos

Solo entran decisiones que cambiaron el comportamiento del sistema. Un ajuste de presupuesto, una versión de paquete o una preferencia no entran. `/curar` propone 0–3 filas por tanda; el humano aprueba antes de cambiar una regla.

| Fecha | Origen | Hueco | Decisión | Dónde | Commit |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
| 24-nov | Incidente | Los briefs del coordinador endurecían el protocolo: pedían 2 pasadas y 3 mutaciones en tareas NORMAL, contra `implementer.md` y el `AGENTS.md` del stack, con filtro ancho | El brief no endurece el protocolo: mutaciones y pasadas verdes las fija el nivel (1 y 1 en NORMAL/`[FAST]`; 2 y 2 en `[HARD]` o concurrencia); el filtro son las clases tocadas; si hace falta más evidencia, se sube el nivel de la tarea | `implementar`, `coordinar`, `implementer` | `6b752e5` |

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
