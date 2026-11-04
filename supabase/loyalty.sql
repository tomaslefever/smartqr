-- SmartQR: sistema de lealtad (tarjeta de sellos) con WhatsApp.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de whatsapp-cloud.sql. Se puede correr más de una vez.
--
-- Cada compra confirmada suma un sello; al juntar la meta (p. ej. 10) el cliente canjea el premio. Los
-- clientes se identifican por su número de WhatsApp:
--   - El cliente escribe "sellos" al WhatsApp del negocio (el link está en la carta). El webhook lo
--     inscribe con su número verificado por WhatsApp y le responde cuántos sellos lleva.
--   - El negocio lo agrega a mano en el panel, con el número que el cliente le dio.
-- Activar el sistema exige una conexión de WhatsApp (whatsapp-cloud.sql); desconectarla lo apaga.

begin;

-- Configuración del programa en el perfil (la carta pública la lee para mostrar el aviso)
alter table public.profiles
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_goal integer not null default 10,
  add column if not exists loyalty_reward text,
  -- Número al que los clientes escriben "sellos": lo copia el trigger desde la conexión de WhatsApp
  add column if not exists loyalty_whatsapp text;

alter table public.profiles drop constraint if exists profiles_loyalty_goal_check;
alter table public.profiles
  add constraint profiles_loyalty_goal_check check (loyalty_goal between 2 and 50);

alter table public.profiles drop constraint if exists profiles_loyalty_reward_check;
alter table public.profiles
  add constraint profiles_loyalty_reward_check check (char_length(loyalty_reward) <= 120);

-- Activar el programa exige WhatsApp conectado y un premio; copia el número de la conexión
create or replace function public.profiles_loyalty_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  number text;
begin
  select regexp_replace(coalesce(c.display_phone_number, ''), '[^0-9]', '', 'g') into number
  from public.whatsapp_connections c
  where c.user_id = new.id;
  if coalesce(number, '') = '' then
    raise exception 'Conecta WhatsApp antes de activar el sistema de lealtad' using errcode = 'P0001';
  end if;
  if coalesce(btrim(new.loyalty_reward), '') = '' then
    raise exception 'Indica el premio del sistema de lealtad' using errcode = 'P0001';
  end if;
  new.loyalty_whatsapp := number;
  return new;
end;
$$;

drop trigger if exists profiles_loyalty_guard on public.profiles;
create trigger profiles_loyalty_guard
  before insert or update on public.profiles
  for each row when (new.loyalty_enabled)
  execute function public.profiles_loyalty_guard();

-- Sin WhatsApp no hay cómo inscribirse ni avisar: desconectar apaga el programa
create or replace function public.whatsapp_connection_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set loyalty_enabled = false where id = old.user_id and loyalty_enabled;
  return old;
end;
$$;

drop trigger if exists whatsapp_connection_removed on public.whatsapp_connections;
create trigger whatsapp_connection_removed
  after delete on public.whatsapp_connections
  for each row execute function public.whatsapp_connection_removed();

-- Clientes del programa, uno por número y negocio
create table if not exists public.loyalty_customers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Código de país y solo dígitos, como el wa_id de WhatsApp (p. ej. 56912345678)
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  name text check (char_length(name) <= 80),
  -- Sellos disponibles para el próximo premio
  stamps integer not null default 0 check (stamps >= 0),
  -- Histórico
  total_stamps integer not null default 0 check (total_stamps >= 0),
  rewards_redeemed integer not null default 0 check (rewards_redeemed >= 0),
  -- 'whatsapp': se inscribió escribiendo al negocio; 'panel': lo agregó el negocio
  source text not null default 'panel' check (source in ('panel', 'whatsapp')),
  -- Último mensaje del cliente: WhatsApp solo deja responder con texto libre hasta 24 horas después
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);

create index if not exists loyalty_customers_user_idx on public.loyalty_customers (user_id, created_at desc);

