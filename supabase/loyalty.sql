-- SmartQR: sistema de lealtad (tarjeta de sellos) validado por el comercio vía WhatsApp.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de whatsapp-cloud.sql. Se puede correr más de una vez.
--
-- Flujo:
--   1. El cliente escanea el QR del local y llega a la landing de sellos (#/sellos/<negocio>). Pone su
--      número y pide un sello: se crea una solicitud pendiente (server.js, POST /api/loyalty/request).
--   2. El servidor le escribe al WhatsApp del comercio (loyalty_approver_whatsapp) desde el número
--      conectado a la API, con botones Validar / Rechazar. Si el comercio no le ha escrito a ese número en
--      las últimas 24 horas, va como plantilla (smartqr_validar_sello).
--   3. El comercio toca un botón: el webhook decide la solicitud y, si la valida, suma el sello. También
--      puede decidirla desde el panel. La landing consulta el estado y muestra la tarjeta.
-- Activar el sistema exige WhatsApp conectado, el número que valida y un premio; desconectar lo apaga.

begin;

-- Configuración del programa en el perfil (la carta y la landing la leen)
alter table public.profiles
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_goal integer not null default 10,
  add column if not exists loyalty_reward text,
  -- WhatsApp del comercio que valida los sellos: código de país y solo dígitos
  add column if not exists loyalty_approver_whatsapp text;

-- Una versión anterior guardaba aquí el número al que escribían los clientes
alter table public.profiles drop column if exists loyalty_whatsapp;

alter table public.profiles drop constraint if exists profiles_loyalty_goal_check;
alter table public.profiles
  add constraint profiles_loyalty_goal_check check (loyalty_goal between 2 and 50);

alter table public.profiles drop constraint if exists profiles_loyalty_reward_check;
alter table public.profiles
  add constraint profiles_loyalty_reward_check check (char_length(loyalty_reward) <= 120);

alter table public.profiles drop constraint if exists profiles_loyalty_approver_check;
alter table public.profiles
  add constraint profiles_loyalty_approver_check check (loyalty_approver_whatsapp ~ '^[0-9]{8,15}$');

-- Último mensaje del comercio al número conectado: dentro de 24 horas se le escribe con botones libres,
-- después solo con plantilla. Lo anota el webhook.
alter table public.whatsapp_connections
  add column if not exists approver_last_message_at timestamptz;

-- Activar el programa exige WhatsApp conectado, el número que valida (distinto del conectado) y un premio
create or replace function public.profiles_loyalty_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  connected text;
begin
  select regexp_replace(coalesce(c.display_phone_number, ''), '[^0-9]', '', 'g') into connected
  from public.whatsapp_connections c
  where c.user_id = new.id;
  if connected is null then
    raise exception 'Conecta WhatsApp antes de activar el sistema de lealtad' using errcode = 'P0001';
  end if;
  if new.loyalty_approver_whatsapp is null then
    raise exception 'Indica el WhatsApp que valida los sellos' using errcode = 'P0001';
  end if;
  if new.loyalty_approver_whatsapp = connected then
    raise exception 'El WhatsApp que valida los sellos tiene que ser distinto del número conectado a la API' using errcode = 'P0001';
  end if;
  if coalesce(btrim(new.loyalty_reward), '') = '' then
    raise exception 'Indica el premio del sistema de lealtad' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_loyalty_guard on public.profiles;
create trigger profiles_loyalty_guard
  before insert or update on public.profiles
  for each row when (new.loyalty_enabled)
  execute function public.profiles_loyalty_guard();

-- Sin WhatsApp no hay cómo validar: desconectar apaga el programa
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
  -- Código de país y solo dígitos (p. ej. 56912345678)
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  name text check (char_length(name) <= 80),
  -- Sellos disponibles para el próximo premio
  stamps integer not null default 0 check (stamps >= 0),
  -- Histórico
  total_stamps integer not null default 0 check (total_stamps >= 0),
  rewards_redeemed integer not null default 0 check (rewards_redeemed >= 0),
  -- 'landing': se inscribió pidiendo un sello; 'panel': lo agregó el negocio
  source text not null default 'panel',
  -- Link personal a su tarjeta en la landing (#/sellos/<negocio>?tarjeta=<card_token>)
  card_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);

-- Cambios respecto de una versión anterior (inscripción escribiendo "sellos" por WhatsApp)
alter table public.loyalty_customers add column if not exists card_token uuid not null default gen_random_uuid();
alter table public.loyalty_customers drop column if exists last_message_at;
alter table public.loyalty_customers drop constraint if exists loyalty_customers_source_check;
alter table public.loyalty_customers
  add constraint loyalty_customers_source_check check (source in ('panel', 'landing', 'whatsapp'));
create unique index if not exists loyalty_customers_card_token_idx on public.loyalty_customers (card_token);
create index if not exists loyalty_customers_user_idx on public.loyalty_customers (user_id, created_at desc);
drop function if exists public.loyalty_whatsapp_message(uuid, text, text, boolean);

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

-- Solicitudes de sello hechas desde la landing, a la espera de que el comercio las valide
create table if not exists public.loyalty_stamp_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_id bigint not null references public.loyalty_customers (id) on delete cascade,
  -- Con él la landing consulta el estado; no se puede adivinar
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_via text check (decided_via in ('whatsapp', 'panel')),
  -- Aviso al comercio: cómo se envió ('interactive' dentro de 24 horas, 'template' fuera) y su id en Meta
  notify_mode text check (notify_mode in ('interactive', 'template')),
  notify_message_id text,
  notify_error text
);

