-- SmartQR: ocultar y mostrar categorías completas sin borrarlas.
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez. La app funciona antes de correrlo
-- (todas las categorías se ven), pero ocultar una categoría falla hasta entonces.

-- Categoría oculta: sigue en el panel con sus productos, pero ni ella ni sus productos aparecen en la
-- tienda pública. Mostrarla de nuevo devuelve sus productos activos tal como estaban.
alter table public.categories
  add column if not exists active boolean not null default true;
