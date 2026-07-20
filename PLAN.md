# Panel Color Media — brief de construcción

Aplicación de gestión de clientes para Color Media (Vértice SpA), operador solo.
Dos caras sobre una misma base de datos, y una idea de fondo: **un panel
interconectado** donde una fase reúne sus acciones, sus entregables y sus
eventos de calendario, para darle al cliente claridad de lo que viene. Esto
materializa el valor de Customer Experience de Color Media: anticipación, no
reacción de última hora.

- **Panel interno (Ismael):** clientes, contratos, proyectos, carta Gantt, acciones, entregables y la capa financiera (tarifas, indexación UF, estado de pago).
- **Portal del cliente:** solo lectura. Ve sus proyectos, su Gantt, sus entregables y las acciones/eventos marcados como visibles. Nunca ve tarifas ni estado de pago.

> La separación se garantiza a nivel de base de datos con Row Level Security (ver `schema.sql`). `contracts` y `billings` no tienen política de lectura para clientes; `actions`, `deliverables` y `calendar_events` se filtran además por `visible_to_client`.

Este panel **no emite DTE**. La factura electrónica se genera en el SII o en Nubox/Bsale; aquí solo se registra el número y el estado, para cruzar.

---

## La carta Gantt: dos fuentes, una línea de tiempo

La Gantt combina dos capas sobre la misma línea de tiempo:

1. **Fases del proyecto** (tabla `phases`): barras largas con porcentaje de avance. Son los bloques de trabajo.
2. **Eventos de Google Calendar** (tabla `calendar_events`): hitos puntuales sobre la línea —reuniones, rodajes, entregas, deadlines.

**Ventana de detalle.** Al hacer clic en una barra o un hito se despliega un modal que cruza todo lo que cuelga de ese ítem: a qué corresponde (descripción de la fase/evento), las **acciones** ejecutadas (`actions.phase_id`), los **entregables** con su resultado (`deliverables`) y los eventos de calendario de su rango. Es la manifestación visible de la interconexión.

---

## Google Calendar — sincronización bidireccional

- **Un calendario secundario por cliente**, todos dentro de una sola cuenta de Google (la de Color Media). Cada uno tiene su `calendarId`, guardado en `clients.google_calendar_id`.
- **Privacidad:** la app solo lee/escribe en los calendarios mapeados. El calendario personal principal nunca se toca. Este es el motivo de fondo para usar calendarios separados por cliente.
- **Dirección:** bidireccional.
  - *Google → panel:* sincronización incremental por calendario con `syncToken` (y opcionalmente push notifications / watch channels para tiempo casi real). Cada evento se hace *upsert* en `calendar_events`.
  - *Panel → Google:* al crear, editar o mover un hito en el panel, la app escribe en el `calendarId` del cliente y guarda el `google_event_id` devuelto.
- **Evitar duplicados/loops:** cada registro guarda `google_event_id`; la sincronización entrante reconoce por ese id y actualiza en vez de duplicar. En conflicto, última escritura gana (suficiente para un operador solo).
- **OAuth:** scope de lectura-escritura (`.../auth/calendar.events`). El refresh token de la cuenta admin se guarda server-side (en base, cifrado o vía Supabase Vault), nunca en el navegador. Como es para una sola cuenta propia, el proyecto de Google Cloud puede quedar en modo interno/testing sin verificación pública.

---

## Portal del cliente — "Qué viene"

Vista de anticipación: próximos hitos y entregables ordenados en el tiempo
(los que tienen `visible_to_client = true`). Es el valor de Customer
Experience hecho interfaz: el cliente entra y sabe qué sigue.

---

## Stack

- **Next.js** (App Router, TypeScript) en **Vercel**.
- **Supabase**: Postgres + Auth + Row Level Security.
- **Tailwind CSS**. La dirección visual está en `panel-colormedia.html` (tema oscuro tipo suite de post, cifras en monoespaciada, franja de barras de color como firma). La Gantt se construye a mano con divs posicionados por fecha, sin librería.
- **API de Google Calendar** vía OAuth propio (credenciales en Google Cloud).

---

## Estructura de carpetas

```
/app
  /(admin)                # protegido: solo rol admin
    /dashboard  /clientes  /proyectos  /gantt  /cobros  /acciones
    /entregables
    layout.tsx
  /(portal)               # protegido: solo rol client
    /portal
      /proyectos/[id]     # detalle de proyecto (lectura)
      /avance             # Gantt del cliente (lectura)
      /que-viene          # próximos hitos y entregables
    layout.tsx
  /login
  /api
    /uf/refresh           # actualiza la UF del día (cron)
    /calendar/sync        # sincroniza eventos de Google (cron o webhook)
    /calendar/webhook     # recibe push notifications de Google (opcional)
    /auth/google          # OAuth de Google Calendar
/lib
  /supabase   client.ts  server.ts  admin.ts    # admin.ts usa service_role, solo server
  uf.ts       billing.ts
  google.ts                                       # cliente de Google Calendar + sync
/components  /gantt  /ui  /modal
/supabase   schema.sql
middleware.ts
```

---

## Roles y acceso

- Un usuario **admin** (Ismael), creado a mano en Supabase.
- Cada cliente con portal se crea como usuario **client**, con `profiles.client_id` a su empresa.
- `middleware.ts` enruta según rol. **Regla de oro:** el frontend filtra por comodidad; la seguridad real es RLS.

---

## Integración UF

- Fuente: **mindicador.cl** (`/api/uf`), pública y sin key. Alternativa oficial: API de la CMF (con key). Confirmar el endpoint vigente al implementar.
- `/api/uf/refresh` hace *upsert* diario en `uf_values` (cron de Vercel).
- Contratos indexados: `amount_clp = round(base_amount_uf * uf_del_dia)`. CLP fijos: `amount_clp = base_amount`, `uf_value = null`.
- Generar un cobro **congela** la UF de ese período en `billings`.

---

## Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo servidor
CRON_SECRET=                       # protege los endpoints de cron
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
```

---

## Fases de construcción

1. **Fundaciones.** Next.js + Tailwind + Supabase. Aplicar `schema.sql`. Auth por email. `middleware.ts` con separación de roles. Crear admin y un cliente de prueba.
2. **Panel interno — datos.** CRUD de clientes, contratos y proyectos. Portar la estética del prototipo.
3. **Carta Gantt + entregables.** Fases con avance. Entregables por fase. Modal de detalle que cruza fase + acciones + entregables.
4. **Google Calendar.** OAuth de Google. Mapeo calendario↔cliente. Sincronización bidireccional. Hitos sobre la Gantt.
5. **Cobros y UF.** Cron de UF. Generación de cobros. Estados y N° DTE. Ver "Modalidades de cobro" abajo — el diseño debe separar el acuerdo de las cuotas que genera.
6. **Portal del cliente.** Vistas de solo lectura + "Qué viene". Verificar con un usuario client real que no se filtra nada financiero ni de otros clientes.
7. **Deploy.** Vercel + crons. Repaso de RLS con la anon key. Respaldo de la base.

---

## Modalidades de cobro (Fase 5)

El cobro no es un monto mensual fijo único: hay tres modalidades que deben convivir.
El diseño separa dos conceptos que hoy están pegados en `contracts`/`billings`:

- **Acuerdo** (el contrato): define la modalidad, el valor total, el plazo y cómo
  se reparte en cuotas.
- **Cuotas** (lo que se cobra): cada acuerdo genera N cuotas, cada una con su monto
  en UF (o CLP), su período/mes, su vencimiento y su estado de pago. La conversión
  UF→CLP se congela el día de facturación de cada cuota (ya resuelto en el diseño).

Modalidades a soportar:

1. **Proyecto puntual.** Valor total, cobrado en una o más cuotas, sin recurrencia.
   Termina el proyecto, terminan los cobros. Las cuotas pueden ser iguales o no.
2. **Contrato a plazo fijo.** Valor total en UF por un período definido (un año o X
   meses), dividido en cuotas mensuales. Cada cuota se convierte a CLP con la UF del
   día de facturación. Dos variantes:
   - **Cuotas iguales:** el total se reparte parejo en UF.
   - **Escalonado:** las cuotas cambian de monto a lo largo del período (ej. primeros
     3 meses un valor, luego sube). El calendario de cuotas se define al crear el
     acuerdo, y el sistema ya sabe qué corresponde cada mes.
3. **Retainer indefinido.** Monto fijo al mes, sin fecha de término; genera una cuota
   cada mes de forma continua. (Es lo que ya estaba modelado.)

Implicaciones:
- La generación de cobros deja de ser "un monto por mes" y pasa a "materializar las
  cuotas del acuerdo según su calendario".
- La UI de cobros debe permitir definir el calendario de cuotas al crear el acuerdo
  (número de cuotas, montos iguales o escalonados, fechas), y luego ver/gestionar
  cada cuota con su estado.
- Sigue sin emitir DTE: registra número y estado para cruzar con el SII/Nubox.

### IVA

Todo se expresa en **UF neto + IVA**. El IVA en Chile es 19%.

- Guardar el **valor neto en UF** y calcular el IVA aparte — NO guardar el monto con
  IVA ya incluido. Así el panel muestra neto, IVA y total por separado (como una
  factura real) y no se rompe si cambia la tasa o hay exención.
- Cada cuota debe poder mostrar: neto en UF, IVA en UF, total en UF, y el equivalente
  en CLP del total el día de facturación.
- Cada acuerdo indica si lleva IVA o es exento (por defecto: con IVA). Contempla boleta
  vs. factura si aplica al caso.

---

## Acceso de clientes y despliegue (Fase 7)

El panel vive en su propio subdominio bajo la marca: **`core.colormedia.cl`** (DEFINIDO). El sitio
institucional `colormedia.cl` (WordPress, ya existente) suma un enlace visible **"Acceso
clientes"** que redirige al login del sistema. Sitio y sistema quedan independientes:
la web es la vitrina pública, Media Core es la herramienta privada tras el login.

Checklist de despliegue (pasa de local a producción):

- **`core.colormedia.cl`** apuntado al proyecto en Vercel (DNS en HostGator/cPanel Zone Editor,
  igual que los registros de Resend — agregar el registro que Vercel indique, sin tocar lo existente).
- Enlace "Acceso clientes" agregado en WordPress (`colormedia.cl`) → apunta a `core.colormedia.cl`.
- Variables de entorno cargadas en Vercel (las mismas del `.env.local`).
- **Redirect URI de Google:** sumar la versión de producción
  `https://core.colormedia.cl/api/auth/google/callback` en el OAuth Client de Google Cloud
  (mantener también el de localhost para desarrollo).
- **Flow a producción:** cambiar FLOW_API_KEY/FLOW_SECRET_KEY a las de producción, FLOW_API_URL a
  `https://www.flow.cl/api`, y APP_URL a `https://core.colormedia.cl` (ya no túnel). El código no cambia.
  Con esto Flow queda cobrando de verdad.
- Cron de UF y de sincronización de calendario configurados en Vercel.
- Repaso final de RLS con la anon key. Definir respaldo de la base.
- Aplicar migraciones en la base de producción (o usar el mismo proyecto Supabase).

---


## Nuevas funcionalidades (post Fase 6, a construir antes de publicar)

Bloque de mejoras que convierten el panel de seguimiento en un espacio de colaboración
y transacción con el cliente. Ordenadas por prioridad del usuario y por tamaño.

### 1. Aprobación de contenido por el cliente (PRIORIDAD)

Sección donde Color Media publica el contenido del período siguiente (configurable:
mes, quincena o semana) y el cliente lo aprueba o comenta.

Diseño afinado (decisiones del usuario):

- **Pieza de contenido:** imagen + texto. Requiere storage de archivos (Supabase Storage).
- **Estados de pieza:** `propuesta` → (cliente aprueba o comenta) → Color Media revisa →
  `aprobada` o nueva versión `con_correcciones`.
- **Aprobación:** el cliente puede aprobar pieza por pieza O aprobar todo el período de
  una vez (ambas opciones en el portal).
- **Acciones del cliente:** aprobar (check), comentar/pedir correcciones, y ver el
  **historial de versiones** de la pieza.
- **Cada pieza avanza por su cuenta** — no se espera a que todo el período esté aprobado.
- **Color Media tiene la última palabra:** la aprobación o comentario del cliente NO queda
  firme automáticamente; Color Media lo revisa y confirma/rechaza. La acción del cliente es
  un "voto" que el admin confirma, no un cambio directo del estado final. Esto acota la
  escritura que se abre en el portal.
- **Historial de versiones:** cada corrección genera una versión nueva sin borrar la
  anterior; se guarda quién dijo qué y cuándo.

Implicaciones técnicas:
- Rompe el "portal solo lectura": el cliente gana escritura acotada (aprobar/comentar solo
  sus piezas). RLS: un cliente solo puede votar/comentar contenido de su propia empresa.
- Tabla(s): contenido (pieza, período, cliente, estado, imagen_url, texto), versiones,
  comentarios/votos del cliente.
- Vista en el portal (ver, aprobar, comentar, historial) y vista en el panel (crear piezas,
  ver aprobaciones/comentarios, subir versiones, confirmar).
- Storage de imágenes en Supabase Storage.
- Es prácticamente una fase propia por su tamaño.

Decisiones finales de diseño (aprobadas):
- **Modelo de 3 capas:** pieza (identidad estable) → versiones (imagen+texto, inmutables,
  historial con quién/cuándo/qué cambió) → revisiones (votos/comentarios del cliente y
  confirmaciones de Color Media, auditables).
- **Escritura del cliente vía "voto", no UPDATE directo:** el cliente solo inserta una
  revisión sobre una pieza de su empresa; un trigger SECURITY DEFINER traduce eso al estado.
  El cliente nunca puede tocar título, imagen, ni forzar "aprobada". Todo lo demás es admin.
- **Cadencia del período:** flexible, se fija al crear cada período (mensual/quincenal/semanal),
  no amarrada al cliente.
- **"Devolver" (cliente aprueba pero CM no está conforme):** ambas cosas — un estado
  `rechazada` visible al cliente Y la opción de subir versión nueva (vuelve a ronda, historial
  intacto).
- **Texto de la pieza:** separar nombre interno de la pieza del copy del post (dos campos).
- **Ubicación en el panel:** sección propia `/contenido` en el menú (no dentro de la ficha
  del cliente).
- **Storage:** bucket privado; imágenes servidas con signed URLs cortas server-side, solo
  para piezas que el usuario ya pasó por RLS. Storage RLS como defensa en profundidad.

Mejoras futuras de esta funcionalidad:
- **Carruseles (varias imágenes por pieza).** Hoy cada pieza admite una sola imagen. Extender
  para que una pieza guarde un conjunto ordenado de imágenes (las slides), con un solo copy
  para todo el carrusel. En el portal, el cliente ve el carrusel completo y lo aprueba/comenta
  como una pieza. **Decisión del usuario:** comentar el carrusel entero (una sola aprobación /
  un solo hilo de comentarios por pieza, NO slide por slide). Es acotado y no rehace lo construido.
