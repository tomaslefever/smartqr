-- SmartQR: vincular números de WhatsApp con una cuenta, para el agente de WhatsApp (servidor MCP en mcp/).
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez.
--
-- Flujo: en el panel el negocio genera un código (create_whatsapp_link_code), lo envía por WhatsApp al
-- agente y el agente, con la clave de servicio, lo canjea por un vínculo entre el número y la cuenta
-- (link_whatsapp). Desde ahí el agente opera la carta de esa cuenta cuando escribe ese número.

begin;

-- Un número de WhatsApp maneja una sola cuenta; una cuenta puede tener varios números
create table if not exists public.whatsapp_links (
  phone text primary key check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_links_user_idx on public.whatsapp_links (user_id);

alter table public.whatsapp_links enable row level security;

-- El dueño ve y quita sus números desde el panel; los vínculos solo se crean con link_whatsapp
drop policy if exists "Owners read their WhatsApp links" on public.whatsapp_links;
create policy "Owners read their WhatsApp links" on public.whatsapp_links
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Owners remove their WhatsApp links" on public.whatsapp_links;
create policy "Owners remove their WhatsApp links" on public.whatsapp_links
  for delete to authenticated using (user_id = (select auth.uid()));

-- Un código vigente por cuenta; se guarda solo su hash. Sin políticas: solo las funciones lo tocan.
create table if not exists public.whatsapp_link_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null
);

alter table public.whatsapp_link_codes enable row level security;

-- Genera un código de 8 caracteres (≈ 40 bits) válido por 10 minutos, reemplazando el anterior.
-- Alfabeto de 32 símbolos sin 0/O ni 1/I, para que se pueda dictar y escribir sin confusiones.
create or replace function public.create_whatsapp_link_code()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  raw text;
  expiry timestamptz := now() + interval '10 minutes';
  i int;
begin
  if owner is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  for attempt in 1..5 loop
    -- Bytes al azar de un UUID v4, saltando los que fijan la versión y la variante (6 y 8)
    random_bytes := uuid_send(gen_random_uuid());
    raw := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
      raw := raw || substr(alphabet, get_byte(random_bytes, i) % 32 + 1, 1);
    end loop;
    begin
      insert into public.whatsapp_link_codes (user_id, code_hash, expires_at)
      values (owner, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), expiry)
      on conflict (user_id) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at;
      code := substr(raw, 1, 4) || '-' || substr(raw, 5, 4);
      expires_at := expiry;
      return next;
      return;
    exception when unique_violation then
      -- Otro negocio tiene ese mismo código vigente: probar con otro
      null;
    end;
  end loop;
  raise exception 'No se pudo generar un código, inténtalo de nuevo';
end;
$$;

revoke execute on function public.create_whatsapp_link_code() from public, anon;
grant execute on function public.create_whatsapp_link_code() to authenticated;

-- Canjea un código por el vínculo número ↔ cuenta. El código sirve una sola vez. Si el número ya estaba
-- vinculado a otra cuenta, pasa a la nueva. Solo la clave de servicio (el servidor MCP) puede llamarla.
create or replace function public.link_whatsapp(link_code text, phone_number text)
returns table (user_id uuid, business_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := upper(regexp_replace(coalesce(link_code, ''), '[^A-Za-z0-9]', '', 'g'));
  owner uuid;
begin
  select c.user_id into owner
  from public.whatsapp_link_codes c
  where c.code_hash = encode(sha256(convert_to(normalized, 'UTF8')), 'hex')
    and c.expires_at > now();
  if owner is null then
    raise exception 'Código inválido o vencido' using errcode = 'P0002';
  end if;

  insert into public.whatsapp_links (phone, user_id)
  values (phone_number, owner)
  on conflict (phone) do update set user_id = excluded.user_id, created_at = now();
  delete from public.whatsapp_link_codes c where c.user_id = owner;

  user_id := owner;
  business_name := (select p.business_name from public.profiles p where p.id = owner);
  return next;
end;
$$;

revoke execute on function public.link_whatsapp(text, text) from public, anon, authenticated;
grant execute on function public.link_whatsapp(text, text) to service_role;

-- Reordenar en nombre de una cuenta. reorder_products y reorder_categories usan auth.uid(), que no
-- existe con la clave de servicio; estas reciben la cuenta y solo las puede llamar el servidor MCP.
create or replace function public.reorder_products_for_owner(owner uuid, product_ids bigint[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.products p
  set position = o.ord
  from unnest(product_ids) with ordinality as o (id, ord)
  where p.id = o.id
    and p.user_id = owner;
$$;

revoke execute on function public.reorder_products_for_owner(uuid, bigint[]) from public, anon, authenticated;
grant execute on function public.reorder_products_for_owner(uuid, bigint[]) to service_role;

create or replace function public.reorder_categories_for_owner(owner uuid, category_ids bigint[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.categories c
  set position = o.ord
  from unnest(category_ids) with ordinality as o (id, ord)
  where c.id = o.id
    and c.user_id = owner;
$$;

revoke execute on function public.reorder_categories_for_owner(uuid, bigint[]) from public, anon, authenticated;
grant execute on function public.reorder_categories_for_owner(uuid, bigint[]) to service_role;

commit;
