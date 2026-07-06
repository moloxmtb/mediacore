-- ============================================================
--  CONTENIDO MULTIMEDIA — FASE 1 (SOLO modelo de datos)
--  Correr en Supabase → SQL Editor. Idempotente. PURAMENTE ADITIVA.
--
--  Una pieza de contenido pasa a soportar MÚLTIPLES medios ordenados de tipo
--  mixto (imágenes + videos). Los medios cuelgan de la VERSIÓN (content_versions),
--  no de la pieza: cada versión es un snapshot inmutable de su conjunto de medios.
--
--  Storage (decisión: COPIA FÍSICA POR VERSIÓN): al crear una versión nueva se
--  copia cada archivo a una ruta propia de esa versión, así cada versión es
--  autónoma y borrar una nunca afecta a otra. Esa copia es lógica de código
--  (Fase 2); esta migración solo deja el modelo.
--
--  NO toca: content_periods/pieces/versions/reviews, el trigger de aprobación,
--  ni content_versions.image_path (queda vestigial; se dropea después, aparte).
-- ============================================================

-- ---------- Tipo ----------
do $$ begin
  create type content_media_kind as enum ('imagen','video');
exception when duplicate_object then null; end $$;

-- ---------- Tabla ----------
create table if not exists content_media (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references content_versions(id) on delete cascade,
  kind         content_media_kind not null,
  sort_order   integer not null,                 -- orden en el carrusel
  -- imagen:
  storage_path text,                             -- ruta en el bucket privado 'contenido'
  -- video:
  embed_url    text,
  provider     text,                             -- 'youtube' / 'vimeo' (texto libre, metadato)
  orientation  text,                             -- 'vertical' / 'horizontal' (texto libre, metadato)
  created_at   timestamptz not null default now(),

  -- Integridad real (sin trabar inserts legítimos):
  -- cada medio trae el campo que su tipo necesita.
  constraint content_media_presencia
    check ((kind = 'imagen' and storage_path is not null)
        or (kind = 'video'  and embed_url    is not null)),
  -- no dos medios en la misma posición dentro de una versión.
  constraint content_media_orden_unico unique (version_id, sort_order)
);

create index if not exists content_media_version_idx on content_media (version_id, sort_order);

-- ============================================================
--  RLS — espejo de content_versions
--  Lectura: admin, o owner/content del cliente dueño de la pieza (no borrador).
--  Escritura: solo admin.
-- ============================================================
alter table content_media enable row level security;

drop policy if exists "content_media sel" on content_media;
create policy "content_media sel" on content_media for select using (
  is_admin() or (
    auth_client_role() in ('owner','content')
    and version_id in (
      select cv.id
      from content_versions cv
      join content_pieces cp on cp.id = cv.piece_id
      where cp.client_id = auth_client_id() and cp.status <> 'borrador'
    )
  )
);

drop policy if exists "content_media adm" on content_media;
create policy "content_media adm" on content_media for all
  using (is_admin()) with check (is_admin());

grant all on content_media to service_role;