- **Desarrollo de carruseles: externo.** **Decisión del usuario:** los carruseles se desarrollan
  fuera del panel (Canva u otra herramienta). El panel NO será un editor de diseño. Queda
  pendiente conversar más adelante si la carga del carrusel al panel es manual (subir las
  imágenes ya hechas) o integrada (p. ej. enlace/importación desde Canva). Por ahora se asume
  manual: se suben las slides ya diseñadas.

### 2. Notificaciones por correo

Al crear/actualizar una acción, reunión o hito, notificar por correo al equipo interno
de Color Media y al equipo del cliente.

- **Servicio elegido: Resend.** Encaja con Next.js, plan gratuito permanente de 3.000
  correos/mes (más que suficiente para el volumen de Color Media). Requiere cuenta en
  resend.com y verificar el dominio colormedia.cl (registros DNS: SPF, DKIM, DMARC) para
  poder enviar como @colormedia.cl con buena entregabilidad.
  - **ESTADO:** cuenta creada, dominio colormedia.cl VERIFICADO en Resend (DNS en HostGator /
    cPanel Zone Editor; registros DKIM `resend._domainkey`, MX y TXT `send` agregados sin tocar
    los MX de Google Workspace existentes). Falta pasar la API key (`re_...`) a Claude Code.
  - **Identidad y plantilla de correo (REDISEÑADO CON MARCA · DESPLEGADO v1.14, commit `67b508f`):**
    marco visual con identidad Color Media, centralizado en `lib/mail.ts` + `lib/email/`.
    - **Plantilla base única `emailShell`** (`lib/email/shell.ts`): los 3 builders de HTML duplicados
      (`wrap` en notify.ts, `inviteHtml` en invite.ts, el inline de reunion-actions) FUSIONADOS en uno.
      Header claro con logo de marca (por URL, no base64), franja de acento coral, paleta Tinta `#131313` /
      Hueso `#F1EDE6` / Coral `#FF4A2E` (coral solo señal). HTML de correo compatible: tablas, estilos inline,
      ghost-table de Outlook, ancho fluido (max-width 520). Helpers `esc()` y `dataRows()`.
    - **Los 6 correos** (`lib/email/templates.ts`, funciones puras): C1 invitación portal, C2 recuperación,
      T3 invitación equipo, T1 respuesta de entregable (Fase 4), T2 evento (acción/hito/reunión, CTA según
      destinatario), T4 solicitud de reunión. `esc()` en TODA variable de usuario (anti-inyección/roturas);
      los subjects van sin escapar (texto plano).
    - `from`: `Color Media <notificaciones@colormedia.cl>` (antes "Notificaciones Color Media"). `reply_to`:
      `hola@colormedia.cl` (antes `marketing@`; unificado con el contacto visible del pie). El **pie** ahora
      vive DENTRO de `emailShell` (única fuente) — ya no se anexa en `mail.ts`.
    - Solo template + texto: la lógica de destinatarios NO se tocó (Fase 4 por permiso real; eventos de
      Pieza 3 y solicitud de reunión por lista global). Verificado: 6 renders reales + envío de prueba a
      Gmail (los 6 `delivered`).
    - **`MAIL_FROM` jubilada:** `from` fijo en el helper (más seguro que env var), borrada de `.env.local`
      y de Vercel.
- Es la infraestructura base compartida: habilita también las invitaciones de usuario
  (funcionalidad 3) — se construyen juntas sobre Resend.
- Definir con precisión qué eventos disparan correo, para no saturar (probablemente
  configurable por tipo).
- Se cruza con la funcionalidad 3 (a quién notificar depende de los usuarios/roles del cliente).

Decisiones de diseño (usuario):
- **Dos usos sobre el mismo correo:** (a) invitaciones de usuario (alta con enlace para fijar
  contraseña — completa la funcionalidad 3), y (b) notificaciones de eventos.
- **Eventos que notifican:** todo movimiento — acciones, hitos y reuniones.
- **Destinatario configurable POR TIPO de evento:** el usuario decide, por cada tipo, si el
  correo va solo al equipo interno de Color Media o también al cliente. (Recomendación anotada:
  al cliente, hitos y reuniones; las acciones operativas menudas mejor solo internas o que las
  vea en el portal, para no saturarlo.)
- **Ritmo:** un correo por evento, al instante. (Riesgo anotado: alto volumen si se registran
  muchas acciones/día; mitigado por el control de destinatario por tipo. Agrupar en digest queda
  como mejora futura si hace falta.)
- El respeto al rol del cliente aplica: a un cliente solo se le notifica lo de su empresa, y
  según su rol (p. ej. finanzas no recibiría avisos de contenido).

Plan aprobado (Claude Code) — a construir:
- `lib/mail.ts` (envoltorio Resend, best-effort: si el correo falla, se registra y NO rompe la
  acción) y `lib/notify.ts` (lógica evento → destinatarios → enviar).
- **Invitaciones:** alta por `auth.admin.generateLink({type:'invite'})` → enlace a `/fijar-clave`
  donde el usuario define su contraseña. Plantilla enviada por Resend. "Reenviar invitación"
  disponible. Reemplaza el alta provisoria con contraseña.
- **Config por tipo:** tabla `notification_settings` (event_type: accion|hito|reunion; to_internal;
  to_client) editable desde una tarjeta en `/integraciones`, más un campo de correos internos de
  Color Media (definible en el panel — el usuario lo llenará después).
- **Eventos y defaults:** acción → solo interno (el cliente la ve en el portal); hito y reunión →
  interno + cliente. Avisar al crear; hitos/reuniones también al mover de fecha. NO se disparan
  correos por eventos que entran desde Google Calendar (evita tormentas de correo).
- Respeta roles: al cliente solo lo de su empresa y según rol (finanzas no recibe contenido).
- Migración chica en Supabase (`notification_settings`).

### 3. Múltiples usuarios y roles por cliente (CAMBIO ESTRUCTURAL)

Hoy hay un rol `client` único que no ve nada financiero. Ampliar a varios usuarios por
cliente con distinto nivel de acceso:

- Ej. dueño (ve todo, incl. contrato), gerenta de finanzas (ve facturado / por pagar).
- **Reabre el modelo de permisos y RLS** — es el punto más delicado, porque algunos roles
  de cliente sí verían parte de lo financiero. Rediseñar con mucho cuidado y volver a
  verificar la separación como en la Fase 6.
- Requiere: roles por usuario dentro de un cliente, y políticas RLS más finas por rol.

Diseño afinado (decisiones del usuario):

**Tres roles de cliente**, con mundos de acceso separados (contenido / proyectos / financiero):

| Rol | Contenido | Proyectos (Gantt, entregables) | Financiero (contrato, cobros, facturas) |
|-----|-----------|-------------------------------|------------------------------------------|
| **Dueño** | ✅ | ✅ | ✅ (todo) |
| **Finanzas** | ❌ | ❌ | ✅ (contrato, facturado, por pagar, descargar facturas, a futuro pagar) |
| **Contenido/Proyectos** | ✅ | ✅ | ❌ (equivale al `client` actual) |

- **Administración de usuarios:** SOLO Color Media (admin) crea y asigna los usuarios y su rol,
  desde el panel. El cliente NO administra a su equipo. No hay sistema de invitaciones ni
  "admin del cliente" → menos superficie de riesgo.
- **Alta de usuario — DECISIÓN: invitación por correo (magic link).** El usuario se crea con
  correo + rol (sin contraseña); el sistema le envía un enlace para que él defina su propia
  contraseña. Más seguro (Color Media nunca conoce la contraseña del cliente) y más profesional.
  **Dependencia:** requiere el envío de correos, que todavía no existe (misma infraestructura que
  las notificaciones, funcionalidad 2). Por eso el alta definitiva por invitación queda pendiente
  hasta montar el correo. Orden sugerido: roles → envío de correo (base) → sobre esa base,
  invitaciones + notificaciones juntas.
  - **ESTADO ACTUAL:** Claude Code construyó un alta PROVISORIA con correo + contraseña inicial +
    rol (el método que ya usaba la app). Sirve para probar con usuarios reales ya. Se reemplaza
    por la invitación por correo cuando se monte el envío de correos.
- **ESTADO: estructura de roles CONSTRUIDA y verificada** (commit f8709d9): columna `client_role`
  (owner/finance/content) con backfill, `auth_client_role()`, RLS de los tres roles, vista
  `/portal/finanzas`, ruteo por rol. Pruebas 8/8: finanzas no ve proyectos/contenido/imágenes,
  contenido no ve financiero, dueño ve todo, ninguno ve otro cliente.
- **Finanzas es un rol acotado:** ve únicamente lo financiero + el contrato; no ve proyectos
  ni contenido.
- **Implementación:** el rol pasa de estar en `profiles.role` (hoy admin/client) a algo más
  fino: cada usuario cliente tiene un sub-rol (dueño/finanzas/contenido). Las políticas RLS de
  las tablas financieras (contracts, installments) deben permitir lectura a dueño y finanzas
  del cliente correspondiente, y seguir negándola a contenido. Verificar con los tres roles
  como en la Fase 6.
- **Base para otras funcionalidades:** notificaciones (a quién avisar) y pago con Flow (quién
  puede pagar) dependen de este modelo de roles.

### 4. Botón de pago con Flow (LO MÁS COMPLEJO)

Pago en línea de cada cuota/mes vía Flow (pasarela chilena). LA MÁS COMPLEJA: mueve dinero real.

- Convierte el panel en plataforma transaccional: integración con Flow, seguridad de
  pagos, confirmación/conciliación de qué se pagó, manejo de errores de transacción,
  webhooks de Flow.
- Se cruza con cobros (marcar la cuota como pagada al confirmar Flow) y con roles
  (quién puede pagar).
- Construir al final del bloque, sobre lo demás ya estable.

Decisiones de diseño (CONFIRMADAS):
- **Flujo:** en el portal (vista financiera), cada cuota pendiente tiene botón "Pagar". El cliente
  va a la página segura de Flow (no ingresa tarjeta en Media Core), paga, y al volver la cuota se
  marca pagada AUTOMÁTICAMENTE por confirmación de Flow (no a mano).
- **Quién paga:** solo dueño y finanzas (hereda la RLS financiera). Contenido no ve nada de esto.
- **Convive con el marcado manual:** los clientes que transfieren por fuera se siguen marcando a mano
  (como hoy); los que pagan por el botón se marcan solos. Ambos modos coexisten.
- **Cuenta Flow:** el usuario YA la tiene. Necesita Api Key + Secret Key (perfil Flow → seguridad).
  Hay llaves de sandbox (pruebas) y de producción.

**Plan de trabajo (CRÍTICO — mueve dinero):**
- Construir y verificar TODO primero en el **ambiente de pruebas (sandbox)** de Flow: botón → Flow →
  pago simulado → cuota pagada; y los casos de fallo (pago rechazado → cuota NO se marca; pago a medias;
  timeout). Solo al estar redondo, cambiar a llaves de producción (cobros reales).
- Confirmación robusta: Flow envía callback (responder HTTP 200 en <15s) + consultar getStatus por API.
  Nunca marcar pagada una cuota sin confirmación real de Flow. Guardar el token/orden de Flow por cuota.
- Comisión Flow (informativa, la paga Color Media): ~2,89% + IVA (abono 3 días) o 3,19% + IVA (1 día).
  Sin costo fijo ni mantención.
- Secret Key solo server-side (nunca al navegador), como todas las llaves sensibles.

**Detalles técnicos de Flow (de la doc oficial, verificada):**
- **Dos ambientes separados, cada uno con SUS llaves:**
  - Sandbox (pruebas, sin dinero): base URL `https://sandbox.flow.cl/api`; llaves desde
    `https://sandbox.flow.cl/app/web/misDatos.php`.
  - Producción (real): base URL `https://www.flow.cl/api`; llaves desde
    `https://www.flow.cl/app/web/misDatos.php`. (Las llaves de la captura del usuario son de PRODUCCIÓN.)
  - El cambio sandbox→producción es reemplazar llaves + base URL.
- **Flujo de pago:** `payment/create` (POST, firmado con HMAC-SHA256 usando secretKey) → responde `url` +
  `token` → redirigir al pagador a `url + "?token=" + token` → paga en Flow → Flow hace POST a
  `urlConfirmation` con el token → el comercio llama `payment/getStatus` con ese token para saber el
  resultado real (status 1 = pagado) y responde HTTP 200. También hay `urlReturn` para devolver al pagador
  a Media Core. **La cuota se marca pagada SOLO si getStatus confirma el pago.**
- **Firma:** todos los params se ordenan alfabéticamente, se concatenan nombre+valor, y se firman con
  HMAC-SHA256 usando la secretKey; el hash va en el parámetro `s`. (Claude Code implementa esto server-side.)
- **Tarjetas de prueba sandbox (Chile):** tarjeta crédito `4051885600446623`, CVV `123`, fecha cualquiera;
  banco simulado RUT `11111111-1`, clave `123`. Sirve para simular pago exitoso. Para Servipag/Multicaja/
  Mach/Cryptocompra hay simuladores con botón "aceptar". (Permite probar éxito y rechazo sin dinero real.)
- Montos en CLP (la cuota ya tiene su total en pesos congelado). Flow mínimo ~$350 CLP.

**Plan aprobado (Claude Code):** modelo `installment_payments` (1 fila por intento: token/orden Flow,
amount, status created|pending|paid|rejected|canceled|error), la cuota sigue siendo la fuente de verdad
del estado 'pagada'. Confirmación por triple validación (getStatus=2 + monto coincide + orden coincide),
idempotente, servidor-a-servidor firmada. Nunca marca pagada por la redirección sola. Callbacks públicos
(`/api/flow/confirm`, `/api/flow/return`) no confían en su input, solo usan el token para preguntar a Flow.
- **DECISIÓN de prueba de callback:** montar TÚNEL (ngrok/cloudflared) para probar el aviso automático
  server-a-server completo en sandbox (no solo el "Verificar pago"). Prueba el flujo tal como será en prod.
- Casos a probar en sandbox: happy path, rechazado, cancelado, idempotencia (doble callback = 1 marca),
  monto manipulado (no marca, registra error), roles (contenido no ve/paga, no pagar cuota de otro),
  callback ausente, ya pagada (bloqueado), coexistencia con marcado manual.
- **APROBADO por el usuario. Construir SOLO en sandbox. Pasar a producción recién tras verificar todo.**

