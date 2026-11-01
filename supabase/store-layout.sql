-- SmartQR: diseño de la carta pública, en 1 columna (foto a la derecha) o en 2 columnas (foto arriba).
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez. La app funciona antes de correrlo
-- (la carta se ve en 1 columna), pero cambiar el diseño falla hasta entonces.

alter table public.profiles
  add column if not exists store_layout text not null default 'list';

alter table public.profiles drop constraint if exists profiles_store_layout_check;
alter table public.profiles
  add constraint profiles_store_layout_check check (store_layout in ('list', 'grid'));
