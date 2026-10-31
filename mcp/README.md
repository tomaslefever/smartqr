# SmartQR MCP

Servidor [MCP](https://modelcontextprotocol.io) para que un agente administre la carta de un negocio en SmartQR: verla, buscar, agregar y editar productos, cambiar precios, ocultarlos, ponerles imagen y ordenar la carta.

Funciona de dos maneras, con las mismas herramientas:

- **Agente de WhatsApp (HTTP)**: un servicio en Easypanel al que se conecta un agente de WhatsApp por URL con un token. Atiende a todos los negocios: cada uno vincula su número de WhatsApp con un código que genera en el panel. Ver [Agente de WhatsApp](#agente-de-whatsapp-http).
- **Local (stdio)**: para un solo negocio, desde Claude Code o Claude Desktop en el computador del dueño. Entra con la cuenta del negocio y Supabase solo le deja tocar esa carta (las mismas políticas RLS del panel). Ver [Instalación local](#instalación-local).

## Herramientas

| Herramienta | Qué hace | Escribe |
| --- | --- | --- |
| `vincular_whatsapp` / `estado_whatsapp` / `desvincular_whatsapp` | Solo en HTTP: vincula el número de quien escribe con un código del panel, lo consulta o lo quita | Sí / No / Sí |
| `ver_tienda` | Nombre, contacto, enlace a la tienda y resumen de la carta | No |
| `ver_carta` | La carta en el orden de la tienda (opcional: una categoría) | No |
| `buscar_productos` | Busca en nombre, descripción y categoría, sin importar tildes ni plurales | No |
| `evaluar_retiro` | Propuesta para "bajar todo lo que tiene X" (ver abajo) | No |
| `aplicar_cambios` | Aplica una lista de operaciones confirmadas: ocultar, mostrar, marcar o desmarcar "No disponible", editar | Sí |
| `sugerir_categoria` | Sugiere en qué categoría va un producto nuevo (ver abajo) | No |
| `agregar_producto` | Agrega un producto al inicio de su categoría; sin categoría no crea nada y sugiere (ver abajo) | Sí |
| `editar_producto` | Cambia nombre, descripción, precio, unidad o categoría | Sí |
| `cambiar_estado` | Oculta, muestra o marca "No disponible" uno o más productos | Sí |
| `cambiar_precios` | Precios uno a uno o en bloque por porcentaje, con `simular` para previsualizar | Sí |
| `agregar_imagen` / `quitar_imagen` | Imagen desde una data URL en base64 (una foto recibida por WhatsApp), una URL https o, en local, un archivo (JPG, PNG, WebP o GIF, hasta 10 MB) | Sí |
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

## Categoría de un producto nuevo

Si se pide agregar un producto sin decir su categoría, `agregar_producto` no lo crea: devuelve las categorías más probables y una pregunta lista para la persona. El agente pregunta y vuelve a llamar con la elegida, o con `sin_categoria: true` si la persona lo quiere así.

Las sugerencias salen de la propia carta: palabras en común con el nombre de cada categoría y con sus productos. La primera palabra del nombre pesa más, porque dice qué plato es ("**Lomo** a lo pobre" va en Carnes y no en el acompañamiento "A lo pobre"); la descripción pesa poco, porque lista ingredientes que muchas categorías comparten; y las palabras que aparecen en todas partes cuentan menos. Si ninguna categoría destaca (empate o coincidencia débil), pregunta sin sugerir una por defecto. Con `TYPESAFE_API_KEY`, Jev también elige entre las categorías (o "ninguna"): si está seguro (≥ 0,6), su elección va primero.

## Agente de WhatsApp (HTTP)

### Cómo se vincula un número

1. En el panel de SmartQR, el negocio entra a **Agente de WhatsApp** y genera un código, por ejemplo `K7PM-4RXT`. Vence a los 10 minutos y sirve una sola vez; el panel tiene un botón para enviarlo por WhatsApp al número del agente (`WHATSAPP_NUMBER` de la web).
2. El negocio le manda el código al agente por WhatsApp.
3. El agente llama a `vincular_whatsapp` con el número de quien escribe y el código. Desde ahí, cada herramienta que el agente llame con ese número opera la carta de esa cuenta. El panel muestra el número vinculado y permite desvincularlo.

Un número maneja una sola cuenta; si se vincula a otra, pasa a la nueva. Una cuenta puede tener varios números.

### Seguridad

- **Token del agente**: todo `/mcp` exige `Authorization: Bearer <MCP_TOKEN>`. Quien tiene el token puede actuar por cualquier número vinculado, así que el token es del agente de WhatsApp y de nadie más.
- **El número lo pone el agente**: cada herramienta recibe `telefono`, que el agente toma del remitente del mensaje en WhatsApp, nunca del texto que escribe la persona.
- **Clave de servicio**: el servidor usa la clave `service_role` de Supabase, que salta las políticas RLS; por eso cada consulta filtra por la cuenta vinculada al número (las pruebas lo verifican). Solo vive en las variables del servicio en Easypanel.
- **Códigos**: 8 caracteres de un alfabeto de 32 (≈ 40 bits), 10 minutos, un solo uso, guardados solo como hash. Generarlos exige sesión en el panel; canjearlos, la clave de servicio.
- **Imágenes**: en HTTP solo se aceptan data URLs y URLs https; nunca archivos del servidor.

### Preparar Supabase

Ejecuta [`supabase/whatsapp-agent.sql`](../supabase/whatsapp-agent.sql) en el SQL Editor (tablas `whatsapp_links` y `whatsapp_link_codes` y sus funciones). Sin esto, la página del panel avisa que el agente no está habilitado y `vincular_whatsapp` falla.

### Desplegar en Easypanel

1. Crea un servicio **App** nuevo, conectado a este repositorio y a la rama `main`.
2. En **Build**, elige **Dockerfile**, con **Build Path** `/mcp` (usa [`mcp/Dockerfile`](Dockerfile)).
3. En **Environment**, define:

   | Variable | Valor |
   | --- | --- |
   | `MCP_TOKEN` | Token del agente, al menos 32 caracteres al azar (por ejemplo `openssl rand -hex 32`) |
   | `SUPABASE_URL` | URL del proyecto, la misma de la web |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (*Project Settings → API*). No es la clave `anon` |
   | `SMARTQR_URL` (opcional) | Sitio de las tiendas; por defecto `https://smartqr.cl` |
   | `TYPESAFE_API_KEY` (opcional) | Para la segunda opinión de Jev |

4. En **Domains**, apunta un dominio (por ejemplo `mcp.smartqr.cl`) al puerto **3000**. El healthcheck es `/healthz`.

### Conectar el agente

URL del servidor MCP: `https://mcp.smartqr.cl/mcp`, transporte **Streamable HTTP**, con el header `Authorization: Bearer <MCP_TOKEN>`. El servidor no guarda sesiones: cada solicitud es independiente. En cada herramienta, el agente envía en `telefono` el número del remitente tal como lo entrega WhatsApp (`+56912345678`, `56912345678` o `56912345678@s.whatsapp.net`).

## Instalación local

Requiere Node.js 20 o superior.

```bash
cd mcp
npm install
npm run build
```

### Variables de entorno (local)

| Variable | Valor |
| --- | --- |
| `SMARTQR_EMAIL` | Correo de la cuenta del negocio en SmartQR |
| `SMARTQR_PASSWORD` | Contraseña de esa cuenta |
| `SMARTQR_URL` (opcional) | Sitio de SmartQR; por defecto `https://smartqr.cl`. De ahí lee la configuración pública de Supabase |
| `SMARTQR_SUPABASE_URL` y `SMARTQR_SUPABASE_ANON_KEY` (opcionales) | Para no leerla del sitio |
| `TYPESAFE_API_KEY` (opcional) | Clave de TypeSafe AI para la segunda opinión de Jev en `evaluar_retiro` y las sugerencias de categoría |
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
- `npm test`: compila y corre las pruebas (`test/`): el evaluador y las sugerencias de categoría con productos reales de cartas cargadas en SmartQR y un Jev simulado, y el servidor HTTP contra un Supabase simulado (token, vínculo con código, filtro por cuenta, fuentes de imagen).
- `npm start`: el servidor HTTP (`dist/src/http.js`), con las variables de Easypanel.