**ESTADO: CONSTRUIDO Y VERIFICADO END-TO-END EN SANDBOX** (commit 882b081). Los tres pagos reales
(exitoso/rechazado/cancelado) probados contra sandbox.flow.cl con túnel cloudflared: la cuota se marca
pagada SOLO cuando Flow confirma (getStatus=2); ni rechazo ni abandono la tocan. Callback automático
server-a-server funcionando. Tabla final: happy path, idempotencia, rechazado, cancelado, callback
ausente, urlReturn, monto manipulado, ya pagada, contenido no ve/paga, no paga cuota de otro, idempotencia
BD, coexistencia con marcado manual — todos ✅. El round-trip real destapó y corrigió 2 bugs (RLS de
iniciarPagoFlow sin UPDATE → service_role; middleware rebotaba /api/flow/* a login → agregados a rutas
públicas, se autoprotegen con getStatus firmado).
- **PENDIENTE: paso a producción** (cuando el usuario lo decida). Cambiar en `.env.local`:
  FLOW_API_KEY/FLOW_SECRET_KEY a los de PRODUCCIÓN (los de la captura del usuario) + FLOW_API_URL=
  `https://www.flow.cl/api` + APP_URL al dominio público real del deploy (no un túnel). El código NO cambia.
  Se hace junto con / después del despliegue (Fase 7), cuando haya un APP_URL público estable.

⚠️ **PROBLEMA ABIERTO (2026-07-06) — CAUSA RAÍZ ENCONTRADA, FALTA CONFIRMAR:** Los pagos de prueba
(órdenes 8283820/8283829/8283882/8283889/8283910, todas serie sandbox 82838xx-82839xx, + 8282894) fueron
TODOS a sandbox. `/api/flow/health` decía `isSandbox: false` (producción) pero los pagos iban a sandbox.
**CAUSA (diagnosticada por Claude Code):** NO es el código (hay una sola fuente de URL: `FLOW_API_URL ??
sandbox` en `lib/flow.ts:16`, usada por createPayment, getStatus y health por igual; el checkout lo devuelve
Flow en `flow.url`, mismo entorno que createPayment — imposible separar orden y checkout). La contradicción
viene de Vercel/Next: la página de pago (`/portal/finanzas`) y su Server Action "Pagar" quedaron **clavadas
al deployment VIEJO** (que aún tenía FLOW_API_URL=sandbox) porque se abrió antes de que propagara el deploy
de producción. El health es un GET nuevo → va al deploy nuevo (producción) → dice false. La acción Pagar
corría en el build viejo (sandbox). **NINGÚN dinero real se movió — plata de prueba. El rechazo de la tarjeta
de débito real encaja: el checkout de sandbox de Webpay/Khipu no acepta tarjetas reales.** NO hay $1.000
que reembolsar (nunca fue real).
**✅ RESUELTO Y CONFIRMADO (2026-07-06).** La prueba en duro se hizo y el pago cayó en PRODUCCIÓN:
la pasarela cobra de verdad, con dinero real. Cómo se cerró:
- **Causa raíz confirmada tal cual el diagnóstico:** el health (`/api/flow/health`, GET nuevo) daba
  producción mientras la acción "Pagar" seguía clavada a un deployment viejo. En la sesión del 06-07 se
  repitió el patrón: producción servía un Current de 12h. Se **promovió el deployment nuevo** (quedó en
  `32f0c80` tras pushear los commits locales).
- **Health verificado sobre el Current correcto:** `isSandbox:false`, `apiHost:www.flow.cl`,
  `apiKeyTail:3909` (la llave de sandbox terminaba en F386), `vercelEnv:production`. Confirmado que el
  deployment que sirve `core.colormedia.cl` usa la cuenta de producción de Flow.
- **Pago chico real:** aprobado, cayó en el panel de producción de Flow, descontó de cartola real.

**Nota operativa clave (el gotcha que nos costó dos sesiones):** el `/api/flow/health` está protegido con
`?secret=$CRON_SECRET` (correcto — expone config). Sin el secret devuelve `{"ok":false}` (401), que NO es
un problema de Flow sino un rechazo de auth. No confundir. Y el health NO expone el SHA del commit, por eso
costó saber qué código servía producción → mejora pendiente abajo.

**SALVAGUARDA — CONSTRUIDA, PUSHEADA Y VIVA EN PRODUCCIÓN (commits `2856260` + refactor; en `origin/main`
desde `32f0c80`):**
- Columna `flow_env text` en `installment_payments` (nullable, SIN CHECK — auditoría forense, guarda el
  HOST CRUDO ej. `https://www.flow.cl/api`). Migración corrida; filas viejas `null`. `iniciarPagoFlow`
  escribe `flow_env: flowApiUrl()` al persistir el token.
- `assertFlowEnvSafe()` lanza `FlowEnvUnsafeError` si `VERCEL_ENV==='production' && flowIsSandbox()`; se
  llama al inicio de `createPayment`. Ante el error: intento `error`, no crea orden, log fuerte, redirige a
  `?pago=config` (banner sobrio con WhatsApp). Solo bloquea en producción.
- El ramal del catch quedó verificado por build/código; su estreno en runtime real será la primera fuga.
- **Pendiente menor:** confirmar en Supabase que la fila del pago real trae `flow_env: https://www.flow.cl/api`.

**Ya se puede exponer el pago en línea a clientes** (confirmado con dinero real). Antes estaba marcado a mano.

### 5. Subir PDF de factura (LA MÁS SIMPLE)

Adjuntar a cada cuota el PDF del DTE emitido en SII/Nubox, visible y descargable por el
cliente (según su rol). Es un archivador, NO un facturador: el panel solo guarda/muestra el
PDF que el admin ya generó fuera.

- Encaja con el diseño actual (el panel registra el cobro, no emite el DTE).
- Requiere: storage de archivos (Supabase Storage — ya en uso por contenido), campo en la cuota
  (installment), y control de visibilidad por rol de cliente.

Decisiones de diseño (CONFIRMADAS):
- **Quién sube:** solo el admin, desde el panel, adjuntando a cada cuota (installment). El cliente
  no sube, solo descarga.
- **Quién descarga (cliente):** solo dueño y finanzas (mismo criterio que el resto de lo financiero).
  Contenido NO lo ve. Hereda la RLS financiera existente.
- **Un PDF por cuota** (no varios archivos).
- **Dónde aparece:** en cobros del panel (junto a cada cuota, botón subir/reemplazar) y en la vista
  financiera del portal (dueño/finanzas, botón descargar en cada cuota facturada).
- Storage: bucket privado, signed URL corta para descarga, solo tras pasar RLS. El PDF nunca es
  accesible por contenido ni por otro cliente.

**Dependencias / orden sugerido:** la 5 (PDF) es independiente y rápida. La 1 (aprobación)
es la prioridad del usuario. La 3 (roles) conviene antes que la 2 (correo) y la 4 (Flow),
porque ambas dependen de saber qué usuarios y roles hay por cliente.

### 6. Identidad visual y de marca

Hacer que el sistema deje de verse genérico y lleve marca (la de Color Media y la de cada
cliente). Se apoya en el manejo de imágenes/Storage ya construido para la aprobación de contenido.

- **Logo de Color Media en el panel** (branding general del sistema).
- **Logo del cliente en su portal**, junto al de Color Media (co-branding en la cara del cliente).
- **Favicon/ícono por empresa:** ícono pequeño de cada cliente donde se lo menciona en el panel
  (tablas, fichas, listados), para identificación visual rápida.
- **Plantillas de correo con marca — HECHO (DESPLEGADO v1.14, commit `67b508f`):** los 6 correos
  automáticos rediseñados con identidad Color Media sobre una plantilla base única `emailShell` (ver
  "Identidad y plantilla de correo" en la sección de Notificaciones). Logo, paleta de marca, franja
  coral, `esc()` de variables. Verificado con render real + envío de prueba a Gmail.
- Requiere: campo de logo por cliente (subida desde el panel), logo global de Color Media, y
  aplicarlos en los lugares correspondientes de panel, portal y correos.

### 7. Nombre del sistema (naming)

**NOMBRE ELEGIDO: MEDIA CORE.** Sistema interno (no un producto que se vende). Nombre técnico,
hereda la marca sin depender de ella ("Media" de Color Media + "Core" = núcleo/centro de la
operación). Aplicarlo en: login, títulos del panel y portal, plantillas de correo (remitente/firma),
favicon, y el enlace "Acceso clientes" del sitio (p. ej. "entra a Media Core").

### 8. Secciones de contexto de la relación (ayuda-memoria para el cliente)

Tres secciones nuevas, orientadas a que el cliente entienda la relación (no operativas). Refuerzan
el Customer Experience: el cliente entra y recuerda de qué se trata el trabajo. Todas en ambas caras
(admin las llena, cliente las ve en su portal).

- **Estrategia.** Espacio con el enfoque estratégico que Color Media definió para ese cliente: de qué
  se trata el trabajo y hacia dónde apunta. Es la narrativa/sentido, no las tareas. Contenido único
  por cliente (lo llena el admin en la ficha del cliente; el cliente ve la suya en su portal).
  **DECISIÓN:** combina campos definidos (objetivo, público, mensajes clave) + un bloque de texto libre
  con formato. Solo el admin edita; el cliente (los 3 roles) solo ve.
- **Plan contratado (por ALCANCE, no por precio).** Muestra qué INCLUYE el plan del cliente —los ítems
  que se abordan: estrategia, desarrollo de avatar, plan de contenidos, etc.— SIN cifras. Deliberadamente
  separado de lo financiero (que vive en cobros y solo lo ven owner/finance). Aquí todos los roles del
  cliente ven el alcance de lo que contrataron, sin ver montos. Contenido por cliente.
  **DECISIÓN:** cada ítem = nombre + descripción + estado (activo/pendiente) → así el cliente ve qué se
  trabaja ahora y qué viene. Solo el admin edita; el cliente (los 3 roles) solo ve.
- **Datos bancarios de Color Media.** Sección de referencia con los datos de transferencia de la empresa,
  para que el cliente agregue a Color Media como proveedor en su banco. Datos FIJOS (los mismos para todos
  los clientes; se configuran una vez, no por cliente). Puramente informativo. **DECISIÓN:** global (una
  sola configuración para todos); visible a los 3 roles del cliente; solo el admin lo configura.

Confirmado: estrategia y plan son por-cliente y solo admin edita (cliente solo ve, los 3 roles); datos
bancarios son globales y fijos.

### 10. Generador de firmas de correo por cliente

Producto para clientes: Color Media diseña una plantilla de firma corporativa con la identidad del
cliente, y desde el panel del cliente se administran los funcionarios (como datos), se generan sus
firmas y se les envían por correo para que cada uno la copie en su cliente de correo. Según el plan.

**ENFOQUE MEJORADO (decisión del usuario) — los funcionarios NO son usuarios del sistema:**
- Un usuario del cliente con permiso (dueño, y por definir si contenido/finanzas) administra una lista
  de funcionarios (nombre, cargo, contacto — los datos que la firma necesita).
- Con un botón, genera las firmas (todas o una) y el sistema las ENVÍA por correo (Resend) a cada
  funcionario, lista para copiar/pegar. El funcionario nunca entra a Media Core — solo recibe su correo.
- Esto ELIMINA la tensión de seguridad de la versión anterior: no se crean usuarios funcionario, no se
  cambia el modelo "solo admin/roles crean accesos", no hay alta masiva de usuarios. Se apoya en el
  directorio de la ficha (funcionalidad 9) + envío de correo (funcionalidad 2), ambos ya construidos.
- El directorio de funcionarios de la ficha cobra propósito nuevo: de ahí salen las firmas.

Decisiones pendientes de pulir con el usuario:
- ¿Quién del cliente administra funcionarios y genera firmas: solo dueño, o también contenido/finanzas?
- **Funcionarios = el directorio de la ficha (funcionalidad 9)** (DECISIÓN): se reutiliza ese directorio,
  sumándole los campos que la firma necesite (p. ej. teléfono directo, cargo tal como va en la firma).
  No se duplican listas.
- **Carga masiva por planilla (DECISIÓN):** plantilla .xlsx descargable → el cliente/CM la llena (o la
  empresa desde su planilla de RRHH) → se importa y crea todos los funcionarios del directorio de golpe.
  Ideal para empresas grandes. Mismo patrón "descargar plantilla → llenar → importar" que el importador
  de fases (ver mejoras pendientes) — familia de importadores; construir uno enseña el otro.
- **Plantilla de firma:** ¿Color Media la diseña a medida por cliente, o hay formatos base que se
  personalizan con logo/color? (define el volumen de trabajo). HTML de correo robusto (tablas inline)
  para Gmail/Outlook/Apple Mail — mismo terreno que las plantillas de correo con marca.
- ¿"Según el plan": el generador se activa por cliente según lo contratado?

Decisiones finales de UI (aprobadas):
- **Estrategia con formato real:** el bloque de texto libre se guarda como Markdown y se renderiza
  (negritas, listas, títulos, links) con react-markdown.
- **Portal: TRES ítems separados en el nav** (no una página agrupada): "Estrategia", "Tu plan" (el plan
  por alcance) y "Datos de pago" (los datos bancarios). Visibles a los 3 roles, solo lectura.
- Modelo (Claude Code): `client_strategy` (1:1, objetivo/publico/mensajes_clave/cuerpo), `client_plan_items`
  (1:N, name/description/status activo|pendiente/sort_order), `company_bank_info` (singleton id=1, patrón
  de config global). Panel: tarjetas en `/clientes/[id]` (estrategia y plan) y en `/integraciones` (datos
  bancarios). RLS: SELECT admin o propio cliente; WRITE solo admin; bancarios SELECT cualquier autenticado.

### 9. Ficha completa de datos del cliente (autogestionada)

Una ficha con los antecedentes completos de cada empresa cliente, que el propio cliente llena y
mantiene desde su portal. Hoy el cliente es solo nombre + proyectos + cobros; falta el lugar con
sus datos. Le da al cliente una acción de escritura sobre SUS datos (como aprobar contenido).

Contenido:
- **Datos de empresa:** razón social, RUT, giro.
- **Domicilio** y **horarios de funcionamiento**.
- **Contactos / funcionarios:** lista (varias personas), cada una con nombre, cargo/rol, teléfono,
  correo. Es el "directorio" operativo del cliente — con quién hablar para qué. Diseñar como lista
  ampliable, no campos sueltos.

Decisiones de diseño (CONFIRMADAS):
- **Quién edita:** editable por ambos lados — el cliente la llena/mantiene desde el portal, y el
  admin también puede ver/editar/completar desde el panel.
- **Qué rol del cliente edita:** dueño y finanzas pueden editar; contenido la ve pero no la modifica.
- **Contactos/funcionarios = directorio informativo**, SEPARADO de los accesos al sistema. Agregar
  personas al directorio NO les da acceso al portal; el acceso se sigue manejando con usuarios/roles
  (funcionalidad 3). No mezclar.
- RLS: cada cliente solo su propia ficha; respeta roles (contenido solo lectura).

Modelo aprobado (Claude Code) — a construir:
- Dos tablas nuevas, separadas de `clients` (que sigue admin-only): `client_details` (ficha 1:1) y
  `client_contacts` (directorio 1:N, ampliable).
- `client_details`: razon_social, rut, giro, dirección/comuna/ciudad/region (domicilio ESTRUCTURADO),
  horarios (TEXTO LIBRE), notas, updated_at/by.
- **RUT se mueve a la ficha** (mantenible por el cliente, con backfill del actual). El admin lo sigue
  viendo/usando desde el panel para cobros.
- **razon_social** (legal, "Nocciola SpA") es distinta de `clients.name` (display, "Café Nocciola").
- `client_contacts`: name, role, phone, email, sort_order. Directorio informativo puro (sin relación
  con auth.users/profiles).
- RLS: lectura = admin o cualquier rol del propio cliente (los 3 ven); escritura = admin o dueño/finanzas
  del propio cliente (contenido solo lee).
- Panel: en `/clientes/[id]`, tarjetas "Ficha de la empresa" + "Contactos/funcionarios".
- Portal: página nueva **"Mi empresa"** (`/portal/ficha`), visible a los 3 roles; dueño/finanzas editan,
  contenido solo lee.

### 11. Alertas accionables y badges en el portal del cliente

Sistema de atención proactiva en el portal: que el cliente vea de un vistazo qué necesita su atención.
Es la versión visual, dentro del portal, de las notificaciones por correo (funcionalidad 2) — el correo
lo trae, las alertas lo guían una vez dentro. Refuerza fuerte el Customer Experience.

Dos partes complementarias:
- **Alertas accionables en "Qué viene"** (el home del portal): mensajes concretos con llamado a la acción.
  Ejemplos: "Tu próximo pago vence en X días", "Tienes 4 piezas de contenido por aprobar", "Tu próxima
  reunión es en 3 días — confirma asistencia". No es info pasiva; dice qué hacer y linkea a la sección.
- **Badges en el menú** (círculo rojo con número): indicador visual junto a cada ítem del nav con
  pendientes. Ej. "Contenido (4)" = 4 piezas por aprobar. Lenguaje universal (como WhatsApp/mail).

Consideraciones de diseño:
- **Respetar roles:** cada rol ve solo las alertas/badges de su mundo. La alerta de pago que vence solo
  la ven dueño/finanzas (financiero); el badge de contenido por aprobar, quien maneja contenido. Coherente
  con la RLS existente.
- Fuentes de cada alerta: pago que vence (cuota facturada impaga próxima), contenido por aprobar (piezas
  en estado propuesta), próxima reunión (evento kind=reunion cercano), quizás entregables. Definir el set
  y los umbrales (¿cuántos días antes avisa el pago?).
- Es lectura/cálculo sobre datos que ya existen — probablemente sin migración, o mínima.

Decisiones CONFIRMADAS (a construir antes del deploy, va en v1.00):
- **Tres alertas de entrada:** (1) pago próximo a vencer — avisa **7 días antes** (cuota facturada impaga,
  solo dueño/finanzas); (2) contenido por aprobar — apenas haya piezas en estado propuesta (solo roles que
  ven contenido); (3) próxima reunión — avisa **3 días antes** (evento kind=reunion).
- **Botón de confirmar asistencia (SÍ, en esta tanda):** en la alerta de reunión, el cliente ve la
  invitación y confirma asistencia con un botón. La confirmación queda visible para Color Media (quién
  confirmó / quién no). Escritura acotada del cliente (patrón "voto" como aprobar contenido). Probablemente
  requiere una tabla/campo para la confirmación → migración chica.
- **Badges en el nav:** círculo con número junto al ítem correspondiente (ej. Contenido = nº de piezas por
  aprobar), respetando el rol.
- Verificar: cada rol solo ve sus alertas/badges; un cliente no ve pendientes de otro; el botón de asistencia
  solo lo usa quien corresponde y sobre su propia reunión.
- Decisión pendiente: ¿la reunión con "confirmar asistencia" implica una acción de confirmar (escritura
  del cliente) o solo el aviso? Lo primero sería una mini-funcionalidad extra.
  **DECISIÓN:** sí — el cliente ve la invitación a la reunión en pantalla y confirma asistencia con un
  botón (escritura acotada del cliente, como aprobar contenido). La confirmación debería quedar visible
  para Color Media (quién confirmó, quién no). Mini-funcionalidad extra sobre las alertas.

### 12. Sello de identidad, versión del sistema y contacto comercial

Marca visible del sistema en ambas caras (panel admin y portal cliente). Es toque de identidad + una
vitrina comercial (cada cliente ve que Color Media desarrolla sistemas).

- **Sello:** en un pie de página o esquina discreta, visible en panel y portal: "Media Core · desarrollado
  por Color Media" + versión actual.
- **Versión visible:** mostrar la versión del sistema, arranca en **v1.00**.
- **Versionado (convención):** decimales para cambios menores (v1.00 → v1.01 → v1.14…); el entero sube en
  cambios mayores y resetea el decimal (v1.14 → v2.00). Definir dónde vive el número de versión (constante
  en el código, actualizable en cada deploy) para que sea fácil de subir.
- **Contacto comercial:** señalar que para un desarrollo de sistema a la medida pueden escribir a
  hola@colormedia.cl. En el pie del portal del cliente (vitrina) y/o del panel.
- Se cruza con la identidad visual (funcionalidad 6) y el nombre Media Core (funcionalidad 7): idealmente
  se aplica junto, en una pasada de branding. Es simple (texto + constante de versión), sin migración.

Decisiones a confirmar: ¿el contacto comercial va solo en el portal del cliente (vitrina) o también en el
panel? ¿La versión se actualiza a mano en cada deploy o se quiere algo automático?

Decisiones CONFIRMADAS:
- **Contacto comercial en AMBOS:** pie del panel y del portal ("¿Quieres un sistema a la medida?
  hola@colormedia.cl").
- **Versión:** el número (subir decimal/entero) lo fija el usuario — requiere criterio humano (solo él sabe
  si un cambio es menor o mayor). Pero se define en UN SOLO lugar (constante/config) y el sistema la MUESTRA
  automáticamente en todas las pantallas (panel + portal), junto con la fecha de última actualización (esta
  sí 100% automática). Arranca en v1.00.
- **Dirección de producción del sistema: `core.colormedia.cl`** (subdominio para el deploy — Fase 7).

### 13. Sección "Calendario" en el portal del cliente

Hoy hay confirmación de reuniones (funcionalidad 11) pero NO un lugar claro donde el cliente vea sus
reuniones y eventos con fecha — están dispersos. Esta sección los unifica y se vuelve el lugar único
de todo lo que tiene fecha. Detectado como faltante antes del deploy.

Capas (elegir alcance — algunas ya existen, otras son nuevas):
- **Capa base (mostrar):** vista de calendario en el portal con TODO lo que tiene fecha: reuniones,
  rodajes, entregas, hitos. Los datos YA existen (calendar_events sincronizados con Google, hitos de la
  Gantt, entregables con fecha) pero dispersos → reunirlos en una vista. Arriba, una tira de "próximos
  hitos" LIVIANA (no invocar la maquinaria pesada de la carta Gantt — solo leer fase/fecha).
- **Capa interactiva (ya existe):** confirmar asistencia a reuniones — reusar el botón/tabla
  `event_attendance` de la funcionalidad 11, mostrado en contexto del calendario.
- **Capa nueva (solicitar reunión):** el cliente solicita una reunión a Color Media desde el calendario
  → le llega la solicitud al admin (aviso por correo, Resend) → el admin agenda. Mini-flujo propio
  (solicitud → aviso → respuesta). Es escritura del cliente, acotada, con RLS.
- **Visión "el calendario conecta todo":** aterrizar en qué se conecta exactamente (reuniones, hitos,
  entregas, rodajes) — no dejar "todo" abierto para no volverlo infinito.

Respeta roles (cada rol ve los eventos de su mundo). Probablemente sin migración para la vista;
la solicitud de reunión sí necesitaría tabla. Definir alcance para v1.00 vs post-deploy.

**DECISIÓN: alcance COMPLETO antes del deploy (las tres capas, va en v1.00):** vista de calendario con
todo lo fechado + tira de próximos hitos liviana + confirmar reuniones en contexto + solicitar reunión a
Color Media (mini-flujo: cliente solicita → aviso al admin por Resend → admin agenda). Respeta roles.
"Conecta todo" = reuniones, hitos, entregas, rodajes (lo que tiene fecha), no un "todo" infinito.

Decisiones de diseño CONFIRMADAS:
- **Solicitar reunión:** el cliente incluye motivo + fecha/hora preferida + urgencia. **Cualquier rol**
  del cliente puede solicitar (pedir reunión es coordinación general, no sensible). Le llega al admin por
  correo (Resend) y queda registrada; el admin la agenda de verdad (crea el evento). Tabla nueva para las
  solicitudes.
- **Dos vistas con interruptor:** (a) mensual clásica (grilla de días) y (b) lista de próximos eventos por
  fecha. La mensual es la que más trabajo de diseño lleva.
- **Qué muestra el calendario:** reuniones, hitos, entregas, rodajes (todo lo que tiene fecha), leídos de
  las fuentes existentes (calendar_events, phases/hitos, deliverables). Tira superior de próximos hitos
  liviana (no invocar la Gantt pesada).
- Respeta roles (cada rol ve los eventos de su mundo). Confirmar asistencia reusa `event_attendance` (func. 11).

Decisiones finales (aprobadas, a construir):
- **Bandeja global de solicitudes** en el dashboard del admin (todas las solicitudes pendientes de todos
  los clientes en un lugar) + la tarjeta por cliente en cada ficha.
- **Finanzas NO ve el ítem Calendario** (se le oculta — su rol es solo financiero; la coordinación de
  reuniones la hacen dueño/contenido). Owner y content sí lo ven.
- Modelo `meeting_requests` (client_id, requested_by, reason, preferred_at, urgency baja|media|alta,
  status pendiente|agendada|descartada, admin_note). RLS: cualquier rol del cliente (que vea el calendario)
  crea su solicitud; solo admin agenda/descarta; cliente no edita tras enviar. Aviso al admin por Resend.
- Vista `/portal/calendario` con interruptor mensual (grilla) / lista, tira de próximos hitos y botón
  Solicitar reunión arriba. Sin migración salvo `meeting_requests`.

### 14. Calendario consolidado del panel de administración

**DECISIÓN: va en la v1.00 (antes del deploy), después de terminar el calendario del cliente (func. 13).**

Contraparte del calendario del cliente (func. 13), pero para Color Media: una vista que consolida los
eventos de TODOS los clientes en un solo lugar. Es la vista más valiosa para el operador — su panorama
para coordinar varios clientes a la vez. Detectado como asimetría: el cliente tendrá su calendario, el
admin necesita el consolidado.

- **Vista consolidada:** todos los eventos con fecha de todos los clientes (reuniones, rodajes, entregas,
  hitos) en una sola grilla/lista. Responde "¿qué tengo esta semana entre todos los clientes?", detecta
  choques (dos rodajes el mismo día), etc.
- **Distinguir de quién es cada evento** (lo que el calendario del cliente NO necesita): color por cliente
  y/o filtro para ver un cliente a la vez. Clave para no perderse entre eventos de varios clientes.
- **Integrar solicitudes de reunión** (func. 13): las solicitudes pendientes aparecen aquí también, para
  agendar viendo los huecos libres. Cierra el círculo: cliente pide desde su calendario → admin ve y agenda
  desde el suyo.
- **Consideración:** relación con Google Calendar — el admin ya tiene los calendarios de Google sincronizados.
  Este calendario debe agregar valor sobre eso (contexto del cliente a un clic, solicitudes integradas, todo
  dentro de Media Core) y no solo duplicar lo que Google ya muestra. Tenerlo presente al diseñar.
- Reusa las fuentes de fecha ya existentes (sin duplicar); probablemente sin migración propia.

Decisiones finales (aprobadas, a construir tras el calendario del cliente):
- **Distinguir clientes:** color por cliente + filtro para ver uno solo.
- **Solicitudes de reunión dibujadas en el calendario** (en su fecha preferida), para agendarlas viendo los
  huecos libres — cierra el círculo cliente pide → admin ve en su fecha y agenda. Además de la bandeja del dashboard.
- **Dos vistas con interruptor:** mensual (grilla) y lista, igual que el del cliente (consistencia).
- Sección propia "Calendario" en el menú del panel admin. Reusa el patrón del calendario del cliente (func. 13)
  y las fuentes de fecha existentes (calendar_events, deliverables, hitos, meeting_requests). Sin migración propia.

### 15. Crear eventos desde el calendario de administración

Cierra la asimetría de la func. 14: hoy el admin VE todo en su calendario consolidado pero no puede CREAR
desde ahí (es de solo lectura). El cliente solicita reunión, el admin la ve, pero no agrega directo. Esta
funcionalidad hace del calendario admin una herramienta de trabajo, no solo de consulta.

- **Crear desde el calendario:** clic en un día o botón "agregar" → crear una reunión / evento (rodaje, etc.)
  directamente en el calendario, eligiendo el cliente.
- **Sincronización con Google (CLAVE):** los eventos ya se sincronizan con Google Calendar (un calendario por
  cliente). Crear una reunión desde aquí debe usar ESA maquinaria existente, para que aparezca también en el
  Google Calendar del cliente. No reinventar — conectar el "agregar" con el mecanismo de creación+sync que ya existe.
- **Distinción por tipo (definir alcance):**
  - Reuniones y eventos sueltos (rodaje, etc.): naturales de crear desde el calendario → se sincronizan con Google.
  - Hitos: pertenecen a la Gantt de un proyecto (tienen proyecto padre, orden). Crear un hito "suelto" es más
    delicado — decidir si desde el calendario se enganchan a un proyecto existente, o si eso se sigue en la Gantt.
  - Entregas: también cuelgan de un proyecto.
- **Agendar una solicitud → crear el evento:** conecta con func. 13/14 — al agendar una solicitud de reunión,
  se crea el evento real (con sync a Google) en el hueco elegido.

Decisiones pendientes: ¿qué tipos se crean desde el calendario (solo reuniones/eventos, o también hitos/entregas
enganchados a proyecto)? ¿Se puede agendar una solicitud pendiente convirtiéndola directo en evento?

Decisiones finales (aprobadas):
- **Desde el calendario se crean REUNIONES y EVENTOS sueltos** (rodajes, etc.), eligiendo cliente, con sync a
  Google usando la maquinaria existente. **Hitos y entregas NO se crean desde el calendario** — se siguen
  creando en la ficha del proyecto (contexto de Gantt, bien enganchados). Igual aparecen dibujados en el
  calendario. (Evita descuadrar la planificación con hitos "sueltos".)
- **Agendar solicitud → crea el evento:** al agendar una solicitud de reunión pendiente, se convierte directo
  en evento real (con sync a Google) en el hueco elegido. Cierra el círculo cliente pide → admin agenda con un clic.
- Puede haber un enlace desde el calendario a la ficha del proyecto para agregar hitos/entregas allá.

### 16. Centros de ayuda (manuales integrados)

Dos manuales buscables por palabra clave, integrados como páginas dentro de Media Core:
- **Manual del cliente** (`/portal/ayuda`): tono cercano tuteando, cubre todo el portal con explicación de
  los 3 roles, diseño neutro/limpio. Base de contenido ya redactada (HTML entregado por Claude en chat:
  22 temas, buscador en vivo con palabras clave, etiquetas de rol por tema).
- **Manual del administrador** (`/ayuda` o similar): guía práctica paso a paso de cada tarea del panel,
  sección técnica aparte (migraciones, servicios, deploy, respaldos), con notas de cuidado en lo delicado
  (borrar cuotas, roles, cobros, portapapeles). Base ya redactada (HTML entregado: 26 tareas, 9 notas de
  cuidado, buscador en vivo).
- **Acceso: ícono "?" arriba a la derecha** en el encabezado de ambas caras (portal y panel), NO en el
  sidebar izquierdo (ese es para secciones de trabajo). Convención universal de ayuda.
- **DECISIÓN:** integrados como páginas del sistema (no archivo suelto), adaptando el HTML base al diseño
  de Media Core. Claude Code toma el contenido de los HTML entregados y los monta como rutas.
- Nota: revisar el contenido con el usuario antes de montar (los pasos se escribieron desde cómo se construyó
  cada función; ajustar si algún paso no calza con la pantalla real). Algunos temas (pago Flow, deploy) asumen
  el estado post-despliegue.

---


## Mejoras pendientes (no bloquean, pulir cuando haya tiempo)

- **Login: submit antes de hidratar.** Si el formulario de login se envía antes de que la página
  termine de cargar (hidratar), hace un GET y se queda en /login (hay que reintentar). No afecta a
  un usuario que tipea a velocidad humana (la página ya cargó), pero es una aspereza en lo primero
  que toca cualquiera. Pulir: deshabilitar el botón hasta hidratar, o un submit que no se pierda.

- **Importador de fases** (Camino A). Ver `importador-fases.md`. Cargar fases de un
  proyecto desde un bloque estructurado en vez de tipearlas a mano.
- **Descripción por fase.** Hoy las fases no tienen campo de descripción; el modal usa
  nombre + rango + avance. Agregar una descripción más rica por fase.

- **Zona horaria (pendiente, diagnosticar sin cambiar nada primero).** Los registros salen en UTC;
  confirmar que las horas se muestren en hora de Chile (`America/Santiago`), sobre todo en calendario y
  reuniones. Arreglo de dos lados (mostrar e ingresar). Diagnosticar con Code antes de tocar código.

- **SHA del commit en `/api/flow/health` (acordado 2026-07-06, hacer con calma).** Exponer
  `VERCEL_GIT_COMMIT_SHA` en el health para que un curl diga qué commit sirve producción. Ataca la raíz
  del enredo de las sesiones de Flow: no saber qué código estaba vivo. Commit chico, sin presión.

- **Endpoint `/api/mail/test` protegido con `CRON_SECRET` (opcional, acordado 2026-07-06).** Para disparar
  un `sendEmail` desde el runtime de producción vía curl y confirmar remitente sin depender de una acción
  con sesión. Herramienta repetible; construir cuando haya calma, no en medio de otra prueba.

- **Salvaguarda de APP_URL (viva en producción, commit `32f0c80`).** Helper `lib/app-url.ts` con `appUrl()`:
  fuente única para la URL base; en producción, si queda en localhost, escribe un `console.error` en los
  logs de Vercel (alarma pasiva, no bloquea). Calibrada distinto a la de Flow a propósito: Flow bloquea
  (mueve plata), APP_URL solo avisa (link roto es recuperable).
- ~~**Generación de cuotas más clara (Fase 5).**~~ **RESUELTO** (commit posterior a Fase 5):
  editor de tramos escalonados al crear contrato a plazo fijo, confirmación de generación con
  guard de doble generación (botón "borrar proyectadas y regenerar"), y editar/borrar cuota
  desde el panel con bloqueo de las facturadas/pagadas. Los tramos no se persisten: el
  escalonamiento vive en el `net_uf` de cada cuota, ajustable por cuota.

---

## En carpeta — próxima sesión (diseñar antes de construir, 2026-07-06)

Cinco funcionalidades pedidas por Ismael. NINGUNA construida aún. Cada una lleva mi lectura de
arquitecto y las decisiones a cerrar ANTES de que Code toque nada.

**1. Nombre + logo de empresa en el sidebar del portal cliente — ✅ HECHA y verificada (2026-07-06).**
Señal de pertenencia ("este acceso es de mi empresa"). Decisiones tomadas y construidas:
- **Sidebar del portal:** logo ARRIBA + nombre DEBAJO cuando hay logo; SOLO el nombre cuando no hay logo (sin
  hueco ni placeholder — el bloque se colapsa a solo texto). El nombre está SIEMPRE presente; el logo es
  acompañante opcional.
- **Fuente del nombre: `clients.name` (marca corta, ej. "Nocciola"), NO `client_details.razon_social`** (que
  es el nombre legal "Nocciola SpA", queda para lo legal). `clients.name` siempre está poblado. El diagnóstico
  reveló que el sidebar YA usaba `clients.name` — se mantuvo.
- **El logo respeta su PROPORCIÓN REAL** (`object-fit: contain`) dentro de una caja de `max-height: 56px` — un
  logo horizontal se ve como banda, uno cuadrado como cuadrado, ninguno rompe el layout. Verificado con logo
  horizontal (800×200, ratio 4:1) y cuadrado (400×400, 1:1): misma caja respeta ambas proporciones.
- **El nombre de empresa se QUITÓ del bloque de abajo** (`.sidebar-who`): arriba la identidad de la empresa
  (logo+nombre), abajo SOLO la persona logueada. Sin duplicar el nombre.
- **Subida desde el ADMIN** (ficha del cliente, componente `LogoForm` separado de `FichaForm`): Ismael sube el
  archivo YA LISTO, SIN editor de recorte. Valida solo imagen (mime image/*) + ≤2MB; guía suave sin rechazar
  por formato. Reemplazar (UUID nuevo por subida para evitar caché CDN obsoleta) y quitar.
- **Storage: bucket PÚBLICO `logos`** (lectura TO PUBLIC — carga sin sesión, ideal para marca; escritura solo
  admin via RLS `is_admin()`). `getPublicUrl` sin expiración. Migración `supabase/fase-logo.sql` (aditiva:
  columna `logo_path` en `client_details` + bucket + policies), corrida y verificada.
- **RLS verificada:** admin sube OK, portal no-admin BLOQUEADO, lectura pública sin sesión HTTP 200.
- Archivos: nuevos `LogoForm.tsx`, `fase-logo.sql`; modificados `ficha-actions.ts` (subirLogo/quitarLogo),
  admin `[id]/page.tsx`, portal `layout.tsx`, `lib/types.ts`, `globals.css`.
- Nota de método: la subida no se ejercitó por el selector de archivos real del navegador (los navegadores lo
  bloquean por script) — se replicó por sesión admin autenticada, misma RLS+storage+update. Validación de
  mime/peso revisada por código.

**2. Video en la previsualización de contenido — ✅ HECHA y verificada (3 fases completas, 2026-07-06).**
Creció de "agregar video" a "rediseñar la pieza para soportar múltiples medios ordenados de tipo mixto".
Fue la MÁS grande de las seis. Commits: Fase 1+2 `c588d44`, Fase 3 `4843a76`. Decisiones tomadas:
- **Una pieza puede tener imagen Y video juntos**, varios medios en orden (carrusel real, fiel al post).
- **Los medios cuelgan de la VERSIÓN, no de la pieza.** Cada versión es un snapshot inmutable de su
  conjunto de medios. Crear versión nueva = copiar el conjunto de la anterior para editar encima; la
  versión previa queda intacta. Así el historial muestra exactamente qué conjunto se aprobó.
- **Video = embed de YouTube/Vimeo SOLO** (NO subida directa, NO Instagram/TikTok — esos requieren scripts
  de terceros frágiles y además el contenido aún-no-publicado no existe en IG/TikTok al momento de aprobar).
  Flujo real: subir a YouTube/Vimeo "no listado" → aprobar ahí → publicar después en redes.
- **Formato vertical y horizontal** (16:9 / 9:16), reproductor responsivo; marcar formato al pegar el link.
- **Aprobación sobre la PIEZA COMPLETA** (todos los medios juntos), no medio por medio. El sistema de votos
  /versiones/confirmación EXISTENTE no se toca — opera sobre pieza/versión igual que hoy.

Modelo: tabla nueva `content_media` colgando de la versión — {pieza/versión, tipo imagen|video, orden,
y según tipo: ruta Storage | (url_embed + proveedor youtube|vimeo + formato vertical|horizontal)}.
Admin: subir varias imágenes y/o pegar links de video, ordenar, marcar formato. Portal: ver medios en orden
(imágenes + videos embebidos) y aprobar/rechazar la pieza completa.

**CONSTRUCCIÓN EN 3 FASES (con punto de control entre cada una):**

**FASE 1 — Modelo (✅ HECHA, migración corrida).** Tabla `content_media` colgando de `content_versions`
(ON DELETE CASCADE), enum `content_media_kind`, check de presencia por tipo, unique(version_id, sort_order),
índice, RLS espejo de `content_versions` (SELECT admin/owner-content por pieza no-borrador; WRITE solo admin).
Migración `supabase/fase-content-media.sql`, aditiva e idempotente. `content_versions.image_path` queda
vestigial (se dropea después). Sin datos reales (tablas de contenido vacías). Falta: commit del `.sql`.

**FASE 2 — Admin (✅ HECHA y verificada end-to-end 2026-07-06). Decisiones tomadas:**
- **Versionado:** mientras la pieza está en `borrador`, se edita la versión actual LIBREMENTE (agregar/quitar
  /reordenar medios) sin crear versiones. Al PROPONER al cliente, la versión queda congelada. Si el cliente
  pide cambios, ahí nace la versión nueva copiando los medios de la anterior (la lógica de copia física
  opción B se dispara SOLO en ese momento, no en cada guardado). Encaja con el status existente
  borrador→propuesta y con la RLS que ya oculta borradores al cliente.
- **Ordenar:** drag & drop con dnd-kit. Reorden en dos fases (sort_orders temporales negativos) para no
  violar unique(version_id, sort_order).
- **Video:** al pegar link, detecta PROVEEDOR automático (de la URL, fiable) y PRE-SELECCIONA formato con
  selector vertical/horizontal corregible de un clic. `lib/video.ts` parsea YouTube/Vimeo.
- **`crearVersion` ATÓMICO con rollback:** si falla cualquier copia de imagen, aborta y revierte (borra
  archivos copiados + fila de versión → cascade borra filas de medios). Orden clave: la pieza se apunta a la
  versión nueva SOLO al final, cuando todo se copió → el cliente nunca ve una versión a medio copiar. Es
  compensación manual (Storage+DB no comparten transacción), pero el invariante crítico se sostiene por el
  orden de operaciones. Verificado con Storage real (rollback 6/6, forzando fallo de copia).
- Acciones nuevas (todas con candado servidor `status==='borrador'`): agregarImagen, agregarVideo,
  quitarMedio, reordenarMedios, editarCopia. `subirVersion` partida en crearVersion (Rehacer) +
  proponerPieza. `eliminarPieza` ahora limpia Storage (cerró hueco preexistente de archivos huérfanos).
- "Rehacer" habilitado desde cualquier estado MENOS borrador y aprobada. `publicarPeriodo` (bulk 1ª ronda)
  + "Proponer" por pieza (re-rondas) se mantienen ambos.
- 🐛 **BUG ENCONTRADO Y CORREGIDO por el smoke test (aprendizaje para el proyecto):** `loadVersionCtx` hacía
  un embed ambiguo `content_pieces(...)` — `content_versions` tiene DOS FK hacia `content_pieces` (`piece_id`
  y el inverso `current_version_id`), → PGRST201 → la query devolvía null → todas las acciones de medios
  cortaban EN SILENCIO (el reorden se veía en pantalla pero no persistía). Fix: desambiguar con FK explícito
  `content_pieces!content_versions_piece_id_fkey(...)`. LECCIÓN: cuando dos tablas tienen relación por más de
  un FK, los embeds de PostgREST hay que desambiguarlos siempre — revisar si el patrón aparece en otras
  consultas. Un bug silencioso que un smoke test visual apurado no habría cazado.

**FASE 3 — Portal cliente (✅ HECHA y verificada end-to-end 2026-07-06). Decisiones tomadas:**
Es la más acotada: NO toca modelo ni crea lógica de aprobación (usa `content_reviews` + trigger
`apply_client_review` existentes). Es presentación + interfaz de voto sobre la vista de medios múltiples.
- **Grilla de miniaturas uniformes** (cuadrito parejo, recortadas cover) para ver TODO el conjunto de una.
  Videos en la grilla: thumbnail (YouTube estático `img.youtube.com/vi/{id}/hqdefault.jpg`; Vimeo por oEmbed
  server-side cacheado 24h, con FALLBACK a cuadrito+play si el fetch falla) + ícono play encima.
- **Lightbox PROPIO** (~110 líneas, no librería — el caso mixto imagen+iframe es donde las librerías se
  ponen frágiles): al tocar, se abre grande, cada medio en su PROPORCIÓN REAL completa (contain, no cover),
  imagen a tamaño completo, video = iframe real de YouTube/Vimeo. Flechas ‹›, cierre X/click afuera/Esc,
  bloqueo de scroll. VERIFICADO con imágenes no cuadradas: vertical 500×900 (ratio 0.556 intacto) y
  horizontal 1600×600 (escala al tope 1100px conservando ratio 2.667). El mecanismo: width/height auto +
  max-width/max-height, el navegador escala preservando ratio. Fix real que atrapó el smoke test: el
  lightbox colapsaba a 0×0 con `max-width:100%` sobre flex de ancho automático → corregido a límites vw/vh.
- **Voto: Aprobar / Pedir cambios con comentario OPCIONAL en AMBOS** (se relajó el `if(!comment)` que antes
  obligaba en Pedir cambios; se agregó campo opcional a Aprobar). Solo interfaz — sigue siendo fila en
  `content_reviews`, trigger/enum/estados intactos. Verificado en base: aprobar con comentario → persiste
  comentario + trigger a `aprobada_cliente`; pedir cambios sin comentario → `comment=null` + trigger a
  `cambios_solicitados`.
- **Historial navegable SECUNDARIO:** control discreto "ver versiones anteriores"; versión actual es el foco
  y la única votable; versiones viejas en SOLO LECTURA (grilla+lightbox, sin voto). La opción B de Fase 2
  (medios físicos por versión) es lo que lo hace navegable. La RLS existente ya cubría leer versiones/medios
  pasados del cliente — no hubo que tocar seguridad.
- Archivos: nuevos `lib/video-thumbs.ts`, `Lightbox.tsx`, `VoteBar.tsx`, `ContentPieceViewer.tsx`;
  modificados `page.tsx` (lee `content_media` de todas las versiones, deja de usar `image_path`), `actions.ts`
  (comentario opcional), `lib/video.ts`, `globals.css`; borrado `PedirCambiosForm.tsx`.

**✅ FUNCIONALIDAD DE CONTENIDO MULTI-MEDIOS COMPLETA (3 fases).** Pendiente: prueba de Ismael con contenido
REAL en producción (subir pieza con sus imágenes + video, verla del lado cliente) — Ismael eligió commitear
ya y probar en producción después (la feature aún no la ve ningún cliente). Y dropear `image_path` vestigial
en commit aislado cuando la prueba real confirme que nada lo usa.

⚠️ Cuidado para Code: medios cuelgan de la versión; con opción B (copia física por versión) cada versión es
autónoma → borrar una versión borra solo sus archivos, no puede afectar otra.
FASE futura (anotada, no ahora): archivar link del post ya publicado en IG/TikTok = otra funcionalidad
(registro de lo publicado), distinta de la previsualización para aprobar.

**3. Reporte de listado de sesiones (SIMPLIFICADO — solo esto).**
DECISIÓN: solo un listado de sesiones — **quién entró, qué día, a qué hora.** Nada más.
- Se DESCARTÓ el registro de acciones/auditoría (era el proyecto grande). No hay tabla de log de acciones,
  no se escribe en cada operación.
- Directo con lo que Supabase Auth ya registra (`last_sign_in` / sesiones). Un reporte de lectura.
- Dificultad: baja-media.

**4. Confirmación de envío de invitación — ✅ HECHA y verificada (2026-07-06). Alcance COMPLETO.**
Hoy al invitar/reenviar no se sabía si el correo salió. Construido:
- **Alcance completo:** confirmación INMEDIATA (Resend aceptó, se sabe en el acto) + WEBHOOK (entregado/rebotado
  /abierto).
- **Estado progresivo por invitación:** enviado → entregado → abierto; + rebotado/fallido. `lib/invitations.ts`
  con `shouldAdvance` (anti-regresión MONÓTONA: un evento fuera de orden no retrocede el estado — verificado).
- **Cada envío/reenvío = fila nueva** en tabla `client_invitations` (historial completo, no se pisa). El
  WEBHOOK actualiza la fila existente por su message_id (no crea otra): un envío = una fila que progresa.
  En el panel: agrupado por email, estado más reciente destacado + historial de intentos desplegable.
- **Vínculo crítico:** `data.id` del envío de Resend ↔ `data.email_id` del evento. Casó en los 4 eventos del test.
- **Webhook `/api/resend/webhook`:** verifica firma con `resend.webhooks.verify()` del SDK (Standard Webhooks
  /Svix, sin instalar svix — el SDK ya lo trae; mejor que HMAC a mano como Flow, es oficial y auditado) ANTES
  de tocar la base. Firma inválida → 401 sin escribir. Env `RESEND_WEBHOOK_SECRET`.
- 🐛 **BUG ENCONTRADO Y CORREGIDO por el smoke test:** el middleware de auth redirigía el webhook a `/login`
  (307) antes de llegar al endpoint → los eventos nunca se procesaban, estado se quedaba en "enviado" en
  SILENCIO. Fix: exentar `/api/resend` en `middleware.ts` (PUBLIC_PATHS), igual que Flow (se auto-protege por
  firma, no necesita sesión). LECCIÓN: todo webhook nuevo hay que exentarlo del middleware de auth.
- `sendEmail` ahora devuelve `{ok, id, error}` capturando el message-id (identidad de correo `notificaciones@`
  intacta — solo cambió el retorno; los otros 3 callers lo ignoran sin efecto).
- Archivos: nuevos `fase-invitaciones.sql`, `lib/invitations.ts`, `app/api/resend/webhook/route.ts`;
  modificados `lib/mail.ts`, `usuarios-actions.ts`, `middleware.ts`, admin `[id]/page.tsx`, `lib/format.ts`,
  `lib/types.ts`.
- ⚠️ **CONFIG EXTERNA PENDIENTE (Ismael, antes del push):** el código está listo pero NO funciona en producción
  hasta: (1) setear `RESEND_WEBHOOK_SECRET` real en Vercel, (2) dar de alta el endpoint
  `core.colormedia.cl/api/resend/webhook` en el dashboard de Resend. Sin esto el endpoint existe pero Resend
  no le manda eventos. Guiar por capturas.

**5. "Rol administrativo — todo menos finanzas" → ✅ RESUELTO SIN ROL NUEVO y verificado (2026-07-06).**
El diagnóstico reveló que el rol `content` YA es, en la práctica, "dueño menos finanzas" para VER. La ÚNICA
diferencia real: `content` no podía EDITAR la ficha de "Mi empresa". Resuelto abriéndole esa edición.
- **DECISIÓN: NO crear cuarto rol** (sería deuda técnica — dos roles casi idénticos que mantener coherentes).
  En su lugar, dar al rol `content` existente el permiso de editar la ficha. Con eso `content` = "dueño menos
  finanzas" completo. Cambio quirúrgico, sin enum nuevo, sin migración de roles, sin reasignar usuarios.
- **Alcance: AMBAS tablas de la ficha** — `client_details` (razón social, RUT, giro, dirección, etc.) Y
  `client_contacts` (directorio de contactos; son solo informativos, NO dan acceso al portal). No separar en
  dos permisos: reintroduciría la asimetría que evitamos al descartar el rol nuevo.
- **Dos capas a tocar:**
  - RLS: policies de escritura `client_details write` y `client_contacts write` pasan de `owner/finance` a
    `owner/finance/content`.
  - UI: en `ficha/page.tsx` el flag `editable = canSeeFinance(...)` debe incluir también a `content` (hoy una
    sola condición gobierna ambas tarjetas).
- ⚠️ **FINANZAS NO SE TOCA.** Solo se abre la ficha de empresa. El mundo financiero (contracts, installments,
  installment_payments, bucket facturas) sigue cerrado a `content`, idéntico. El cambio fue estrictamente esas
  dos tablas de la ficha.
- **VERIFICADO en base (smoke test 5/5):** content edita ficha (UPDATE pasa) y contactos (INSERT pasa); y SIGUE
  bloqueado en finanzas — installment_payments/contracts dan 42501 (RLS deniega), installments SELECT 0 filas.
  Se sembró contrato/cuota reales para que el bloqueo fuera genuinamente por RLS. UI: content ve el formulario
  editable, no la vista solo-lectura. Helper `canEditFicha` separado a propósito de `canSeeFinance` (que NO se
  tocó) para no acoplar la ficha a finanzas.
- Migración `supabase/fase-ficha-content-write.sql` (aditiva), corrida. Dificultad final: baja (el diagnóstico
  la redujo de "rol nuevo" a un cambio de permiso quirúrgico).

**Orden sugerido para retomar** (menor a mayor esfuerzo, victorias rápidas primero):
2 (embed video, decisión ya tomada) → 1 (nombre+logo) → 4-mínimo (confirmación de envío) → 3 (reporte de
sesiones) → 5 (rol administrativo).

**6. Sidebar colapsable en móvil (admin Y portal) — ✅ HECHA y verificada (2026-07-06).**
Era el SIDEBAR (no el panel entero): hecho para vivir al lado del contenido, en pantalla angosta se desparramaba.
- **En móvil (<768px):** barra superior fija con ☰ + logo; el contenido ocupa todo el ancho. Al tocar ☰, DRAWER
  lateral desde la izquierda con la navegación completa + perfil + cerrar sesión + ayuda (bajados del PageHeader,
  solo en móvil). Overlay detrás. Cierra al navegar (delegación de click), tocar overlay, o Escape.
- **En escritorio (≥768px):** IDÉNTICO a hoy — verificado por DOM: grid 232px 1fr, sidebar sticky, sin transform,
  topbar/overlay ocultos, cerrar-sesión+ayuda en el header. El cambio móvil no alteró nada del escritorio.
- **`AppShell` compartido:** se extrajo la duplicación del shell (admin y portal repetían el markup inline). Un
  componente client único que ambos layouts usan, pasándole su nav como prop. El mismo `.sidebar` sirve de fijo
  (escritorio) y drawer (móvil) según breakpoint CSS. Sin librería, estado efímero useState (sin localStorage).
- Verificado en admin Y portal, móvil Y escritorio (4 casos). 0 errores de consola.
- 🐛 Bugs cazados por el smoke test: estilos inline `display` (en `.header-actions` y `.sidebar`) que ganaban
  sobre el media query → movidos a CSS para que el breakpoint recupere control. LECCIÓN: un `style` inline
  sobrescribe siempre el media query; para togglear por breakpoint, el display va en CSS, no inline.
- Archivos: nuevo `components/AppShell.tsx`; modificados admin `layout.tsx`, portal `layout.tsx`,
  `PageHeader.tsx`, `globals.css`.

---

## ✅ LAS SEIS FUNCIONALIDADES DE LA CARPETA (2026-07-06) — COMPLETAS
1. Logo + nombre en sidebar del portal — HECHA (`e6c74b7`)
2. Contenido multi-medios (3 fases) — HECHA (`c588d44`, `4843a76`)
3. Reporte de sesiones — PENDIENTE (diseño simplificado; única de las 6 sin construir)
4. Estado de invitaciones (inmediata + webhook Resend) — HECHA (sin commitear aún)
5. Rol "administrativo" → resuelto abriendo edición de ficha a `content` (sin rol nuevo) — HECHA (sin commitear)
6. Sidebar colapsable en móvil — HECHA (sin commitear)
NOTA: quedó pendiente SOLO la #3 (reporte de sesiones). Las otras cinco, hechas.

---

## 🗂️ PROYECTO GRANDE — Sistema de tareas + equipo interno (diseño 2026-07-06, POR CONSTRUIR)

Ismael pidió "una sección de tareas": listado de tareas por hacer, cruzadas con usuarios, con responsable,
plazo estimado y check de cumplida. Al desglosarlo resultó ser un proyecto de TRES PIEZAS con dependencias —
NO se construye de un viaje. Orden acordado: **Pieza 1 (equipo interno) → Pieza 2 (tareas) → Pieza 3 (cruce Gantt).**

**Contexto que emergió del diseño:**
- Hay DOS tipos de tareas: INTERNAS (las hace el equipo de Color Media, el cliente NO las ve — ej. "editar el
  reel") y DEL CLIENTE (las hace el cliente y las ve/marca — ej. "recopilar datos", "hacer un estudio").
- Para asignar tareas internas hace falta que el EQUIPO INTERNO exista como usuarios. Hoy NO existe (el admin
  lo usa Ismael; no hay registro de miembros del equipo). Por eso el equipo es prerrequisito → Pieza 1.
- Ismael quiso roles internos completos (acceso restringido), NO solo una lista de personas. Eso convierte la
  Pieza 1 en un SISTEMA DE PERMISOS INTERNO — el proyecto más grande y delicado planteado hasta ahora (toca
  acceso a datos sensibles de TODOS los clientes: finanzas, contratos). Diseñar con máximo cuidado.

### PIEZA 1 — Equipo interno con roles (EN CONSTRUCCIÓN — Fases 0 y 1 HECHAS, 2026-07-06)
**Estado de construcción (commit `c784e4e`, migraciones corridas en Supabase):**
- ✅ **FASE 0 — Modelo (HECHA).** enum `admin_role`, columna en profiles, backfill (solo molox=owner tras
  eliminar la cuenta residual qa.admin), tabla `admin_assignments`, funciones `auth_admin_role`/`is_owner`/
  `is_staff`/`staff_sees_client`. Aditiva, sin cambio de comportamiento. Verificada.
- ✅ **FASE 1 — El flip (HECHA, el paso de máximo riesgo).** `is_admin()` redefinida = `is_owner()` (enfoque
  clave: cierra ~53 cláusulas solas para staff sin tocarlas) + `staff_sees_client/project/piece()` agregado a
  las 16 cláusulas de negocio (SELECT+WRITE). Atómica (begin/commit). ROLLBACK atómico escrito y en mano
  (`fase-admin-roles-1-flip-ROLLBACK.sql`) — no hizo falta. Verificado con baseline numérico tabla por tabla:
  OWNER ve idéntico al baseline en las 16 tablas (acceso intacto ✔); ejecutivo ve solo su asignado, 0 ajeno,
  0 finanzas, write ajeno bloqueado (42501); productor igual; portal cliente intacto. LA RLS —capa que de
  verdad protege— YA ESTÁ PUESTA Y VERIFICADA POR AMBAS CARAS.
- ✅ **FASE 2 — Gating de UI (HECHA 2026-07-06).** AdminNav filtrado por admin_role (fuente única en AdminShell),
  `requireAdminRole` en rutas con redirect a la home del rol (owner/ejecutivo→Resumen, productor→Proyectos).
  **Fuga de dashboard CERRADA en la raíz:** `v_dashboard`/`get_dashboard_stats` corrían con `createAdminClient()`
  (service_role) + SECURITY DEFINER → filtraban el ingreso recurrente TOTAL y la cartera completa a cualquier
  staff. Fix: quitado el service_role del dashboard (consulta con sesión del usuario, sujeta a RLS) y las
  funciones dejaron de ser SECURITY DEFINER ciegas → la RLS de Fase 1 filtra sola, sin filtros manuales por
  función. Dashboard por rol: owner=global con finanzas; ejecutivo=solo sus clientes SIN cifras de plata (las
  tarjetas financieras se omiten, no se muestran vacías); productor=sin Resumen. Verificado: owner ve los MISMOS
  totales globales que antes (no se rompió al quitar SECURITY DEFINER); ejecutivo acotado, cero finanzas por
  ninguna vía. Rendimiento sin impacto (datasets chicos). Es la parte de la Fase 2 que era SEGURIDAD real, no
  cosmética — cerrada.
- ✅ **FASE 3 — Blindaje service_role (HECHA 2026-07-06).** Auditoría de los 5 usos de service_role: los de
  lectura son auth/owner-only (sin fuga de negocio); el hueco real eran las 4 mutaciones de `usuarios-actions`
  (invitar, reenviar, cambiar rol, eliminar) que corren con service_role (esquivan RLS) y hacían solo
  `requireAdmin()` — que tras el flip incluye a staff → un ejecutivo podía invitar/mutar usuarios en clientes
  NO asignados. Fix: guard `canActOnClient(clientId)` (llama la misma `staff_sees_client` de la RLS con la
  sesión del llamador — una sola regla) en las 4. **ANTI-SPOOFING:** las 3 que operan sobre un usuario existente
  derivan el cliente DEL USUARIO OBJETIVO, no del form → cierra el ataque de pasar el client_id propio pero
  apuntar a un usuario ajeno. `crearCliente` → `requireOwner()` (defensa en profundidad; la RLS ya la cubría por
  is_owner). Verificado en datos reales: ejecutivo bloqueado en las 4 sobre cliente ajeno + anti-spoof + no crea
  cliente; owner todo. **Con esto la superficie service_role quedó cerrada: staff no puede leer NI actuar sobre
  clientes ajenos por NINGUNA vía (RLS + guards de mutación).**

**✅ PIEZA 1 SEGURA DE PUNTA A PUNTA** (Fases 0-3). Falta solo Fase 4 (UI de gestión, sin seguridad delicada).
- ✅ **FASE 4 — UI de gestión owner (HECHA 2026-07-06).** Sección "Equipo" solo-owner (`requireOwner` en ruta
  Y en cada acción): crear miembro interno (`invitarMiembroInterno`, acción SEPARADA de invitarUsuario para no
  cruzar privilegios — reusa el correo/Resend/estado de invitación existente, chequea email duplicado
  portal/interno), cambiar rol, eliminar, asignar/quitar clientes. Autoprotección: owner no puede quitarse
  owner ni auto-eliminarse. Estado intermedio resuelto: un miembro invitado pendiente tiene admin_role +
  asignaciones registradas pero NO puede loguearse hasta setear contraseña (Supabase Auth) — el poder nace con
  la aceptación, no con la invitación. Cambio de rol mantiene asignaciones; eliminar miembro las borra (cascade).
  Verificado dos caras: owner gestiona todo; ejecutivo/productor no ve la sección ni puede disparar sus acciones.

**✅✅ PIEZA 1 COMPLETA (Fases 0-4) — equipo interno con roles, de punta a punta.** Modelo + RLS con alcance +
gating UI + blindaje service_role + UI de gestión. El proyecto más grande y delicado de la sesión, verificado
fase por fase. Commits: `c784e4e` (0+1), `62301a7` (2), `b4e9139` (3), + Fase 4.
Sigue: PIEZA 2 (sistema de tareas) y PIEZA 3 (cruce Gantt) — el objetivo original, aún por diseñar.

**Diseño de referencia (cerrado):**
**Tres roles internos:**
- **Dueño (Ismael):** ve TODO — todos los clientes, todas las secciones, finanzas incluida. ÚNICO que
  gestiona el equipo y las asignaciones.
- **Ejecutivo:** ve SOLO sus clientes asignados; dentro de ellos, TODO MENOS finanzas.
- **Productor:** ve SOLO sus clientes asignados; dentro de ellos, SOLO contenido y proyectos (no finanzas, no
  estrategia/comercial).

**Dos dimensiones de permiso** (la RLS cruza AMBAS): (1) qué clientes ve — dueño=todos, ejecutivo/productor=
asignados; (2) qué secciones ve dentro de un cliente — según rol.

**MATRIZ DE SECCIONES COMPLETA (definida 2026-07-06 contra los ítems del sidebar admin):**
- **Dueño:** TODO — Resumen, Clientes (cartera global), Proyectos, Carta Gantt, Calendario, Entregables,
  Contenido, Cobros y contratos (finanzas), Bitácora, Integraciones. Todos los clientes. Único que gestiona
  equipo/asignaciones/Integraciones.
- **Ejecutivo** (SOLO clientes asignados): Proyectos, Contenido, Calendario, Entregables, Carta Gantt,
  Resumen, Bitácora — todo acotado a sus clientes. NO ve: Cobros/finanzas, Clientes-cartera global, Integraciones.
- **Productor** (SOLO clientes asignados): Proyectos, Contenido, Calendario, Entregables, Carta Gantt. NO ve:
  Resumen, Bitácora, Cobros/finanzas, Clientes-cartera global, Integraciones.
- **Diferencia ejecutivo vs productor = SOLO dos secciones:** Resumen y Bitácora (las ve el ejecutivo, no el
  productor). Todo lo demás lo comparten.

⚠️ **DOS MATICES CRÍTICOS DE CONSTRUCCIÓN:**
1. **"Clientes" (cartera global) vs. acceso puntual:** productor y ejecutivo NO ven el LISTADO global de
   clientes, pero SÍ deben acceder a la ficha operativa de sus clientes ASIGNADOS. La RLS debe bloquear el
   listado global pero permitir el acceso puntual a los asignados.
2. **Secciones que AGREGAN datos de varios clientes (Resumen, Bitácora):** para el ejecutivo NO basta con
   mostrar/ocultar — la sección debe RECALCULARSE filtrada por sus clientes asignados (el Resumen hoy es un
   dashboard GLOBAL: ingreso recurrente total, cartera completa; para el ejecutivo debe mostrar solo lo suyo).
   Esto es más trabajo que un sí/no de acceso. Punto de mayor cuidado.

**Piezas técnicas que requiere:**
- Registro de MIEMBROS DEL EQUIPO interno (persona + rol interno). Nuevo — hoy no existe.
- Tabla de ASIGNACIONES (miembro ↔ cliente).
- RLS nueva sobre las tablas del admin que cruza rol interno + asignación (más compleja que la del cliente,
  que solo mira client_id).
- Gating de UI en el panel admin según rol interno.
- UI de gestión (SOLO dueño) para crear miembros y asignarles clientes.

**Primer paso de construcción:** que Code mapee las secciones del ADMIN contra el código real (rutas, gating,
policies) para confirmar la matriz de arriba y ver CÓMO se controla hoy el acceso admin, antes de diseñar la
RLS. La matriz de secciones × rol YA está definida (arriba); el diagnóstico es para confirmarla contra el
código y planear la implementación (especialmente los dos matices críticos), no para redefinirla.

⚠️ Es un sistema de permisos sobre datos sensibles: el smoke test debe verificar las DOS caras por cada rol
(qué SÍ ve y —crítico— qué NO puede ver), como se hizo con el rol administrativo del cliente.

### PIEZA 2 — Sistema de tareas (DISEÑO CERRADO 2026-07-06, por construir)
El objetivo ORIGINAL del proyecto. Ahora tiene base: la Pieza 1 (equipo interno) da a quién asignar internas.
**Modelo de tarea:**
- **Dos tipos:** INTERNA (responsable = miembro del equipo interno) y DEL CLIENTE (responsable = usuario del
  portal). El TIPO determina de qué universo sale el responsable (dos tablas distintas — el campo responsable
  se interpreta según el tipo). Interna vive en mundo admin (RLS staff), del cliente en mundo portal (RLS cliente).
- **Toda tarea pertenece a un CLIENTE** (hereda su mundo de seguridad — NO hay tareas huérfanas sin cliente).
  La RLS de tareas se apoya en la existente: interna del cliente X → solo miembros asignados a X + owner; del
  cliente X → solo usuarios del portal de X. `staff_sees_client` + RLS de portal ya puestas hacen el trabajo.
- **Campos:** título/descripción, responsable, plazo estimado, estado.
**Estados (3): pendiente → hecha → confirmada.**
- pendiente → hecha: la marca el RESPONSABLE (interno o cliente según tipo).
- hecha → confirmada / devolver a pendiente: solo OWNER/equipo interno (control, no ejecución). El cliente NO
  confirma sus propias tareas.
- ⚠️ Las transiciones van GATEADAS por rol — no cualquiera que VEA la tarea puede moverla; depende de su papel.
**Vista:** sección "Tareas" GLOBAL en el admin (no dentro de cada cliente), acotada por rol vía la RLS existente
(owner ve todas; ejecutivo/productor solo las de sus clientes asignados — filtra sola). Cada tarea muestra de
QUÉ CLIENTE es (la vista cruza clientes). Filtros: cliente / estado / responsable / vencidas.
**Vencimiento:** visual (tarea vencida marcada, ej. rojo) + aviso DENTRO del sistema (contador/filtro de
"vencidas" en la sección). **Correo automático vía cron diario = 2ª ETAPA, NO ahora** (evaluar tras usar las
tareas un tiempo; la infra de crons ya existe — UF, calendario).

**ESTADO DE CONSTRUCCIÓN (2026-07-08):**
- **Fase A — modelo `tasks` + RLS (interna/cliente):** construida y verificada, aplicada en Supabase, commiteada
  (`b94490a`). Enums `task_type`/`task_status`, responsable único nullable, discriminador por tipo. RLS: SELECT/
  UPDATE del cliente acotados a `tipo='cliente' AND client_id=auth_client_id() AND auth_client_role() IN
  ('owner','content')`, y en el UPDATE `+ estado <> 'confirmada'` (using y with check) → confirmar/reabrir
  imposibles desde el portal por RLS.
- **Fase B — sección admin `/tareas` + acciones — CERRADA-CERRADA.** Lista PLANA con columna empresa + filtros
  por estado/empresa (no agrupada). Formulario con **selector de responsable CONDICIONADO por tipo** (interna →
  miembros internos; cliente → usuarios de portal de ESA empresa; se resetea al cambiar empresa/tipo; responsable
  nullable "sin asignar"). **Guard responsable↔tipo load-bearing** en `crearTarea` (perfil leído por service_role;
  interna⇒role=admin, cliente⇒role=client con client_id de la empresa): el smoke probó que **la RLS por sí sola
  ACEPTARÍA el combo malo** (cliente de una empresa con responsable de portal de OTRA) → el guard es la única
  barrera. **Completar por empresa, no por responsable:** `marcarHecha` la puede hacer cualquier staff con acceso
  al cliente. `confirmar`/`reabrir` solo staff.
- **Fase C — vista portal `/portal/tareas` — CERRADA-CERRADA.** `requirePortalWorld("content")` (finanzas no la
  ve). Company-wide: el cliente ve TODAS las tareas `cliente` de su empresa, con las suyas destacadas
  (`responsable_id === session.userId`, sin lookup). **Completar por empresa, no por responsable** también acá:
  cualquier owner/content marca hecha (`marcarHechaPortal`, pendiente→hecha). No puede confirmar ni reabrir
  (bloqueado por RLS: 42501 / 0 filas). **Confirmada = terminal y VISIBLE**, con badge y sin botones (cierra el
  ciclo, no se oculta). **Fetch de nombres de colegas ACOTADO** a tres condiciones del lado servidor:
  `client_id = session.clientId` (de la SESIÓN, nunca de input) + `role='client'` + `select` solo `id, full_name`
  (nada de email/rol/metadata).

✅ **PASE END-TO-END VERIFICADO (2026-07-08):** además del smoke a nivel RLS+lógica, se ejercitaron las server
actions REALES por HTTP (`crearTarea` / `marcarHechaPortal`) con sesiones autenticadas de verdad (ejecutivo
asignado solo a Real Data; portal owner de Cliente Prueba 2), 11/11:
  - **Fase B:** happy-path `cliente` + responsable de esa empresa → insertada `pendiente`; **combo malo** (responsable
    de otra empresa) → rechazada y **0 filas insertadas** (el guard corta ANTES del insert); interna + responsable
    interno → ok; el ejecutivo no ve clientes ajenos.
  - **Fase C:** `pendiente→hecha` company-scoped (marca quien no es el responsable) ok; **confirmar desde el portal →
    42501**; **reabrir una `confirmada` desde el portal → 0 filas**.
  Todo el andamiaje de prueba (ruta dev temporal, exención de middleware, cuenta ejecutivo de prueba) se eliminó
  al terminar; base y árbol de git limpios.

### PIEZA 3 — Consolidación reuniones + bitácora + entregables (COMPLETA, A–E · DESPLEGADA v1.12)
Reencuadre del scope original ("cruce con Gantt"): en vez de acoplar tareas a la Gantt, se construyó la
consolidación de reuniones/bitácora bajo el norte de "dos lentes sobre objetos tipados" (calendario hacia
adelante / bitácora hacia atrás). Todo DERIVADO de fuentes que ya existen — cero estado nuevo salvo la minuta.

Fases (desplegadas en v1.12; verificadas con smoke pos/neg de sesiones reales + pase end-to-end de UI):
- **A** `da50494` — modelo `meeting_minutes` + `meeting_minute_items` (1:1 con el `calendar_event`; `client_id`
  denormalizado) + RLS con **visibilidad DERIVADA del evento** (funciones security definer, sin copia que
  desincronizar; blindaje en fila, ítem y objeto de Storage) + bucket privado `minutas`.
- **B** `07fc7d5` — reunión como objeto con **ciclo de vida derivado** (`deriveReunionEstado` = fecha +
  `realizada`, sin estado guardado): marcar/desmarcar realizada, subir/reemplazar/quitar minuta (guard
  `canActOnClient` + RLS), pendientes; detalle en `/calendario/[eventId]`.
- **C** `458223d` — lente hacia adelante del calendario: tres tiras derivadas (por agendar / próximas /
  por documentar exhaustiva).
- **D** `744dd00` — bitácora ADMIN como VISTA que une reuniones/entregas/hitos/notas (reusa `actions`, sin tabla
  nueva; `lib/bitacora.ts` puro) + **fix de fuga de notify** en `crearAccion` (notifica solo si `visible_to_client`).
- **E** `e63671c` — portal `/portal`: pantalla única de 3 zonas (Te toca a ti / Lo que viene / Lo que ha pasado),
  reusa `mergeBitacora` con minuta descargable; internas cortadas por la RLS del cliente en cada fuente.
- **Fix reuniones de Google** `55f5610` — reconocer eventos de Google Calendar como reuniones documentables
  (marcar `kind` + enlace calendario→detalle), con marca **durable ante el re-sync** de Google. Desplegado v1.12.

**Deudas anotadas (no bloquean; pendientes de decisión/acción):**
1. **Puente pendientes→tareas DIFERIDO** (era el "cruce Gantt" original). La estructura quedó lista:
   `meeting_minute_items.promoted_task_id → tasks(id)` existe pero **sin cablear**. Activarlo = promover un
   pendiente de reunión a una tarea de Pieza 2. Nudo a resolver si se hace: sincronización cuando cambie/borre el origen.
2. **Fix del bucket `contenido`**: usa el mismo subquery inline a `admin_assignments` (owner-only por RLS) que
   bloqueaba al ejecutivo en `minutas` → un ejecutivo no sube/lee imágenes de contenido de sus clientes asignados.
   Fix = `staff_sees_client(...)` (security definer), igual que se aplicó en `minutas`.
3. **Aviso a contactos de Real Data**: durante el smoke de Fase D se enviaron ~8 correos de prueba reales a 4
   usuarios de portal de Real Data (se reusó un cliente real en un test que notifica). Lección aplicada: todo smoke
   que pueda mandar correo va aislado en cliente desechable con sinks. El aviso a esos contactos lo hace Ismael.

---

## Prompt de arranque para Claude Code

> Voy a construir una app Next.js (App Router, TypeScript) con Supabase y Tailwind, en Vercel. Es un panel de gestión de clientes con dos caras —panel interno de administración y portal de cliente en solo lectura— separadas por Row Level Security. La carta Gantt combina fases del proyecto con eventos de Google Calendar (sincronización bidireccional, un calendario de Google por cliente), y al abrir una barra muestra un modal con acciones, entregables y resultados. Adjunto `schema.sql`, `PLAN.md` y el prototipo visual `panel-colormedia.html`. Partamos por la Fase 1: crea el proyecto, conecta Supabase, deja el login por email y el `middleware.ts` que enruta según el rol del perfil. No avances a otras fases hasta que la Fase 1 funcione end to end.

---

## 🗂️ Flujo de aprobación en ENTREGABLES (COMPLETO · Fases 1-4 · DESPLEGADO v1.12–v1.13)

Ismael quiere que ENTREGABLES (manuales, reportes, piezas grandes — distinto de CONTENIDO = posts) tenga
flujo de aprobación del cliente. Diagnóstico confirmó: HOY inexistente para el cliente (solo ve/descarga link;
tabla deliverables sin estado de aprobación/comentario/versiones manejables por cliente).

ESTADO: COMPLETO (Fases 1-4), verificado con smokes de sesiones reales (cliente desechable) + pase
end-to-end de UI. Fases 1-3 desplegadas en v1.12; Fase 4 (motor de notificaciones) desplegada en v1.13.
- **Fase 1** `1dfc621` — modelo (enum `deliverable_approval`, campos de estado/comentario/respuesta) + RLS +
  bloqueo de archivo en DOS niveles (fila `deliverable_files` + objeto de Storage, gate por estado) + RPC
  `deliverable_client_respond`.
- **Fase 2** `dd58b28` — UI admin: crear borrador, enviar al cliente, reemplazar con re-bloqueo, ver respuesta;
  estado "En corrección" DERIVADO (borrador + responded_at), no un enum guardado.
- **Fase 3** `0713d7d` — UI cliente: sección `/portal/entregables` + "Te toca a ti" + aprobar/pedir cambios/
  rechazar (RPC), lenguaje de cliente sin jerga. Marcador `en_flujo_aprobacion` (solo `crearBorrador` lo marca)
  para distinguir el flujo nuevo de los legacy → un legacy nunca le aparece al cliente.
- **Fase 4** `5bbf6fb` (desplegada v1.13) — MOTOR de notificaciones por PERMISO + aviso al equipo cuando el
  cliente responde. `resolveClientStaff(clientId)` = owners (`admin_role='owner'`, ven a todos) ∪ asignados
  (`admin_assignments`), resueltos a correos: el equivalente server-side y por-conjunto de `staff_sees_client`
  (NO la lista global de `notifyEvent`, que era la fuga de Pieza 3 — ese motor viejo queda intacto).
  `notifyDeliverableResponse` avisa SOLO a quien puede ver el cliente; se dispara desde la acción del portal
  recién cuando la RPC confirmó (best-effort). Sin toggle: el permiso es el único filtro, el aviso siempre
  llega a quien corresponde. `resolveClientStaff` es reutilizable para los próximos casos del sistema de
  notificaciones (ver bloque de abajo). Verificado: smoke 12/12 + pase end-to-end con la función real corriendo
  por el enganche (cara negativa en el envío real: staff no asignado nunca entra a los destinatarios).

DECISIÓN DE ARQUITECTURA: implementación SEPARADA (opción B), no compartir con contenido. Razón: el flujo
de contenido está muy atado a su estructura (período/pieza/versión/multi-media/rollback) que entregables NO
necesita. Extraer algo compartido arrastraría esa complejidad o requeriría cirugía sobre contenido (que ya
funciona en prod). Un flujo propio y LIVIANO para entregables es mejor diseño, no deuda — cada objeto con el
flujo que su naturaleza pide. Lo que SÍ se reusa: el patrón de SEGURIDAD (RLS cliente, canActOnClient) y el
patrón de notificación de Fase D.

Ciclo de vida (cerrado con Ismael):

1. BORRADOR (Ismael crea + sube archivo) — el cliente ve TÍTULO/TIPO ("En preparación: X") pero NO el archivo.
   ⚠️ El archivo bloqueado a NIVEL DE DATOS (RLS fila + Storage objeto, patrón minutas) — NO solo botón oculto.
2. ENVIADO A REVISIÓN (botón "enviar al cliente", explícito — Ismael decide cuándo) → desbloquea el archivo,
   cliente puede abrir y responder.
3. Cliente responde: APROBADO / CAMBIOS SOLICITADOS / RECHAZADO. Comentario OPCIONAL en los tres.
   cambios = ajustar sobre lo mismo; rechazar = más grave, rehacer. Significados distintos a propósito.
4. Cambios/rechazo → Ismael corrige, REEMPLAZA el archivo (SIN historial de versiones — pisa la anterior),
   reenvía → vuelve a revisión.
5. Aprobado → cerrado.

Reglas transversales:

- Notificación al equipo cuando el cliente responde: PUNTUAL por ahora, respetando permisos/visibilidad (patrón
  Fase D: notificar solo a quien ve el dato). ⚠️ MARCADA PARA INTEGRAR al sistema de notificaciones (proyecto
  separado) después — hacerla BIEN desde el arranque para que integrarla sea reconectar, no rehacer.
- Reemplazo de archivo atómico (si la subida falla, no perder la anterior sin tener la nueva).
- Seguridad: cliente solo actúa sobre SUS entregables; archivo de borrador bloqueado en fila Y Storage.

Primer paso construcción: Code diseña modelo (campos nuevos en deliverables: estado, comentario_cliente,
visible/enviado) + RLS + la acción de bloqueo de archivo en borrador. Mostrar SQL antes de correr.

## 🔔 Sistema de notificaciones manuales — HECHO (DESPLEGADO v1.15)

**v1.15 — Notificaciones manuales contextuales (7 objetos).** Botón "Notificar" en cada objeto (tarea, reunión,
entregable, cobro, contenido, bitácora, hito) con selector Equipo/Cliente sin preselección. Principio: el
destinatario calca el predicado de lectura de la RLS; el gate de visibilidad de cliente se aplica antes de
resolver destinatarios (gates literales a la RLS en los 7). Resolutores: `resolveClientStaff` (los 6) +
`resolveOwnerOnly` (cobro, staff) + `resolveClientRecipients(clientId, world)` (content para los 6, finance para
cobro). Guard de actor: cobro → `isSessionOwner`; los 6 → `canActOnClient`. Doble muro en cobro (página
owner-only + render owner-only). Correos vía `manualNotifyEmail` sobre `emailShell`, con `esc()` en mensaje y
título. Cobertura: smoke 20/20 con motor real (`a630233`), guard de actor cobro probado end-to-end, guard
`canActOnClient` de los 6 probado end-to-end. Rollout: cobro `185f44b`, los 6 `e5e5984`.

---

**Origen / requisito (cumplido por v1.15):**

Ismael quiere un botón "enviar notificación" para empujar avisos manualmente ante muchos eventos (tarea
asignada, vencimiento de pago, etc.) a los usuarios que tengan PERMISO de ver esa info, con confirmación de
envío. ⚠️ PUNTO CRÍTICO DE SEGURIDAD: notificar sobre algo = revelar que existe. La notificación DEBE respetar
exactamente los permisos de visibilidad del dato (misma fuga que cerramos en Fase D con crearAccion). "Notificar
a quien tenga acceso" = calcular, por tipo de evento, quién puede ver ese dato según su rol, y notificar solo a
esos. Es un sistema de permisos de notificación, no un botón. La notificación de entregables (arriba) es el
primer caso que este sistema absorberá. POR DISEÑAR a fondo cuando Ismael lo priorice.

## 🎨 Rediseño del sistema visual (v2) — HECHO (DESPLEGADO v1.16)

**v1.16 — Rediseño del sistema visual (v2).** Color de dos capas: por sección/objeto +
por estado (fuente única: MAPA-ESTADOS-COLORES.md + lib/estado.ts), identidad de
cliente aparte. Recuadros con encabezado teñido por sección y colapsables donde hay
varias secciones; acciones por fila como iconos con tooltip (botón con texto para la
principal); panel slide-over para crear/editar; campos de texto visibles; tarjetas de
métrica neutras vs de estado teñidas. Nav reagrupada (Bitácora a Operación) con iconos
por sección. Aplicado a todo el panel + 404 con shell.

Rollout en rama `rediseno-v2` (9 commits), mergeada a `main` con `--no-ff` en `e6ec2bd`
para que el rediseño sea revertible como una unidad. Revisado página por página en la
base de STAGING, con datos sintéticos que cubren cada estado del MAPA.

Dos correcciones de fidelidad al MAPA que salieron del rollout: los entregables en flujo
ahora colorean por `approval_status` (§6) —antes mostraban siempre el `status` legacy— y
la bitácora perdió el semáforo (§9: no tiene estado, solo icono por tipo).

Decisiones tomadas donde el MAPA no llegaba: `phaseTone` (deriva del avance) y
`contractTone` (hereda la gramática de ciclo de vida); la SALUD de un sistema externo sí
es estado (Google conectado, Resend activo), a diferencia de "campo lleno" en una ficha,
que es eje de tipo. El rojo de hitos sigue sin ser derivable (§5 necesita un flag
`cumplido`).

## 🪟 Rediseño del portal del cliente (v2 adaptado) — HECHO (DESPLEGADO v1.17)

**v1.17 — Rediseño del portal del cliente (v2 adaptado).** El portal aplica el sistema
visual v2 pero con UN SOLO acento (teal): a diferencia del panel, no usa color por
sección/objeto (el cliente no piensa en dominios operativos). El color por ESTADO sí
aplica, SUAVIZADO: el rojo se reserva —una tarea vencida se muestra "Pendiente" ámbar
(sin "atrasada"), un rechazo del cliente va en gris. Excepción única: en Facturación la
cuota vencida sí va en rojo (info accionable). Etiquetas cliente-facing en fuente única
(lib/estado.ts: contentClient*/deliverableClient*/taskClient*), separadas de las internas.

