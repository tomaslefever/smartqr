-- SmartQR: control de stock opcional y marca rápida "Sin stock" por producto.
-- Ejecutar en Supabase > SQL Editor ANTES de desplegar la versión de la app que usa estas columnas
-- (esa versión las envía al guardar productos y fallaría si no existen). Se puede correr más de una vez.

-- Control de stock opcional: apagado por defecto, así el stock no es obligatorio.
-- El stock nunca se muestra en la tienda pública, solo en el panel.
alter table public.products
  add column if not exists track_stock boolean not null default false;

-- Marca manual "Sin stock": la tienda muestra el producto como "No disponible".
alter table public.products
  add column if not exists out_of_stock boolean not null default false;
