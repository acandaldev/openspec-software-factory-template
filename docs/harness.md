---
type: Proceso
hint: bucles, registro de refinamientos y mantenimiento del harness
stale_after: 2027-05-31
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

## 5. Candidatos a plantilla

Lo que este proyecto descubra y sea genérico se propone al template público:

- comandos o agentes que resuelvan un fallo repetido;
- reglas de `AGENTS.md` que eviten un incidente;
- scripts con un consumidor claro en CI;
- documentos de `docs/` que sirvan a cualquier proyecto.

## 6. Cómo se mantiene

- Al cerrar un bloque, si hubo incidente o patrón.
- Una vez por semana, leyendo paradas, deltas y causas.
- Al cerrar un cambio, antes de archivar.

La cadencia recomendada es una revisión humana. No hay un cron que cure: el cron semanal solo valida la documentación.