Navegación consolidada de 12 a 7:
- **Inicio = tablero**: "Cómo va tu proyecto" (barra de avance %, próximo hito y reunión) +
  "Te toca a ti" (aprobaciones/entregables/tareas con acción y punto ámbar) + "Lo que viene".
- **Mi proyecto** ← Proyectos + Avance (Gantt en lectura) + Estrategia + la línea de tiempo
  "Lo que ha pasado" (movida desde Inicio para preservarla, incluidas las minutas).
- **Aprobaciones** ← Contenido + Entregables: lista única con pastilla de tipo, chip de
  estado + borde izquierdo por estado, acciones y filtros Todo/Contenido/Entregables.
- **Facturación** ← Finanzas + Tu plan + Datos de pago: tres tarjetas de estado ALINEADAS y
  teñidas (corrige el bloque desalineado de prod), cuotas con chip+borde por estado.
  GATE owner+finance vía requirePortalWorld("finance"): el rol content rebota por link
  directo, no solo oculto en el nav (guard de servidor).
- Calendario y Mi empresa migradas a clases base v2.

Rutas viejas redirigen 308 a las nuevas (next.config). Revisado en staging por los tres
roles del cliente (owner, content, finance); gate probado en ambas direcciones. Merge a
main con --no-ff (0027915) para que el rediseño sea revertible como unidad.

