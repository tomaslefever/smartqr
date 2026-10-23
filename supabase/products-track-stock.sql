-- SmartQR: control de stock opcional por producto.
-- Ejecutar en Supabase > SQL Editor ANTES de desplegar la versión de la app que usa track_stock
-- (esa versión envía la columna al guardar productos y fallaría si no existe).

-- Por defecto los productos no manejan stock: el campo deja de ser obligatorio en el formulario
-- y el stock nunca se muestra en la tienda pública.
alter table public.products
  add column if not exists track_stock boolean not null default false;
