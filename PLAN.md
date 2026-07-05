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

El panel vive en su propio subdominio bajo la marca, p. ej. `panel.colormedia.cl`
o `clientes.colormedia.cl` (nombre por definir). El sitio institucional
`colormedia.cl` (WordPress, ya existente) suma un enlace visible **"Acceso
clientes"** que redirige al login del panel. Sitio y panel quedan independientes:
la web es la vitrina pública, el panel es la herramienta privada tras el login.

Checklist de despliegue (pasa de local a producción):

- Subdominio elegido, apuntado al proyecto en Vercel (DNS).
- Enlace "Acceso clientes" agregado en WordPress (`colormedia.cl`) → apunta al subdominio.
- Variables de entorno cargadas en Vercel (las mismas del `.env.local`).
- **Redirect URI de Google:** sumar la versión de producción
  `https://SUBDOMINIO/api/auth/google/callback` en el OAuth Client de Google Cloud
  (mantener también el de localhost para desarrollo).
- Cron de UF y de sincronización de calendario configurados en Vercel.
- Repaso final de RLS con la anon key. Definir respaldo de la base.

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
  - **Dirección de envío (from):** `marketing@colormedia.cl`.
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

Pago en línea de cada cuota/mes vía Flow (pasarela chilena).

- Convierte el panel en plataforma transaccional: integración con Flow, seguridad de
  pagos, confirmación/conciliación de qué se pagó, manejo de errores de transacción,
  webhooks de Flow.
- Se cruza con cobros (marcar la cuota como pagada al confirmar Flow) y con roles
  (quién puede pagar).
- Construir al final del bloque, sobre lo demás ya estable.

### 5. Subir PDF de factura (LA MÁS SIMPLE)

Adjuntar a cada cuota el PDF del DTE emitido en SII/Nubox, visible y descargable por el
cliente (según su rol).

- Encaja con el diseño actual (el panel registra el cobro, no emite el DTE).
- Requiere: storage de archivos (Supabase Storage), campo en la cuota, y control de
  visibilidad por rol de cliente.

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
- **Plantillas de correo con marca:** los correos automáticos (invitación, notificaciones) son
  otra superficie de marca. La invitación es el PRIMER correo que recibe el cliente del sistema.
  Al construir el correo (funcionalidad 2), Claude Code hace plantillas simples y funcionales;
  el diseño con identidad (logo, colores, tono, firma) se trabaja aquí, junto con el resto de la
  identidad, para que quede coherente de una vez. Nivel objetivo: intermedio (marca cuidada, sin
  sobrediseñar).
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

---

## Mejoras pendientes (no bloquean, pulir cuando haya tiempo)

- **Importador de fases** (Camino A). Ver `importador-fases.md`. Cargar fases de un
  proyecto desde un bloque estructurado en vez de tipearlas a mano.
- **Descripción por fase.** Hoy las fases no tienen campo de descripción; el modal usa
  nombre + rango + avance. Agregar una descripción más rica por fase.
- ~~**Generación de cuotas más clara (Fase 5).**~~ **RESUELTO** (commit posterior a Fase 5):
  editor de tramos escalonados al crear contrato a plazo fijo, confirmación de generación con
  guard de doble generación (botón "borrar proyectadas y regenerar"), y editar/borrar cuota
  desde el panel con bloqueo de las facturadas/pagadas. Los tramos no se persisten: el
  escalonamiento vive en el `net_uf` de cada cuota, ajustable por cuota.

---

## Prompt de arranque para Claude Code

> Voy a construir una app Next.js (App Router, TypeScript) con Supabase y Tailwind, en Vercel. Es un panel de gestión de clientes con dos caras —panel interno de administración y portal de cliente en solo lectura— separadas por Row Level Security. La carta Gantt combina fases del proyecto con eventos de Google Calendar (sincronización bidireccional, un calendario de Google por cliente), y al abrir una barra muestra un modal con acciones, entregables y resultados. Adjunto `schema.sql`, `PLAN.md` y el prototipo visual `panel-colormedia.html`. Partamos por la Fase 1: crea el proyecto, conecta Supabase, deja el login por email y el `middleware.ts` que enruta según el rol del perfil. No avances a otras fases hasta que la Fase 1 funcione end to end.