create index if not exists loyalty_stamp_requests_user_idx on public.loyalty_stamp_requests (user_id, status, created_at desc);
create index if not exists loyalty_stamp_requests_customer_idx on public.loyalty_stamp_requests (customer_id, created_at desc);
create index if not exists loyalty_stamp_requests_message_idx on public.loyalty_stamp_requests (notify_message_id);

-- El dueño ve y borra sus clientes y ve las solicitudes; los cambios pasan por las funciones de abajo
alter table public.loyalty_customers enable row level security;
alter table public.loyalty_events enable row level security;
alter table public.loyalty_stamp_requests enable row level security;

revoke all on public.loyalty_customers from anon;
revoke all on public.loyalty_events from anon;
revoke all on public.loyalty_stamp_requests from anon;
revoke insert, update on public.loyalty_customers from authenticated;
revoke insert, update, delete on public.loyalty_events from authenticated;
revoke insert, update, delete on public.loyalty_stamp_requests from authenticated;

drop policy if exists "Owners read their loyalty customers" on public.loyalty_customers;
create policy "Owners read their loyalty customers" on public.loyalty_customers
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Owners remove their loyalty customers" on public.loyalty_customers;
create policy "Owners remove their loyalty customers" on public.loyalty_customers
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Owners read their loyalty events" on public.loyalty_events;
create policy "Owners read their loyalty events" on public.loyalty_events
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Owners read their stamp requests" on public.loyalty_stamp_requests;
create policy "Owners read their stamp requests" on public.loyalty_stamp_requests
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