Decisiones tomadas donde el brief no llegaba: el historial "Lo que ha pasado" se movió a
Mi proyecto (el brief no lo ubicaba; borrarlo perdía las minutas); el pago en línea (Flow)
se conservó restilado (quitarlo sería regresión funcional, no cambio visual); las tareas
del cliente viven en el tablero de Inicio (redirect de /portal/tareas → /portal).

## 📦 Versiones + conversación en ENTREGABLES — HECHO (DESPLEGADO v1.18)

**v1.18 — Versiones + conversación en entregables.** El flujo era de una sola ronda y
DESTRUÍA información: cada envío ponía `client_comment`/`responded_*` en null, cada
reemplazo sobrescribía el archivo (ruta estable + upsert), el cliente solo podía hablar
una vez y el admin no podía responder. Ahora nada se sobrescribe.

Modelo (tablas GEMELAS de contenido, no compartidas — una RLS polimórfica se volvería
turbia justo donde la queremos calcable):
- **`deliverable_versions`**: `version_number`, `file_path` PROPIO por versión
  (`<cliente>/<entregable>/<versión>`, nunca upsert sobre ruta estable), `note`
  ("qué cambió"), + `deliverables.current_version_id`.
- **`deliverable_reviews`**: historial unificado **append-only** (`actor` client|admin;
  `kind` version|texto|comentario|aprobacion|cambios|rechazo), índice por
  `(deliverable_id, created_at)`.

