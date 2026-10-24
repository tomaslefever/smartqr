-- SmartQR: temas de la carta. Cada tema es una fila: los predefinidos (owner_id null) los puede
-- usar cualquier negocio; los propios (owner_id = usuario) solo los edita su dueño.
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez.

begin;

create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  background_type text not null default 'color' check (background_type in ('color', 'image')),
  background_color text not null default '#F9F9F0' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_image_url text check (background_image_url ~ '^https://[^"''()\\[:space:]]+$'),
  background_image_size integer not null default 200 check (background_image_size between 40 and 600),
  card_color text not null default '#FFFFFF' check (card_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text not null default '#3D3D3D' check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#4A7C59' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint themes_image_required check (background_type = 'color' or background_image_url is not null)
);

create index if not exists themes_owner_id_idx on public.themes (owner_id);

alter table public.themes enable row level security;

-- La tienda pública necesita leer el tema de cualquier negocio
drop policy if exists "Cualquiera puede ver los temas" on public.themes;
create policy "Cualquiera puede ver los temas" on public.themes
  for select to anon, authenticated
  using (true);

drop policy if exists "Usuarios crean sus propios temas" on public.themes;
create policy "Usuarios crean sus propios temas" on public.themes
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Usuarios editan sus propios temas" on public.themes;
create policy "Usuarios editan sus propios temas" on public.themes
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Usuarios eliminan sus propios temas" on public.themes;
create policy "Usuarios eliminan sus propios temas" on public.themes
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Tema en uso de cada tienda (null = estilo por defecto). Si se elimina el tema, vuelve al defecto.
alter table public.profiles
  add column if not exists theme_id uuid references public.themes (id) on delete set null;

create index if not exists profiles_theme_id_idx on public.profiles (theme_id);

-- Un negocio solo puede usar temas predefinidos o propios, no los de otro negocio
create or replace function public.check_profile_theme()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.theme_id is not null and not exists (
    select 1 from public.themes t
    where t.id = new.theme_id and (t.owner_id is null or t.owner_id = new.id)
  ) then
    raise exception 'El tema no existe o pertenece a otro negocio';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_check_theme on public.profiles;
create trigger profiles_check_theme
  before insert or update of theme_id on public.profiles
  for each row execute function public.check_profile_theme();

-- Orden de los temas predefinidos en la galería (los propios se ordenan por fecha de creación)
alter table public.themes add column if not exists sort_order integer;

-- Un nombre por tema predefinido, para poder volver a correr este archivo sin duplicarlos
create unique index if not exists themes_predefined_name_idx on public.themes (name) where owner_id is null;

