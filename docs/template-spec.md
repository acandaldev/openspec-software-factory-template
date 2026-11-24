---
type: Proceso
hint: alcance, bootstrap, comandos y módulo wiki
---

# Especificación del template

Este repositorio **es** el template. El sitio público vive en
<https://github.com/acandaldev/openspec-software-factory> y la versión publicada
se etiqueta como release.

## 1. Alcance de la v0.1

La v0.1 es un template OpenCode-only para proyectos que ya usan OpenSpec. Incluye:

- contrato genérico en `AGENTS.md` con placeholders;
- agentes `implementer`, `reviewer` y `openspec-reviewer`;
- comandos `/implementar`, `/revisar`, `/coordinar`, `/curar` y `/openspec-review`;
- `scripts/docs-sync.mjs` y sus tests;
- `scripts/check-secrets.mjs`;
- `bootstrap.mjs` para sustituir placeholders y generar `harness.config.json`;
- `template.json` como manifiesto legible por máquina;
- workflow de documentación y harness;
- `docs/harness.md` como registro de decisiones;
- `MEMORY.md`, `opencode.jsonc` y `data/forbidden.json`.

No incluye la web, los datos del proyecto de origen ni un segundo harness.

## 2. Bootstrap

`node bootstrap.mjs` pide o recibe por flags:

- nombre, slug y descripción;
- stack y directorios de código;
- comandos de build, tests y formato;
- modelos de implementación y revisión por nivel;
- directorio de copias de revisión y rama principal.

Sustituye los placeholders de `AGENTS.md`, agentes y `revisar.md`, escribe
`harness.config.json` y valida con `docs-sync --check` y `check-secrets`.

## 3. Comandos

La tabla de comandos, cuándo se usan y qué hacen vive en `README.md` § Comandos.
Este spec no la duplica: si cambia un comando, se actualiza el README y
`template.json`; este documento solo cambia si varía el alcance.

## 4. Módulo wiki (opcional)

La wiki no es una pieza del método. Se activa solo si el proyecto acumula fuentes
externas y necesita trazabilidad:

```text
raw/       fuentes inmutables
wiki/      páginas generadas
index.md   catálogo que se lee primero
log.md     historial append-only
```

El lint determinista (enlaces, frontmatter, huérfanas, fuentes inexistentes) es
lo único que puede bloquear CI. Las contradicciones semánticas las revisa una
persona. En la v0.1 la wiki queda fuera; se especifica aquí para no olvidar el
diseño.

## 5. Módulo CodeGraph (opcional)

`opencode.jsonc` declara el servidor MCP `codegraph` con `disabled: true` y
`codemode: false`. El template no instala el binario, no lo añade a
`package.json` y no lo usa en CI ni en los gates.

Para activarlo: `npm install -g @colbymchenry/codegraph`, poner
`disabled: false`, indexar cada directorio con `codegraph init . --yes` y pasar
`projectPath` en cada consulta. Sin índice propio, los agentes usan `grep` y
`read`; `codegraph` sin `projectPath` devuelve el árbol principal.

La guía operativa vive en `docs/codegraph.md`.

## 6. Fuera de la v0.1

- Segundo harness y adaptadores.
- Wiki implementada y lint semántico.
- Herramientas de diagnóstico personal.
- Datos, dominios, rutas o secretos de cualquier proyecto.
- Un panel de métricas; la traza vive en git y en `tasks.md`.

## 7. Criterios de aceptación

1. Un proyecto nuevo puede copiar el template, ejecutar `bootstrap` y pasar
   `docs-sync --check` y `check-secrets`.
2. `AGENTS.md` no conserva placeholders después del bootstrap.
3. `docs/index.md` se genera desde el frontmatter de `docs/`.
4. `/curar` tiene un registro donde escribir y no cambia reglas sin aprobación.
5. El template no contiene datos del proyecto de origen.
6. `template.json` coincide con `package.json` y con los comandos y agentes existentes.
