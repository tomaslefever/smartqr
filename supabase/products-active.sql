-- SmartQR: activar o desactivar productos sin borrarlos.
-- Ejecutar en Supabase > SQL Editor ANTES de desplegar la versión de la app que usa esta columna
-- (esa versión la envía al guardar productos y fallaría si no existe). Se puede correr más de una vez.

-- Producto desactivado: sigue en el panel, pero no aparece en la tienda pública.
alter table public.products
  add column if not exists active boolean not null default true;
