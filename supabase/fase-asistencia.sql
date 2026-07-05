-- ============================================================
--  CONFIRMACIÓN DE ASISTENCIA A REUNIONES
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  El cliente (dueño/contenido) confirma si asiste a una reunión suya desde el
--  portal. Escritura ACOTADA: solo su propio usuario, su propio cliente, y solo
--  si el evento es una reunión suya visible. Color Media (admin) ve todo.
-- ============================================================

create table if not exists event_attendance (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references calendar_events(id) on delete cascade,
  client_id  uuid not null references clients(id)         on delete cascade,
  user_id    uuid not null references auth.users(id)      on delete cascade,
  attending  boolean not null,                 -- true = asiste, false = no podrá
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)                   -- una confirmación por usuario y reunión
);

create index if not exists event_attendance_event_idx on event_attendance (event_id);

alter table event_attendance enable row level security;

-- Lectura: admin, o dueño/contenido del propio cliente (para ver el estado).
drop policy if exists "attendance sel" on event_attendance;
create policy "attendance sel" on event_attendance for select using (
  is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','content')));

-- Predicado de escritura: solo tu propio usuario, tu cliente, rol owner/content,
-- y el evento debe ser una REUNIÓN tuya visible. Así no puedes confirmar por
-- otro, ni de otro cliente, ni un evento que no sea una reunión tuya.
drop policy if exists "attendance ins" on event_attendance;
create policy "attendance ins" on event_attendance for insert with check (
  is_admin() or (
    user_id = auth.uid()
    and client_id = auth_client_id()
    and auth_client_role() in ('owner','content')
    and exists (
      select 1 from calendar_events e
      where e.id = event_id
        and e.client_id = auth_client_id()
        and e.visible_to_client
        and e.kind = 'reunion'
    )
  ));

drop policy if exists "attendance upd" on event_attendance;
create policy "attendance upd" on event_attendance for update
  using (
    is_admin() or (user_id = auth.uid() and client_id = auth_client_id()
      and auth_client_role() in ('owner','content')))
  with check (
    is_admin() or (
      user_id = auth.uid()
      and client_id = auth_client_id()
      and auth_client_role() in ('owner','content')
      and exists (
        select 1 from calendar_events e
        where e.id = event_id and e.client_id = auth_client_id()
          and e.visible_to_client and e.kind = 'reunion'
      )
    )
  );

grant all on event_attendance to service_role;
