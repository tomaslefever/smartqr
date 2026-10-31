# SmartQR MCP

Servidor [MCP](https://modelcontextprotocol.io) para que un agente (Claude Code, Claude Desktop u otro cliente MCP) administre la carta de un negocio en SmartQR: verla, buscar, agregar y editar productos, cambiar precios, ocultarlos, ponerles imagen y ordenar la carta.

Entra con la cuenta del negocio, igual que el panel. Supabase solo le deja leer y cambiar la carta de esa cuenta (las mismas políticas RLS del panel); no usa claves de administrador.

## Herramientas

| Herramienta | Qué hace | Escribe |
| --- | --- | --- |
| `ver_tienda` | Nombre, contacto, enlace a la tienda y resumen de la carta | No |
| `ver_carta` | La carta en el orden de la tienda (opcional: una categoría) | No |
| `buscar_productos` | Busca en nombre, descripción y categoría, sin importar tildes ni plurales | No |
| `evaluar_retiro` | Propuesta para "bajar todo lo que tiene X" (ver abajo) | No |
| `aplicar_cambios` | Aplica una lista de operaciones confirmadas: ocultar, mostrar, marcar o desmarcar "No disponible", editar | Sí |
| `agregar_producto` | Agrega un producto al inicio de su categoría | Sí |
| `editar_producto` | Cambia nombre, descripción, precio, unidad o categoría | Sí |
| `cambiar_estado` | Oculta, muestra o marca "No disponible" uno o más productos | Sí |
| `cambiar_precios` | Precios uno a uno o en bloque por porcentaje, con `simular` para previsualizar | Sí |
| `agregar_imagen` / `quitar_imagen` | Imagen desde una URL o un archivo local (JPG, PNG, WebP o GIF, hasta 10 MB) | Sí |
| `crear_categoria` / `renombrar_categoria` | Categorías | Sí |
| `ordenar_categorias` / `ordenar_productos` | Orden de la carta, como al arrastrar en el panel | Sí |

Nada se borra: ocultar saca un producto de la tienda pero lo deja en el panel.

## Evaluador de decisiones (`evaluar_retiro`)

Para pedidos como "se acabó el salmón, bájame todo lo que tiene salmón". Revisa cada producto que menciona el término y decide en milisegundos, sin llamar a un modelo, con reglas sobre el texto de la carta:

- **desactivar**: el término es el producto ("Salmón a la plancha") o un ingrediente del plato ("salmón, camarón y pulpo", "salmón + queso crema").
- **editar**: el término es solo una opción ("pollo, salmón o camarón", "tártaro de salmón o atún"). El producto se mantiene y se propone el texto sin esa opción ("pollo o camarón").
- **preguntar**: el término es parte fija de una tabla, promoción o plato para compartir, o el nombre lo ofrece como opción pero la descripción lo usa como ingrediente. Lo decide la persona, entre las opciones que entrega.

### Segunda opinión de Jev

Si el servidor tiene `TYPESAFE_API_KEY`, cada caso pasa además por [Jev](https://docs.typesafe.ai), el modelo de decisiones de TypeSafe AI, siguiendo su patrón reglas → Jev → persona. Jev responde una pregunta cerrada por producto (bajarlo, quitar la opción, preguntar al dueño o no le afecta) con una confianza de 0 a 1, en paralelo y en menos de un segundo por producto:

- Si coincide con las reglas, la decisión se mantiene y la confianza sube a alta (Jev ≥ 0,8).
- Si las reglas dejaron el caso abierto ("preguntar") y Jev está muy seguro (≥ 0,9), Jev lo resuelve, siempre que las reglas tengan cómo ejecutarlo (para editar hace falta el texto reescrito).
- Si no coinciden, o Jev tiene poca confianza (< 0,5), la persona decide: queda en "preguntar" con ambas propuestas, o con la de las reglas.
- Si Jev falla, cada producto conserva la decisión de las reglas y la respuesta lo indica.

Cada decisión dice su `fuente` (`reglas`, `reglas+jev` o `jev`) y trae la respuesta de Jev (decisión, confianza y probabilidades). Sin la clave, decide solo con reglas. Los umbrales siguen la [guía de confianza de TypeSafe](https://docs.typesafe.ai/confidence.md): bajar productos es una acción de alto impacto, así que Jev resuelve por su cuenta solo con confianza muy alta, y de todos modos nada se aplica sin confirmación.

Con `accion: "no_disponible"` propone marcar como agotado en vez de ocultar (mejor si vuelve pronto). La respuesta trae `operaciones_recomendadas` listas para `aplicar_cambios`: el agente muestra la propuesta, pregunta por los casos dudosos y aplica solo lo confirmado.

Las búsquedas no distinguen tildes ni mayúsculas, aceptan plurales ("camarón" encuentra "camarones") y solo encuentran palabras completas ("salmón" no encuentra "salmonete").

## Instalación

Requiere Node.js 20 o superior.

```bash
cd mcp
npm install
npm run build
```

### Variables de entorno

| Variable | Valor |
| --- | --- |
| `SMARTQR_EMAIL` | Correo de la cuenta del negocio en SmartQR |
| `SMARTQR_PASSWORD` | Contraseña de esa cuenta |
| `SMARTQR_URL` (opcional) | Sitio de SmartQR; por defecto `https://smartqr.cl`. De ahí lee la configuración pública de Supabase |
| `SMARTQR_SUPABASE_URL` y `SMARTQR_SUPABASE_ANON_KEY` (opcionales) | Para no leerla del sitio |
| `TYPESAFE_API_KEY` (opcional) | Clave de TypeSafe AI para la segunda opinión de Jev en `evaluar_retiro` |
| `TYPESAFE_MODEL` (opcional) | Modelo de Jev; por defecto `jev-latest` |

### Claude Code

```bash
claude mcp add smartqr \
  -e SMARTQR_EMAIL=negocio@ejemplo.cl \
  -e SMARTQR_PASSWORD='...' \
  -- node /ruta/a/smartqr/mcp/dist/src/index.js
```

### Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "smartqr": {
      "command": "node",
      "args": ["/ruta/a/smartqr/mcp/dist/src/index.js"],
      "env": { "SMARTQR_EMAIL": "negocio@ejemplo.cl", "SMARTQR_PASSWORD": "..." }
    }
  }
}
```

Cada negocio es una instancia del servidor con sus propias credenciales.

## Desarrollo

- `npm run typecheck`: revisa los tipos.
- `npm test`: compila y corre las pruebas del evaluador (`test/`), con productos reales de cartas cargadas en SmartQR y un Jev simulado para cada camino de la combinación.
