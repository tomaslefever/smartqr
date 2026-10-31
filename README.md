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
    7. `whatsapp-agent.sql` (agente de WhatsApp; ver [`mcp/README.md`](mcp/README.md))

## Configuración

La app necesita dos valores de tu proyecto de Supabase (*Project Settings → API*) y, opcionalmente, el número del asistente de WhatsApp:

| Producción (Docker, `npm start`) | Desarrollo (`npm run dev`) | Valor |
| --- | --- | --- |
| `SUPABASE_URL` | `VITE_SUPABASE_URL` | URL del proyecto, p. ej. `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` | Clave `anon` (pública) |
| `WHATSAPP_NUMBER` (opcional) | `VITE_WHATSAPP_NUMBER` | Número del asistente de WhatsApp, con código de país y sin `+`, p. ej. `56912345678`. Sin él, la landing no muestra los botones de WhatsApp |
| `PORT` (opcional, por defecto `3000`) | | Puerto HTTP del servidor |

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

## Servidor MCP

[`mcp/`](mcp/) tiene un servidor MCP para que un agente administre la carta de un negocio: buscar, agregar y editar productos, cambiar precios, ocultarlos, ponerles imagen, ordenar la carta y evaluar qué bajar cuando se acaba un ingrediente. Funciona en local para un negocio, o como servicio HTTP en Easypanel para el agente de WhatsApp: cada negocio vincula su número con un código que genera en el panel (menú **Agente de WhatsApp**). Se despliega aparte; ver [`mcp/README.md`](mcp/README.md).

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
3. En **Environment**, define `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. En **Domains**, apunta tu dominio al puerto **3000**.
5. Haz deploy.

### Después del primer deploy

En Supabase, ve a *Authentication → URL Configuration* y agrega tu dominio como **Site URL** y en **Redirect URLs**. Sin esto, el inicio de sesión con Google y los correos de confirmación redirigen a una URL equivocada.

El QR de la tienda se genera con la URL desde la que abres el panel, así que descárgalo desde el dominio de producción, no desde `localhost`.
