-- SmartQR: políticas de Storage para el bucket de imágenes de productos.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de desplegar la versión de la app que sube las
-- imágenes a la carpeta "<user id>/" (con la app anterior, las subidas fallarían).

begin;

-- Antes: cualquier usuario autenticado podía subir cualquier archivo a cualquier bucket y ruta.
drop policy if exists "Permitir insertar imágenes a usuarios autenticados" on storage.objects;

-- Ahora: solo al bucket product-images y solo dentro de la carpeta propia del usuario.
create policy "Usuarios suben imágenes a su propia carpeta"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Limita el tamaño (10 MB, lo que indica el formulario) y el tipo de archivo a imágenes.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
where id = 'product-images';

commit;

-- Las consultas de la app filtran productos por user_id (panel y tienda pública).
create index if not exists products_user_id_idx on public.products (user_id);
