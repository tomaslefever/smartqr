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

-- Temas predefinidos (solo se insertan si no existen)
insert into public.themes (owner_id, name, background_color, card_color, text_color, accent_color)
select null, v.name, v.background_color, v.card_color, v.text_color, v.accent_color
from (values
  ('Clásico',      '#F9F9F0', '#FFFFFF', '#3D3D3D', '#4A7C59'),
  ('Café oscuro',  '#2B1D14', '#3B2A1E', '#F5E6D3', '#E0A458'),
  ('Playa',        '#E6F4F7', '#FFFFFF', '#1E3A4C', '#0E7C86'),
  ('Minimalista',  '#F4F4F5', '#FFFFFF', '#18181B', '#18181B'),
  ('Pastelería',   '#FDF2F4', '#FFFFFF', '#4A2C34', '#C2185B')
) as v (name, background_color, card_color, text_color, accent_color)
where not exists (
  select 1 from public.themes t where t.owner_id is null and t.name = v.name
);

-- Columna de una versión anterior de esta función que nunca llegó a producción
alter table public.profiles drop column if exists store_theme;

commit;
