# Instalar figbridge (guía en castellano)

figbridge deja que un agente de IA lea y **escriba** en tu archivo de Figma Desktop, y que
después verifique lo que hizo. No necesita API key ni cambiar de plan: corre un puente local
entre tu terminal y un plugin de desarrollo de Figma.

## Mac

1. Bajá el ZIP y descomprimilo.
2. Doble clic en **`install.command`**.
   Si macOS lo bloquea por "desarrollador no identificado": clic derecho sobre el archivo →
   Abrir → Abrir. Es un script de shell, lo podés leer antes.
3. Se te abre una carpeta. En Figma Desktop: **Plugins → Desarrollo → Importar plugin desde
   manifiesto…** y elegí el `manifest.json` de esa carpeta. Esto se hace una sola vez.

## Windows

1. Bajá el ZIP y descomprimilo.
2. Doble clic en **`install.bat`**.
   Si aparece SmartScreen: Más información → Ejecutar de todas formas.
3. Mismo último paso: **Plugins → Desarrollo → Importar plugin desde manifiesto…**

El instalador deja la herramienta en `~/.figbridge`, agrega el comando `fb` al PATH y arranca
el puente al iniciar sesión. Si no tenés Node.js, te lo instala.

## Todos los días

Abrí Figma y andá a **Plugins → Desarrollo → Figma Desktop Bridge**. Ese es el único paso a
mano: Figma no permite que un plugin se lance solo. `fb start` te abre Figma y chequea el
resto.

```
fb status     # ¿está el puente arriba y el plugin conectado?
fb doctor     # revisa todas las piezas cuando algo falla
```

## Armar un proyecto

En la carpeta donde trabajás:

```
fb init --url "https://www.figma.com/design/XXXX/Mi-Archivo"
fb tokens --write      # con el archivo abierto en Figma
```

`fb tokens --write` lee la paleta, la escala tipográfica, las fuentes y las alturas de
control **de tu propio archivo** y las guarda en `figbridge.json`. Así `fb lint` controla
contra tu sistema de diseño y no contra uno ajeno.

En `nodes` podés ponerle nombre a los ids, y después escribir `fb lint home checkout` en vez
de acordarte de `14:2687`.

## El ciclo que conviene

1. `fb tree <id>` — leer la pantalla antes de tocarla
2. `fb snap <ids>` — inventario: reacciones, botones visibles y nodos
3. escribir el script, `fb scan` y `fb exec`
4. `fb diff <ids>` — tiene que dar idéntico si no querías romper nada
5. `fb lint <ids>` — tiene que dar limpio, o explicás por qué no

Contar sólo las reacciones no alcanza: un botón puede desaparecer sin que cambie ninguna.
Por eso el snapshot cuenta las tres cosas.

## Conectarlo a los agentes

En Claude Code, `.mcp.json`:

```json
{ "mcpServers": { "figbridge": { "command": "fb", "args": ["mcp"] } } }
```

En opencode, `opencode.json`:

```json
{ "mcp": { "figbridge": { "type": "local", "command": ["fb", "mcp"], "enabled": true } } }
```

Podés tener varios agentes trabajando a la vez: cada uno levanta su `fb mcp` y todos hablan
con el mismo puente.

## Si algo no anda

| Síntoma | Qué hacer |
|---|---|
| `fb: command not found` | Abrí una terminal nueva; el PATH se actualiza recién ahí |
| `plugin NOT connected` | Abrí Figma y lanzá el plugin desde Plugins → Desarrollo |
| El plugin no está en el menú | `fb plugin` y volvé a importar el `manifest.json` |
| El puente no levanta | `fb doctor` y después `fb log` |
| Nada responde | `fb restart` |
