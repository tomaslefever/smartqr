# SmartQR

Ver el README para la configuración, los comandos y el despliegue.

## Antes de pushear

- Corre `npm run typecheck` y `npm run build`.
- Si un cambio usa columnas o tablas nuevas, agrega el SQL en `supabase/` y avisa que hay que ejecutarlo antes de desplegar.

## Deploy

Producción corre en Easypanel desde la rama `main`. Después de cada push a `main`, lanza el deploy:

```bash
curl -sS -X POST -x "$HTTPS_PROXY" --proxytunnel "$EASYPANEL_DEPLOY_URL"
```

- `EASYPANEL_DEPLOY_URL` es una variable de entorno del entorno cloud. Nunca escribas la URL en el repo: es público y la URL permite desplegar.
- La URL es `http://` en el puerto 3000; en las sesiones cloud solo sale a través del proxy con `--proxytunnel`.
- Si la variable no está definida, avisa en vez de saltarte el deploy en silencio.