-- 50 temas predefinidos. Todas las combinaciones que usa la tienda (texto y descripción sobre
-- tarjetas, acento sobre tarjetas, títulos sobre el fondo y categoría seleccionada) cumplen el
-- contraste mínimo WCAG AA de 4.5:1. Volver a correr el archivo actualiza sus colores.
insert into public.themes (owner_id, sort_order, name, background_color, card_color, text_color, accent_color)
select null, v.sort_order, v.name, v.background_color, v.card_color, v.text_color, v.accent_color
from (values
  ( 1, 'Clásico',           '#F9F9F0', '#FFFFFF', '#3D3D3D', '#4A7C59'),
  ( 2, 'Playa',             '#E6F4F7', '#FFFFFF', '#1E3A4C', '#0E7C86'),
  ( 3, 'Minimalista',       '#F4F4F5', '#FFFFFF', '#18181B', '#18181B'),
  ( 4, 'Pastelería',        '#FDF2F4', '#FFFFFF', '#4A2C34', '#C2185B'),
  ( 5, 'Crema',             '#FAF6EF', '#FFFFFF', '#4B3B2F', '#8B5E3C'),
  ( 6, 'Terracota',         '#F7EDE6', '#FFFFFF', '#3F2A21', '#B4512A'),
  ( 7, 'Oliva',             '#F3F4EC', '#FFFFFF', '#2F3524', '#5E6B26'),
  ( 8, 'Lavanda',           '#F4F1FA', '#FFFFFF', '#2E2A3D', '#6D4FB3'),
  ( 9, 'Menta',             '#EAF7F1', '#FFFFFF', '#1F3A2F', '#1A7A50'),
  (10, 'Limón',             '#FFFBE6', '#FFFFFF', '#3A3418', '#8A6700'),
  (11, 'Durazno',           '#FFF1EA', '#FFFFFF', '#4A2E25', '#C2502C'),
  (12, 'Cielo',             '#EEF5FF', '#FFFFFF', '#1C2B45', '#2563EB'),
  (13, 'Rosa vintage',      '#F8EEEE', '#FFFFFF', '#4A3336', '#A8464F'),
  (14, 'Arena',             '#F5EFE4', '#FFFDF8', '#3E3428', '#93622D'),
  (15, 'Nórdico',           '#EEF1F4', '#FFFFFF', '#26303B', '#3E6A8A'),
  (16, 'Papel kraft',       '#E9DCC7', '#F8F1E5', '#3B2F22', '#7E5225'),
  (17, 'Pizarra clara',     '#E5E7EB', '#FFFFFF', '#1F2937', '#374151'),
  (18, 'Jardín',            '#EEF4E8', '#FFFFFF', '#263420', '#3A7535'),
  (19, 'Mediterráneo',      '#F2F7FA', '#FFFFFF', '#14324A', '#1F6FA8'),
  (20, 'Cereza',            '#FDF0F2', '#FFFFFF', '#3A1D23', '#B0123F'),
  (21, 'Mostaza',           '#FBF5E6', '#FFFFFF', '#33291A', '#94620F'),
  (22, 'Salvia',            '#EFF3EE', '#FFFFFF', '#2B3A33', '#4E7060'),
  (23, 'Coral',             '#FFF0EE', '#FFFFFF', '#3D2522', '#C8432E'),
  (24, 'Algodón',           '#F7F4FB', '#FFFFFF', '#3A3046', '#A63F84'),
  (25, 'Heladería',         '#F0FAFB', '#FFFFFF', '#23404A', '#C83E72'),
  (26, 'Desayuno',          '#FFF8EF', '#FFFFFF', '#3C2F23', '#A85600'),
  (27, 'Monocromo',         '#FFFFFF', '#F5F5F5', '#111111', '#111111'),
  (28, 'Retro',             '#F4E9D8', '#FFF8EC', '#2D2A26', '#C0394C'),
  (29, 'Tropical',          '#EFFAF5', '#FFFFFF', '#173B33', '#C2410C'),
  (30, 'Panadería',         '#F6EEE3', '#FFFCF7', '#3F2E1F', '#9A5B23'),
  (31, 'Huerta',            '#F1F6EC', '#FFFFFF', '#283322', '#B04A1F'),
  (32, 'Marinero',          '#F3F6FB', '#FFFFFF', '#13284A', '#C0392B'),
  (33, 'Sandía',            '#F2FAF2', '#FFFFFF', '#203A24', '#D12E5A'),
  (34, 'Vainilla',          '#FBF7EC', '#FFFFFF', '#3A3428', '#6B5B95'),
  (35, 'Café oscuro',       '#2B1D14', '#3B2A1E', '#F5E6D3', '#E0A458'),
  (36, 'Noche',             '#0F172A', '#1E293B', '#E2E8F0', '#38BDF8'),
  (37, 'Carbón',            '#18181B', '#27272A', '#F4F4F5', '#FACC15'),
  (38, 'Bosque',            '#13241B', '#1C3326', '#E6F0E8', '#7BC47F'),
  (39, 'Vino',              '#2A1218', '#3A1A22', '#F5E4E7', '#E58A9B'),
  (40, 'Medianoche',        '#0B1020', '#151B30', '#E3E8F4', '#A78BFA'),
  (41, 'Espresso',          '#1C1410', '#2A1F18', '#EFE3D6', '#D9A066'),
  (42, 'Océano profundo',   '#0B2230', '#12334A', '#E1EEF5', '#4FC3D9'),
  (43, 'Grafito',           '#1F2328', '#2B3036', '#E8EAED', '#FF7A59'),
  (44, 'Chocolate',         '#2A1A12', '#3A251A', '#F3E6DA', '#E8B07A'),
  (45, 'Neón',              '#0D0D12', '#17171F', '#F1F1F7', '#39FF88'),
  (46, 'Pizarra',           '#1E2A32', '#27363F', '#E6EDF1', '#F2A65A'),
  (47, 'Uva',               '#1F1430', '#2B1D42', '#EDE6F7', '#F2B84B'),
  (48, 'Esmeralda',         '#062A23', '#0B3B31', '#E0F2EC', '#F4C95D'),
  (49, 'Burdeos',           '#2B0F14', '#3D1820', '#F6E3E6', '#F0B35B'),
  (50, 'Cacao y menta',     '#241A15', '#33261F', '#F0E6DC', '#6FD3A6')
) as v (sort_order, name, background_color, card_color, text_color, accent_color)
on conflict (name) where owner_id is null do update set
  sort_order = excluded.sort_order,
  background_color = excluded.background_color,
  card_color = excluded.card_color,
  text_color = excluded.text_color,
  accent_color = excluded.accent_color,
  updated_at = now();

-- Columna de una versión anterior de esta función que nunca llegó a producción
alter table public.profiles drop column if exists store_theme;

commit;