-- Número con código de país y solo dígitos; agrega el 56 a los móviles chilenos escritos sin él
create or replace function public.loyalty_normalize_phone(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^9[0-9]{8}$' then '56' || d
    else d
  end
  from (select regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as d) s;
$$;

-- Agrega un cliente desde el panel, o le cambia el nombre si el número ya estaba
create or replace function public.save_loyalty_customer(customer_phone text, customer_name text)
returns public.loyalty_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := (select auth.uid());
  phone_digits text := public.loyalty_normalize_phone(customer_phone);
  clean_name text := nullif(btrim(coalesce(customer_name, '')), '');
  saved public.loyalty_customers;
begin
  perform public.loyalty_goal_of_caller();
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

-- Suma un sello a mano (una compra)
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

-- Crea una solicitud de sello desde la landing (la llama server.js con la clave de servicio, que además
-- limita por IP). Si el cliente ya tiene una pendiente de los últimos 30 minutos, devuelve esa en vez de
-- crear otra, para no llenarle el WhatsApp al comercio.
create or replace function public.loyalty_request_stamp(store uuid, customer_phone text, customer_name text)
returns table (
  request_id bigint,
  request_token uuid,
  is_new boolean,
  card_token uuid,
  customer_label text,
  stamps integer,
  goal integer,
  approver text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  program public.profiles;
  phone_digits text := public.loyalty_normalize_phone(customer_phone);
  clean_name text := left(nullif(btrim(coalesce(customer_name, '')), ''), 80);
  customer public.loyalty_customers;
  request public.loyalty_stamp_requests;
begin
  select * into program from public.profiles p where p.id = store and p.loyalty_enabled;
  if program.id is null then
    raise exception 'Este local no tiene sistema de lealtad activo' using errcode = 'P0002';
  end if;
  if phone_digits !~ '^[0-9]{8,15}$' then
    raise exception 'Escribe tu número con código de país, por ejemplo 56912345678' using errcode = '22023';
  end if;

  insert into public.loyalty_customers (user_id, phone, name, source)
  values (store, phone_digits, clean_name, 'landing')
  on conflict (user_id, phone) do update set name = coalesce(public.loyalty_customers.name, excluded.name)
  returning * into customer;

  select * into request from public.loyalty_stamp_requests r
  where r.customer_id = customer.id and r.status = 'pending' and r.created_at > now() - interval '30 minutes'
  order by r.created_at desc limit 1;

  if request.id is null then
    if (select count(*) from public.loyalty_stamp_requests r
        where r.user_id = store and r.status = 'pending' and r.created_at > now() - interval '1 hour') >= 30 then
      raise exception 'El local tiene muchas solicitudes pendientes. Inténtalo en un rato' using errcode = 'P0001';
    end if;
    insert into public.loyalty_stamp_requests (user_id, customer_id) values (store, customer.id) returning * into request;
    is_new := true;
  else
    is_new := false;
  end if;

  request_id := request.id;
  request_token := request.token;
  card_token := customer.card_token;
  customer_label := coalesce(customer.name || ' ', '') || '(+' || customer.phone || ')';
  stamps := customer.stamps;
  goal := program.loyalty_goal;
  approver := program.loyalty_approver_whatsapp;
  return next;
end;
$$;

revoke execute on function public.loyalty_request_stamp(uuid, text, text) from public, anon, authenticated;
grant execute on function public.loyalty_request_stamp(uuid, text, text) to service_role;

-- Valida o rechaza una solicitud de un negocio. Al validar suma el sello. Las de más de 24 horas vencen.
-- changed dice si esta llamada la decidió (false si ya estaba decidida, p. ej. un botón tocado dos veces).
drop function if exists public.decide_loyalty_stamp_request(bigint, boolean);
drop function if exists public.loyalty_decide_request(uuid, bigint, boolean, text);
create or replace function public.loyalty_decide_request(owner uuid, request bigint, approve boolean, via text)
returns table (status text, changed boolean, customer_label text, stamps integer, goal integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.loyalty_stamp_requests;
  customer public.loyalty_customers;
begin
  select * into req from public.loyalty_stamp_requests r where r.id = request and r.user_id = owner for update;
  if req.id is null then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  select * into customer from public.loyalty_customers c where c.id = req.customer_id;
  changed := false;

  if req.status = 'pending' and req.created_at <= now() - interval '24 hours' then
    update public.loyalty_stamp_requests r set status = 'expired', decided_at = now() where r.id = req.id;
    req.status := 'expired';
    changed := true;
  elsif req.status = 'pending' then
    update public.loyalty_stamp_requests r
    set status = case when approve then 'approved' else 'rejected' end, decided_at = now(), decided_via = via
    where r.id = req.id
    returning * into req;
    changed := true;
    if approve then
      update public.loyalty_customers c
      set stamps = c.stamps + 1, total_stamps = c.total_stamps + 1
      where c.id = customer.id
      returning * into customer;
      insert into public.loyalty_events (customer_id, user_id, kind, stamps) values (customer.id, owner, 'stamp', 1);
    end if;
  end if;

  -- Una solicitud ya decidida devuelve su estado sin cambiar nada (botón tocado dos veces)
  status := req.status;
  customer_label := coalesce(customer.name || ' ', '') || '(+' || customer.phone || ')';
  stamps := customer.stamps;
  goal := (select p.loyalty_goal from public.profiles p where p.id = owner);
  return next;
end;
$$;

revoke execute on function public.loyalty_decide_request(uuid, bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.loyalty_decide_request(uuid, bigint, boolean, text) to service_role;

-- La misma decisión desde el panel
create or replace function public.decide_loyalty_stamp_request(request bigint, approve boolean)
returns table (status text, changed boolean, customer_label text, stamps integer, goal integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.loyalty_goal_of_caller();
  return query select * from public.loyalty_decide_request((select auth.uid()), request, approve, 'panel');
end;
$$;

revoke execute on function public.decide_loyalty_stamp_request(bigint, boolean) from public, anon;
grant execute on function public.decide_loyalty_stamp_request(bigint, boolean) to authenticated;

-- Estado de una solicitud, para la landing
create or replace function public.loyalty_request_status(request_token uuid)
returns table (status text, stamps integer, goal integer, card_token uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select case when r.status = 'pending' and r.created_at <= now() - interval '24 hours' then 'expired' else r.status end,
         c.stamps, p.loyalty_goal, c.card_token
  from public.loyalty_stamp_requests r
  join public.loyalty_customers c on c.id = r.customer_id
  join public.profiles p on p.id = r.user_id
  where r.token = request_token;
$$;

-- La tarjeta de un cliente, para la landing (con su link personal)
create or replace function public.loyalty_card(store uuid, card uuid)
returns table (name text, stamps integer, goal integer, rewards_redeemed integer, pending boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.stamps, p.loyalty_goal, c.rewards_redeemed,
         exists (select 1 from public.loyalty_stamp_requests r
                 where r.customer_id = c.id and r.status = 'pending' and r.created_at > now() - interval '24 hours')
  from public.loyalty_customers c
  join public.profiles p on p.id = c.user_id
  where c.user_id = store and c.card_token = card;
$$;

revoke execute on function public.loyalty_request_status(uuid) from public;
revoke execute on function public.loyalty_card(uuid, uuid) from public;
grant execute on function public.loyalty_request_status(uuid) to anon, authenticated;
grant execute on function public.loyalty_card(uuid, uuid) to anon, authenticated;

revoke execute on function public.save_loyalty_customer(text, text) from public, anon;
revoke execute on function public.add_loyalty_stamp(bigint) from public, anon;
revoke execute on function public.remove_loyalty_stamp(bigint) from public, anon;
revoke execute on function public.redeem_loyalty_reward(bigint) from public, anon;
grant execute on function public.save_loyalty_customer(text, text) to authenticated;
grant execute on function public.add_loyalty_stamp(bigint) to authenticated;
grant execute on function public.remove_loyalty_stamp(bigint) to authenticated;
grant execute on function public.redeem_loyalty_reward(bigint) to authenticated;

commit;
