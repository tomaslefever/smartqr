-- SmartQR: pedidos por WhatsApp desde la carta pública. El cliente arma su pedido en la carta y se abre
-- WhatsApp con el mensaje listo para el número del negocio. No se guarda ningún pedido en la base.
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez. La app funciona antes de correrlo
-- (la carta no muestra pedidos), pero activar los pedidos en la configuración falla hasta entonces.

alter table public.profiles
  add column if not exists orders_enabled boolean not null default false,
  -- Número que recibe los pedidos: código de país y solo dígitos, como lo pide wa.me (p. ej. 56912345678)
  add column if not exists orders_whatsapp text,
  -- Si el negocio despacha a domicilio; si no, los pedidos son solo para retiro (o para la mesa)
  add column if not exists orders_delivery boolean not null default false;

alter table public.profiles drop constraint if exists profiles_orders_whatsapp_check;
alter table public.profiles
  add constraint profiles_orders_whatsapp_check check (orders_whatsapp ~ '^[0-9]{8,15}$');

alter table public.profiles drop constraint if exists profiles_orders_need_whatsapp;
alter table public.profiles
  add constraint profiles_orders_need_whatsapp check (not orders_enabled or orders_whatsapp is not null);
