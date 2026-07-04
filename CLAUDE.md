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
Construido según `PLAN.md`. **Fases 1 y 2 completas.**
- Fase 1 (Fundaciones): auth por email, `proxy.ts` con ruteo por rol, RLS.
- Fase 2 (Datos): CRUD de clientes, contratos (dentro de la ficha del cliente) y proyectos;
  estética del prototipo portada (KPIs, tablas, badges, formularios); dashboard con datos reales.
  Datos de ejemplo en `scripts/seed-datos-ejemplo.mjs`.

Contratos: se gestionan dentro de `/clientes/[id]` (su hogar natural). `gantt`, `cobros`,
`acciones`, `entregables` siguen como placeholders de fases posteriores. No avanzar de fase
hasta que la anterior funcione end to end.

## Setup local
1. `npm install`
2. Copiar `.env.example` a `.env.local` y poner las credenciales de Supabase.
3. En Supabase: aplicar `supabase/schema.sql`, crear usuarios admin y cliente en Authentication,
   luego correr `supabase/seed.sql` (editando los correos).
4. `npm run dev`
