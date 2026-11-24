---
type: Guía
hint: módulo opcional de exploración de código con CodeGraph
---

# CodeGraph (opcional)

CodeGraph indexa el código y lo expone por MCP. El template lo trae configurado en
`opencode.jsonc` pero **desactivado**: no es una dependencia del núcleo, no se
instala con `npm install` del proyecto y ningún gate ni test lo necesita.

## Cuándo activarlo

- El proyecto es grande y localizar símbolos con `grep` se vuelve caro.
- Trabajas en un worktree estable y puedes pagar un índice local.
- No lo actives para cambios pequeños, revisiones `delta` de ≤3 ficheros o
  lectura de un símbolo concreto: `grep -n` y `read` son más baratos.

## Instalación

```bash
npm install -g @colbymchenry/codegraph
codegraph --version
```

El binario debe estar en el `PATH` del usuario que ejecuta OpenCode.

## Activar

En `opencode.jsonc`, cambia `"disabled": true` por `"disabled": false`.
`codemode: false` expone las herramientas como `codegraph_explore` y
`codegraph_node` en vez de agruparlas bajo Code Mode.

```bash
opencode mcp list
```

OpenCode recarga la configuración al guardar; si no, `/reload`.

## Indexar

El índice es **por directorio**. No se hereda entre el árbol principal, los
worktrees y las copias de revisión.

```bash
codegraph init . --yes   # ~20-30 s y ~30-40 MB
codegraph status .       # comprobar que existe y está al día
```

`.codegraph/` está ignorado por git: el índice no se versiona. Al borrar el
worktree se va con él. Para eliminarlo a mano: `codegraph uninit .`.

## Usar

- **Worktree o copia con `.codegraph/`**: `codegraph_explore` con
  `projectPath` apuntando a ese directorio. Sin `projectPath`, la consulta cae
  al árbol principal y puede devolver código que no existe en la rama.
- **Sin índice**: `grep -n` y `read` sobre las rutas del brief. No uses
  `codegraph` «por si acaso».
- **Árbol principal**: útil para explorar un área sin rutas conocidas; ruidoso
  para leer un símbolo concreto.
- Una llamada, no una cadena. Si la herramienta lo admite, limita `maxFiles`
  (≤3).
- No metas la salida de `codegraph` en el brief: caduca con el primer commit y
  cuesta los mismos tokens.

## Coste y límites

- Indexar tarda ~20-30 s y ocupa ~30-40 MB por worktree.
- El índice sigue el estado del worktree, incluidos ficheros sin commitear.
- Un worktree sin índice no falla: devuelve el árbol principal. Ese es el error
  caro.
- No lo ejecutes en CI ni lo añadas a `package.json`.

## Referencia

La medición que originó esta regla no se copia aquí. Si tu proyecto mide el
coste, guárdalo en `docs/` y enlázalo desde `docs/index.md`.
