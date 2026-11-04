# SmartQR

Panel para que negocios administren su inventario de productos y compartan una tienda pública mediante un código QR. Hecho con React + Vite + Tailwind, con Supabase como backend (autenticación, base de datos y almacenamiento de imágenes).

## Requisitos

- Node.js 20 o superior
- Un proyecto de Supabase con:
  - Tablas `products` y `profiles` con sus políticas RLS.
  - Un bucket de Storage **público** llamado `product-images`, con las políticas de
    [`supabase/storage-policies.sql`](supabase/storage-policies.sql).
  - Las migraciones de [`supabase/`](supabase/), ejecutadas en el SQL Editor en este orden
    (todas se pueden volver a correr sin problema):
    1. `storage-policies.sql`
    2. `products-stock.sql`
    3. `themes.sql`
    4. `products-active.sql`
    5. `products-position.sql`
    6. `categories.sql`
    7. `whatsapp-agent.sql` (agente de WhatsApp; ver [smart-qr-mcp](https://github.com/tomaslefever/smart-qr-mcp))
    8. `categories-active.sql` (ocultar y mostrar categorías)
    9. `store-layout.sql` (diseño de la carta en 1 o 2 columnas)
    10. `whatsapp-orders.sql` (pedidos por WhatsApp desde la carta)
    11. `whatsapp-cloud.sql` (conexión con la API de WhatsApp Business; ver [WhatsApp Business y sistema de lealtad](#whatsapp-business-y-sistema-de-lealtad))
    12. `loyalty.sql` (sistema de lealtad; requiere `whatsapp-cloud.sql`)

## Configuración

La app necesita dos valores de tu proyecto de Supabase (*Project Settings → API*) y, opcionalmente, el número del asistente de WhatsApp:

| Producción (Docker, `npm start`) | Desarrollo (`npm run dev`) | Valor |
| --- | --- | --- |
| `SUPABASE_URL` | `VITE_SUPABASE_URL` | URL del proyecto, p. ej. `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` | Clave `anon` (pública) |
| `WHATSAPP_NUMBER` (opcional) | `VITE_WHATSAPP_NUMBER` | Número del asistente de WhatsApp, con código de país y sin `+`, p. ej. `56912345678`. Sin él, la landing no muestra los botones de WhatsApp |
| `PORT` (opcional, por defecto `3000`) | | Puerto HTTP del servidor |

Para la conexión con WhatsApp Business y el sistema de lealtad, el servidor necesita además estas variables. Solo las lee `server.js` y nunca llegan al navegador: no les pongas el prefijo `VITE_`. `npm start` las toma de un archivo `.env` (ignorado por git; ver [`.env.example`](.env.example)). En Easypanel van en **Environment**.

| Variable | Valor |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` de Supabase (*Project Settings → API*). Guarda y lee los tokens de WhatsApp |
| `META_APP_ID` | ID de la app de Meta de SmartQR. Sirve para comprobar que el token que pega cada negocio es de esta app |
| `META_APP_SECRET` | Secreto de la app de Meta. Con él se comprueba la firma de cada webhook |
| `META_WEBHOOK_VERIFY_TOKEN` | Un texto que inventas y pegas en Meta al configurar el webhook |
| `META_GRAPH_VERSION` (opcional) | Versión de la Graph API, por defecto `v24.0` |

En producción los valores se leen **al arrancar** el servidor, no al compilar: la misma imagen sirve para cualquier entorno y basta con cambiar las variables y reiniciar.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

Otros comandos:

- `npm run typecheck`: revisa los tipos con TypeScript.
- `npm run build`: genera el build de producción en `dist/`.
- `npm start`: sirve `dist/` con `server.js` (requiere `npm run build` antes).

`npm run dev` solo levanta Vite: la API de WhatsApp (`/api/...`) vive en `server.js`, así que para probar la conexión o los avisos de lealtad usa `npm run build` y `npm start`.

## WhatsApp Business y sistema de lealtad

El menú **WhatsApp** del panel reúne la conexión del número del negocio y sus funciones, que se activan por separado:

- **Pedir por WhatsApp** (sin API): los clientes arman su pedido en la carta y se abre WhatsApp con el mensaje para el número que indiques. Es un link `wa.me`: el pedido llega como un mensaje directo y el negocio lo atiende desde la app de su teléfono. Por eso no conviene usar el número conectado a la Cloud API, que deja de funcionar en la app (el panel lo advierte).
- **Sistema de lealtad** (con API, menú propio): una tarjeta de sellos. Se puede entrar siempre, pero para activarlo hay que tener WhatsApp conectado (la base de datos lo exige). Los clientes se inscriben escribiendo "sellos" al número conectado (la carta muestra un botón que lo deja escrito). El webhook los registra con su número y les responde cuántos sellos llevan. El negocio les suma sellos y canjea premios desde el panel, y cada movimiento les llega por WhatsApp. Desconectar WhatsApp apaga el programa.
- **Agente de WhatsApp**: el agente de [smart-qr-mcp](#servidor-mcp) para cambiar la carta por chat.

### Configurar la app de Meta (una vez)

1. En [developers.facebook.com](https://developers.facebook.com) usa (o crea) una app de tipo Business con el producto **WhatsApp**.
2. Copia su ID y su secreto (*Configuración → Básica*) en `META_APP_ID` y `META_APP_SECRET`. Inventa un `META_WEBHOOK_VERIFY_TOKEN`.
3. En *WhatsApp → Configuración*, configura el webhook. URL de devolución de llamada: `https://tu-dominio/api/whatsapp/webhook`. Token de verificación: el mismo `META_WEBHOOK_VERIFY_TOKEN`. Suscríbete al campo **messages**.

### Conectar el número de un negocio

En el panel: **WhatsApp → Configurar manualmente**, con el Phone Number ID, el WABA ID, el token de un System User y el PIN de verificación en dos pasos. El token tiene que ser de un System User con control total sobre la cuenta de WhatsApp y con la app de SmartQR asignada, porque Meta envía los mensajes al webhook de la app dueña del token. Al guardar, el servidor hace lo siguiente:

1. Comprueba el token (y que sea de `META_APP_ID`), que el número exista y que pertenezca al WABA.
2. Suscribe la app al WABA (`subscribed_apps`) para que los mensajes lleguen al webhook.
3. Registra el número en la Cloud API con el PIN, si aún no lo estaba.
4. Guarda la conexión. El token queda en `whatsapp_connections`, que solo lee la clave de servicio.

Ojo: un número registrado en la Cloud API deja de funcionar en la app WhatsApp Business del teléfono, salvo que esté en modo coexistencia.

WhatsApp solo deja enviar mensajes libres hasta 24 horas después del último mensaje del cliente. Pasado ese plazo el sello se suma igual, pero el aviso no se envía, y el panel lo indica.

## Servidor MCP

El servidor MCP está en su propio repositorio, [tomaslefever/smart-qr-mcp](https://github.com/tomaslefever/smart-qr-mcp). Sirve para que un agente administre la carta de un negocio: buscar, agregar y editar productos, cambiar precios, ocultarlos, ponerles imagen, ordenar la carta y evaluar qué bajar cuando se acaba un ingrediente. Funciona en local para un negocio, o como servicio HTTP en Easypanel para el agente de WhatsApp: cada negocio vincula su número con un código que genera en el panel (menú **WhatsApp**, sección *Agente de WhatsApp*). Se despliega como un servicio aparte en Easypanel; ver su README. La migración [`supabase/whatsapp-agent.sql`](supabase/whatsapp-agent.sql) también está copiada allá: si cambias una, cambia la otra.

## Animaciones (React Bits)

Las animaciones y efectos vienen de [React Bits](https://reactbits.dev), en su variante TypeScript + Tailwind. Los componentes se copian tal cual en [`components/reactbits/`](components/reactbits/) y [`components/effects.tsx`](components/effects.tsx) los adapta a los colores del panel. Para sumar otro, copia su archivo desde `https://reactbits.dev/r/<Nombre>-TS-TW.json` (campo `files[].content`) a esa carpeta e instala las dependencias que indique (`motion`, `gsap`).

Todos respetan la preferencia del sistema de reducir el movimiento.

## Docker

```bash
docker build -t smartqr .
docker run -p 3000:3000 \
  -e SUPABASE_URL=https://xxxx.supabase.co \
  -e SUPABASE_ANON_KEY=tu-anon-key \
  smartqr
```

La imagen expone el puerto `3000`, corre como usuario sin privilegios y tiene un healthcheck en `/healthz`.

## Despliegue en Easypanel

1. Crea un servicio de tipo **App** y conéctalo a este repositorio y a la rama que quieras desplegar.
2. En **Build**, elige **Dockerfile** (ruta: `Dockerfile`).
3. En **Environment**, define `SUPABASE_URL` y `SUPABASE_ANON_KEY` y, para WhatsApp y el sistema de lealtad, `SUPABASE_SERVICE_ROLE_KEY`, `META_APP_ID`, `META_APP_SECRET` y `META_WEBHOOK_VERIFY_TOKEN`.
4. En **Domains**, apunta tu dominio al puerto **3000**.
5. Haz deploy.

### Después del primer deploy

En Supabase, ve a *Authentication → URL Configuration* y agrega tu dominio como **Site URL** y en **Redirect URLs**. Sin esto, el inicio de sesión con Google y los correos de confirmación redirigen a una URL equivocada.

El QR de la tienda se genera con la URL desde la que abres el panel, así que descárgalo desde el dominio de producción, no desde `localhost`.
