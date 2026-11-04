-- SmartQR: conexión del negocio con la API de WhatsApp Business (Cloud API de Meta).
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez.
--
-- Flujo: en el panel (menú WhatsApp) el negocio ingresa a mano las credenciales de su número: Phone Number
-- ID, WABA ID y el token de un System User. El servidor (server.js, POST /api/whatsapp/connect) las valida
-- con Meta, suscribe la app al WABA para que los mensajes lleguen al webhook (/api/whatsapp/webhook),
-- registra el número y guarda la fila con la clave de servicio. El token nunca llega al navegador: la
-- tabla no tiene políticas de lectura y el panel ve la conexión con my_whatsapp_connection().

begin;

-- Una conexión por cuenta; un número (phone_number_id) pertenece a una sola cuenta
create table if not exists public.whatsapp_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  waba_id text not null check (waba_id ~ '^[0-9]{5,30}$'),
  -- Como lo muestra Meta, p. ej. "+56 9 1234 5678"
  display_phone_number text,
  verified_name text,
  access_token text not null,
  -- Si la app quedó suscrita al WABA (sin esto no llegan los mensajes al webhook)
  webhooks_subscribed boolean not null default false,
  -- Avisos del último guardado (suscripción o registro del número que fallaron)
  setup_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_connections enable row level security;

-- Solo el servidor (clave de servicio) lee y escribe. El panel usa las funciones de abajo.
revoke all on public.whatsapp_connections from anon, authenticated;

-- La conexión de quien llama, sin el token
create or replace function public.my_whatsapp_connection()
returns table (
  phone_number_id text,
  waba_id text,
  display_phone_number text,
  verified_name text,
  webhooks_subscribed boolean,
  setup_error text,
  connected_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.phone_number_id, c.waba_id, c.display_phone_number, c.verified_name,
         c.webhooks_subscribed, c.setup_error, c.connected_at, c.updated_at
  from public.whatsapp_connections c
  where c.user_id = (select auth.uid());
$$;

revoke execute on function public.my_whatsapp_connection() from public, anon;
grant execute on function public.my_whatsapp_connection() to authenticated;

-- Desconecta el WhatsApp de quien llama (borra las credenciales guardadas)
create or replace function public.disconnect_whatsapp()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.whatsapp_connections c where c.user_id = (select auth.uid());
$$;

revoke execute on function public.disconnect_whatsapp() from public, anon;
grant execute on function public.disconnect_whatsapp() to authenticated;

commit;
