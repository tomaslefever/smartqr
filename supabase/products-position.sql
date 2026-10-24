-- SmartQR: orden manual de los productos.
-- Ejecutar en Supabase > SQL Editor. Se puede correr más de una vez.
-- La app funciona antes de correrlo (con el orden anterior), pero reordenar falla hasta entonces.

begin;

-- Posición del producto dentro de la carta de su negocio (1 = primero)
alter table public.products add column if not exists position integer;

-- Numera los productos existentes con el orden que la tienda ya mostraba (más nuevos primero)
update public.products p
set position = s.rn
from (
  select id, row_number() over (partition by user_id order by created_at desc, id desc) as rn
  from public.products
) s
where p.id = s.id and p.position is null;

create index if not exists products_user_position_idx on public.products (user_id, position);

-- Guarda un orden completo en una sola llamada: product_ids en el orden deseado.
-- security invoker: corre con los permisos (y las políticas RLS) de quien la llama,
-- y además solo toca productos del propio usuario.
create or replace function public.reorder_products(product_ids bigint[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.products p
  set position = o.ord
  from unnest(product_ids) with ordinality as o (id, ord)
  where p.id = o.id
    and p.user_id = (select auth.uid());
$$;

revoke execute on function public.reorder_products(bigint[]) from public, anon;
grant execute on function public.reorder_products(bigint[]) to authenticated;

commit;