RLS calcada del predicado de ENTREGABLES (`staff_sees_client` + `deliverable_sent_visible`),
no del de contenido. El cliente NUNCA hace UPDATE de estado: inserta su fila y el trigger
`apply_client_deliverable_review` la traduce. La RLS le impide escribir `version`/`texto`,
y solo acepta decisiones si está `enviado`; comentar, en cambio, se permite mientras esté
enviado+visible → **deja de quedar mudo tras responder**.

**UN SOLO GESTO:** mandar una corrección era 4 pasos en 2 pantallas (reemplazar → editar
texto → enviar → campanita) y olvidar uno dejaba al cliente esperando. Ahora "Subir versión
nueva" pide archivo + nota y hace todo junto: crea la versión, la envía y avisa, con la
casilla de aviso marcada por defecto. **La ficha del entregable se basta sola**: archivo
actual, editar texto, subir versión, responder al cliente, historial completo y versiones
anteriores descargables, sin salir a la ficha del proyecto.

**Notificaciones:** nace la dirección **admin→cliente** (`notifyDeliverableToClient`,
`resolveClientRecipients` mundo content) respetando el gate de visibilidad. Antes solo
existía cliente→staff, y el aviso al cliente dependía de apretar la campanita a mano.

**Portal:** "Lo último que te enviamos" (versión + su nota), "Conversación" con etiquetas
cliente-facing y estados suavizados, comentar SIN decidir, y versiones anteriores
descargables.

**Migración:** aplicada y verificada en PRODUCCIÓN ANTES del deploy (el SQL primero es
seguro: el código viejo ignora las tablas nuevas). La política de Storage se reemplaza para
entender la ruta por versión y **resuelve también la forma legacy**, o habría dejado
inaccesibles los archivos ya subidos. Backfill verificado fila por fila: la única v1 quedó
apuntando al archivo correcto, cero comentarios y cero respuestas sin migrar, el entregable
vivo intacto. `deliverable_files` no se borra.

**Reversa:** `fase-entregables-versiones-ROLLBACK.sql`. ⚠️ Dropear las tablas nuevas NO
basta: hay que restaurar primero la política de Storage, o el cliente pierde acceso a sus
archivos. La ventana de reversa limpia se cierra con la primera versión que se suba con
ruta nueva.

Respaldo previo de producción: `~/mediacore-backups/prod-mediacore-20260720-154312.sql`.
