# Panel Color Media

App de gestión de clientes de Color Media (Vértice SpA), operador solo.
Dos caras sobre una misma base de datos, separadas por Row Level Security:

- **Panel interno** (`/dashboard`, `/clientes`, `/proyectos`, `/gantt`, `/cobros`, `/acciones`, `/entregables`) — solo rol `admin`.
- **Portal del cliente** (`/portal/…`) — solo rol `client`, solo lectura. Nunca ve tarifas ni estado de pago.

## Stack
Next.js 16 (App Router, TypeScript) · Supabase (Postgres + Auth + RLS) · Tailwind v4 · Vercel.

## Regla de oro
El frontend filtra por comodidad; **la seguridad real es RLS** (ver `supabase/schema.sql`).
`contracts` y `billings` no tienen política de lectura para clientes. `actions`, `deliverables`
y `calendar_events` se filtran además por `visible_to_client`.

## Estructura
- `app/(admin)/` — panel interno (layout con sidebar). `app/(portal)/` — portal cliente.
- `app/login/` — login por email + contraseña (server action).
- `middleware.ts` + `lib/supabase/middleware.ts` — refresca sesión y enruta según rol.
- `lib/supabase/` — `client.ts` (browser), `server.ts` (sesión), `admin.ts` (service_role, solo server).
- `lib/auth.ts` — `getSessionProfile()` para los layouts.
- `supabase/schema.sql` — esquema + RLS. `supabase/seed.sql` — trigger de perfiles, admin y cliente demo.

## Estado
Construido según `PLAN.md`. **Fases 1–6 completas.**
- Fase 6 (Portal del cliente): vistas de SOLO LECTURA para el rol client bajo `/portal`
  (`/portal/que-viene`, `/portal/proyectos` + `[id]`, `/portal/avance`), heredando la estética
  del panel. Sin escritura y sin nada financiero. Reutiliza `GanttChart` con `basePath`. La
  seguridad la garantiza RLS (comprobado: el cliente ve 0 contratos/cuotas aunque existan, no
  accede a datos de otro cliente ni por URL directa —404—, el filtro `visible_to_client` aplica,
  y no puede escribir). Cliente de prueba: `cliente.demo@colormedia.cl` enlazado a Novamed.

- Fase 5 (Cobros y UF): separa el ACUERDO (`contracts`, evolucionado: modality/has_iva/net_uf/
  net_clp_fixed/installments_count) de las CUOTAS (`installments`, tabla nueva). Tres modalidades
  (proyecto/plazo_fijo/retainer); neto en UF o CLP fijo + IVA (19%) guardado aparte, nunca el total.
  Facturación manual (`facturarCuota`) congela la UF del día; estados y N° DTE. Cron de UF
  `/api/uf/refresh` (mindicador.cl). Vista `/cobros` con paybar y ciclo facturar→pagar. Generación
  de cuotas desde la ficha del cliente. `lib/billing.ts`, `scripts/seed-fase5.mjs`. Migración:
  `supabase/fase5.sql` (retira `billings`). IVA por cuota con `iva_rate` congelada.

- Fase 1 (Fundaciones): auth por email, `proxy.ts` con ruteo por rol, RLS.
- Fase 2 (Datos): CRUD de clientes, contratos y proyectos; estética del prototipo; dashboard.
- Fase 3 (Gantt + entregables): carta Gantt desde las fases, CRUD de fases/entregables/acciones,
  modal de detalle, vistas `/entregables` y `/acciones`.
- Fase 4 (Google Calendar): OAuth (`/api/auth/google` + callback) con refresh token cifrado
  (`lib/crypto.ts`, AES-256-GCM) en la tabla `google_credentials`; `lib/google.ts` (sync
  incremental con syncToken → upsert por `google_event_id`, y push panel→Google al crear/editar/
  mover/borrar hitos); mapeo calendario↔cliente (`clients.google_calendar_id`); página
  `/integraciones`; hitos en `/proyectos/[id]`; carril de hitos + modal de evento en la Gantt.
  Endpoint `/api/calendar/sync` (cron con `x-cron-secret` o sesión admin, exento del middleware).
  `scripts/seed-fase4.mjs`. Migración: `supabase/fase4.sql`.

Hubs: contratos en `/clientes/[id]`; fases/entregables/acciones/hitos y mapeo de calendario
en `/proyectos/[id]` y `/clientes/[id]`.

**Aprobación de contenido (post Fase 6):** piezas (imagen+texto) por cliente y período, con
aprobación del cliente. Panel `/contenido` (crear período/piezas, publicar, subir versiones,
confirmar/rechazar); portal `/portal/contenido` (aprobar/pedir cambios, "aprobar todo").
Tablas `content_periods/pieces/versions/reviews`; imágenes en bucket privado `contenido`
(signed URLs, Storage RLS por carpeta = client_id). Escritura del cliente MUY acotada: solo
inserta `content_reviews` sobre sus piezas; un trigger `SECURITY DEFINER` mueve el estado
(el cliente no tiene UPDATE sobre piezas). Migración `supabase/fase-contenido.sql` (incluye el
bucket). `scripts/seed-contenido.mjs`. Seguridad verificada (11/11 pruebas RLS).

## Setup local
1. `npm install`
2. Copiar `.env.example` a `.env.local` y poner las credenciales de Supabase.
3. En Supabase: aplicar `supabase/schema.sql`, crear usuarios admin y cliente en Authentication,
   luego correr `supabase/seed.sql` (editando los correos).
4. `npm run dev`
