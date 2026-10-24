-- SmartQR: estilo de la carta por negocio (fondo, color de tarjetas, texto y acento).
-- Se guarda como JSON en el perfil, que la tienda pública ya puede leer.
-- Se puede ejecutar antes o después del deploy: sin la columna la tienda usa el estilo por
-- defecto y solo falla guardar el estilo. Se puede correr más de una vez.
alter table public.profiles
  add column if not exists store_theme jsonb;