-- Historial de movimientos: de aquí se audita y se corrige el saldo
create table if not exists public.loyalty_events (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.loyalty_customers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'stamp': +1, 'unstamp': -1 (corrección), 'redeem': -meta
  kind text not null check (kind in ('stamp', 'unstamp', 'redeem')),
  stamps integer not null,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_events_customer_idx on public.loyalty_events (customer_id, created_at desc);
create index if not exists loyalty_events_user_idx on public.loyalty_events (user_id, created_at desc);

-- El dueño ve y borra sus clientes; sumar, quitar y canjear sellos pasa por las funciones de abajo
alter table public.loyalty_customers enable row level security;
alter table public.loyalty_events enable row level security;

revoke all on public.loyalty_customers from anon;
revoke all on public.loyalty_events from anon;
revoke insert, update on public.loyalty_customers from authenticated;
revoke insert, update, delete on public.loyalty_events from authenticated;

drop policy if exists "Owners read their loyalty customers" on public.loyalty_customers;
create policy "Owners read their loyalty customers" on public.loyalty_customers
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Owners remove their loyalty customers" on public.loyalty_customers;
create policy "Owners remove their loyalty customers" on public.loyalty_customers
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Owners read their loyalty events" on public.loyalty_events;
create policy "Owners read their loyalty events" on public.loyalty_events
  for select to authenticated using (user_id = (select auth.uid()));

-- Meta del programa de quien llama; falla si el programa está apagado
create or replace function public.loyalty_goal_of_caller()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  goal integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;
  select p.loyalty_goal into goal from public.profiles p where p.id = (select auth.uid()) and p.loyalty_enabled;
  if goal is null then
    raise exception 'Activa el sistema de lealtad primero' using errcode = 'P0001';
  end if;
  return goal;
end;
$$;

revoke execute on function public.loyalty_goal_of_caller() from public, anon;
grant execute on function public.loyalty_goal_of_caller() to authenticated;

-- Agrega un cliente desde el panel, o le cambia el nombre si el número ya estaba
create or replace function public.save_loyalty_customer(customer_phone text, customer_name text)
returns public.loyalty_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := (select auth.uid());
  phone_digits text := regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g');
  clean_name text := nullif(btrim(coalesce(customer_name, '')), '');
  saved public.loyalty_customers;
begin
  perform public.loyalty_goal_of_caller();
  -- Números chilenos escritos sin código de país (9 1234 5678)
  if phone_digits ~ '^9[0-9]{8}$' then
    phone_digits := '56' || phone_digits;
  end if;
  if phone_digits !~ '^[0-9]{8,15}$' then
    raise exception 'Escribe el número con código de país, por ejemplo 56912345678' using errcode = '22023';
  end if;
  insert into public.loyalty_customers (user_id, phone, name, source)
  values (owner, phone_digits, left(clean_name, 80), 'panel')
  on conflict (user_id, phone) do update set name = coalesce(excluded.name, public.loyalty_customers.name)
  returning * into saved;
  return saved;
end;
$$;

-- Suma un sello (una compra)
create or replace function public.add_loyalty_stamp(target bigint)
returns public.loyalty_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.loyalty_customers;
begin
  perform public.loyalty_goal_of_caller();
  update public.loyalty_customers c
  set stamps = c.stamps + 1, total_stamps = c.total_stamps + 1
  where c.id = target and c.user_id = (select auth.uid())
  returning * into saved;
  if saved.id is null then
    raise exception 'Cliente no encontrado' using errcode = 'P0002';
  end if;
  insert into public.loyalty_events (customer_id, user_id, kind, stamps) values (saved.id, saved.user_id, 'stamp', 1);
  return saved;
end;
$$;

-- Quita un sello sumado por error
create or replace function public.remove_loyalty_stamp(target bigint)
returns public.loyalty_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.loyalty_customers;
begin
  perform public.loyalty_goal_of_caller();
  update public.loyalty_customers c
  set stamps = c.stamps - 1, total_stamps = greatest(c.total_stamps - 1, 0)
  where c.id = target and c.user_id = (select auth.uid()) and c.stamps > 0
  returning * into saved;
  if saved.id is null then
    raise exception 'Este cliente no tiene sellos para quitar' using errcode = 'P0001';
  end if;
  insert into public.loyalty_events (customer_id, user_id, kind, stamps) values (saved.id, saved.user_id, 'unstamp', -1);
  return saved;
end;
$$;

-- Canjea el premio: descuenta la meta de los sellos
create or replace function public.redeem_loyalty_reward(target bigint)
returns public.loyalty_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  goal integer := public.loyalty_goal_of_caller();
  saved public.loyalty_customers;
begin
  update public.loyalty_customers c
  set stamps = c.stamps - goal, rewards_redeemed = c.rewards_redeemed + 1
  where c.id = target and c.user_id = (select auth.uid()) and c.stamps >= goal
  returning * into saved;
  if saved.id is null then
    raise exception 'Este cliente todavía no completa sus sellos' using errcode = 'P0001';
  end if;
  insert into public.loyalty_events (customer_id, user_id, kind, stamps) values (saved.id, saved.user_id, 'redeem', -goal);
  return saved;
end;
$$;

revoke execute on function public.save_loyalty_customer(text, text) from public, anon;
revoke execute on function public.add_loyalty_stamp(bigint) from public, anon;
revoke execute on function public.remove_loyalty_stamp(bigint) from public, anon;
revoke execute on function public.redeem_loyalty_reward(bigint) from public, anon;
grant execute on function public.save_loyalty_customer(text, text) to authenticated;
grant execute on function public.add_loyalty_stamp(bigint) to authenticated;
grant execute on function public.remove_loyalty_stamp(bigint) to authenticated;
grant execute on function public.redeem_loyalty_reward(bigint) to authenticated;

-- Un mensaje de un cliente llegó al WhatsApp del negocio (lo llama el webhook con la clave de servicio).
-- Anota la hora del mensaje y, si el cliente pidió inscribirse (join_program), lo agrega. Devuelve el
-- cliente, o nada si no está inscrito.
create or replace function public.loyalty_whatsapp_message(owner uuid, customer_phone text, customer_name text, join_program boolean)
returns setof public.loyalty_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone_digits text := regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g');
  clean_name text := left(nullif(btrim(coalesce(customer_name, '')), ''), 80);
begin
  if phone_digits !~ '^[0-9]{8,15}$' then
    return;
  end if;
  if join_program then
    return query
      with saved as (
        insert into public.loyalty_customers (user_id, phone, name, source, last_message_at)
        values (owner, phone_digits, clean_name, 'whatsapp', now())
        on conflict (user_id, phone) do update
          set last_message_at = now(), name = coalesce(public.loyalty_customers.name, excluded.name)
        returning *
      )
      select * from saved;
  else
    return query
      with saved as (
        update public.loyalty_customers c set last_message_at = now()
        where c.user_id = owner and c.phone = phone_digits
        returning c.*
      )
      select * from saved;
  end if;
end;
$$;

revoke execute on function public.loyalty_whatsapp_message(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.loyalty_whatsapp_message(uuid, text, text, boolean) to service_role;

commit;
