# Mapa definitivo estado → color

Fuente única de verdad del semáforo del panel. Un mismo estado tiene el **mismo
color en todas las páginas** (leyenda, badges, Gantt, portal, listas y detalle).

Estados sacados del esquema real (`supabase/*.sql`) y de las derivaciones en
`lib/` (`reuniones.ts`, plazos de tareas). No hay estados inventados.

## Sistema: 4 colores

| Color | Significado |
|---|---|
| 🟢 **VERDE** | listo / aprobado / pagado / hecho / al día |
| 🟡 **ÁMBAR** | en espera / esperando acción (cliente o nosotros) / por cobrar |
| 🔴 **ROJO** | atrasado / vencido / rechazado |
| ⚪ **GRIS** | neutro / borrador / en curso interno / sin enviar / archivado |

**No hay 5º color.** Se evaluó azul para "proyecto cerrado" y se descartó: un
estado fuera del semáforo (archivado) se resuelve con gris, no ampliando la
paleta.

## Fuentes de verdad (objetos con dos modelos conviviendo)

- **Entregables:** manda `approval_status` cuando el entregable está en el flujo
  de aprobación (`en_flujo_aprobacion = true`); si no, manda `status` (legacy).
- **Cobros:** manda `installments` (cuotas, modelo nuevo). `billings` (cobros
  mensuales, legacy) **sigue vivo** con algunos clientes → se mantiene mapeado.
- **Pago Flow (`installment_payments`):** sin color en listas. Es el detalle
  técnico de la transacción; su resultado ya se refleja en el estado de la cuota
  (pagada/vencida). Solo se ve dentro del detalle.

---

## 1. Clientes — `client_status`

| Estado | Color | Motivo |
|---|---|---|
| `activo` | 🟢 VERDE | Relación vigente, al día. |
| `propuesta` | 🟡 ÁMBAR | Prospecto esperando cierre; requiere seguimiento. |
| `inactivo` | ⚪ GRIS | Relación terminada/archivada, sin actividad. |

## 2. Proyectos — `project_status`

| Estado | Color | Motivo |
|---|---|---|
| `activo` | 🟢 VERDE | En marcha. |
| `pausado` | 🟡 ÁMBAR | Detenido, en espera de reactivación. |
| `cerrado` | ⚪ GRIS | Archivado / fuera del pipeline. Neutro, no logro. |

## 3. Tareas — `task_status` (+ `plazo`)

| Estado | Color | Motivo |
|---|---|---|
| `pendiente`, sin vencer | 🟡 ÁMBAR | Por hacer. El color **no** depende del `tipo` (interna/cliente): el tipo tiene su propio pill; ejes separados. |
| `pendiente`, `plazo` vencido | 🔴 ROJO | Atrasada (derivado del plazo). |
| `hecha` | 🟢 VERDE | Hecha es hecha; "done es done". |
| `confirmada` | 🟢 VERDE | Cerrada y confirmada. |

> `hecha` y `confirmada` comparten verde a propósito. Si en alguna vista hace
> falta distinguirlas, se hace con label, no con color.

## 4. Reuniones

### 4a. Reunión (evento) — `ReunionEstado` (derivado de `starts_at` + `meeting_minutes.realizada`)

| Estado | Color | Motivo |
|---|---|---|
| `agendada` (futura) | ⚪ GRIS | Programada, nada que hacer aún. |
| `por_documentar` (ya pasó, sin minuta) | 🟡 ÁMBAR | Esperando acción nuestra: subir minuta. |
| `realizada` (con minuta) | 🟢 VERDE | Hecha y documentada. |

### 4b. Solicitud de reunión — `meeting_requests.status`

| Estado | Color | Motivo |
|---|---|---|
| `pendiente` | 🟡 ÁMBAR | Esperando acción nuestra: agendar. |
| `agendada` | 🟢 VERDE | Resuelta (la agendamos). |
| `descartada` | ⚪ GRIS | Descartada / no aplica. No es rechazo terminal. |

## 5. Hitos — `calendar_events` con `kind='hito'` (derivado por fecha + flag de cumplido)

| Estado | Color | Motivo |
|---|---|---|
| Próximo (futuro) | ⚪ GRIS | Neutro, lo que viene. |
| Cumplido | 🟢 VERDE | Hito alcanzado. |
| Vencido e incumplido (pasó y `cumplido = false`) | 🔴 ROJO | Se pasó la fecha sin cumplirse. |

> ⚠️ **Trabajo nuevo del rollout:** el rojo de hitos **no es derivable con el
> esquema actual**. Requiere agregar un flag de cumplido (`cumplido`/`logrado`)
> al hito, para poder distinguir "cumplido" de "solo pasó la fecha". Sin ese
> flag, hoy solo existen próximo (gris) / cumplido (verde).

## 6. Entregables — manda `approval_status` en flujo, `status` fuera de flujo

### 6a. `deliverable_approval` (flujo de aprobación — sistema vigente)

| Estado | Color | Motivo |
|---|---|---|
| `borrador` | ⚪ GRIS | Sin enviar. |
| `enviado` | 🟡 ÁMBAR | Enviado al cliente, esperando su respuesta. |
| `cambios_solicitados` | 🟡 ÁMBAR | Retrabajo pendiente. No es rechazo terminal. |
| `aprobado` | 🟢 VERDE | Aprobado. |
| `rechazado` | 🔴 ROJO | Rechazado (terminal). |

### 6b. `deliverable_status` (legacy — solo cuando NO está en flujo de aprobación)

| Estado | Color | Motivo |
|---|---|---|
| `en_proceso` | ⚪ GRIS | En curso interno. |
| `entregado` | 🟡 ÁMBAR | Entregado, esperando aprobación del cliente. |
| `aprobado` | 🟢 VERDE | Aprobado. |

## 7. Contenido — `content_status`

| Estado | Color | Motivo |
|---|---|---|
| `borrador` | ⚪ GRIS | Sin enviar. |
| `propuesta` | 🟡 ÁMBAR | Propuesto al cliente, esperando su revisión. |
| `cambios_solicitados` | 🟡 ÁMBAR | Esperando acción nuestra: aplicar cambios. |
| `aprobada_cliente` | 🟢 VERDE | Con el ok del cliente ya cuenta como aprobado. |
| `aprobada` | 🟢 VERDE | Aprobación final, lista para publicar. |
| `rechazada` | 🔴 ROJO | Rechazada (terminal). |

> `aprobada_cliente` y `aprobada` comparten verde. Si hace falta distinguir
> "falta cierre interno" de "cerrada", se hace con label, no con color.

## 8. Cobros / Cuotas

### 8a. Cuotas — `installment_status` (modelo vigente, el que se muestra)

| Estado | Color | Motivo |
|---|---|---|
| `proyectada` | ⚪ GRIS | Aún no facturada; futura/borrador. |
| `facturada` | 🟡 ÁMBAR | Por cobrar, esperando pago del cliente. |
| `pagada` | 🟢 VERDE | Pagada. |
| `vencida` | 🔴 ROJO | Vencida/atrasada. |
| `anulada` | ⚪ GRIS | Anulada, neutro. |

### 8b. Cobros mensuales — `billing_status` (legacy, aún en uso con algunos clientes)

| Estado | Color | Motivo |
|---|---|---|
| `pendiente` | 🟡 ÁMBAR | Por cobrar. |
| `pagado` | 🟢 VERDE | Pagado. |
| `vencido` | 🔴 ROJO | Vencido. |
| `anulado` | ⚪ GRIS | Anulado. |

### 8c. Pago Flow — `installment_payments.status` (SIN color en listas; solo detalle técnico)

Mapeo interno de referencia para la vista de detalle de la transacción:

| Estado | Color | Motivo |
|---|---|---|
| `created` | ⚪ GRIS | Iniciado, sin completar. |
| `pending` | 🟡 ÁMBAR | En curso, esperando confirmación de Flow. |
| `paid` | 🟢 VERDE | Pagado. |
| `rejected` | 🔴 ROJO | Rechazado. |
| `canceled` | ⚪ GRIS | Cancelado. |
| `error` | 🔴 ROJO | Fallo técnico; una alerta escondida es peor que verla. |

## 9. Bitácora (acciones) — `actions` (sin estado propio)

La bitácora es un registro de hechos consumados (reuniones realizadas, entregas
confirmadas, hitos cumplidos, notas). **No lleva semáforo:** se distingue por
**icono según `kind`** (reunión / contenido / rodaje / reporte) y color neutro.
El color de estado vive en el objeto vivo, no en el log. Por ser histórico, no
aparecen ÁMBAR ni ROJO.

| Caso | Color | Motivo |
|---|---|---|
| Nota / registro neutro | ⚪ GRIS | Solo memoria. |
| Hecho cerrado positivo | 🟢 VERDE | Algo que se cerró bien (opcional). |

---

## Apéndice — objetos menores (informativos, no semáforo del panel)

Se documentan para completar la fuente única; no son parte del semáforo
principal.

- **`invitations.status`** (`enviado`/`entregado`/`abierto`/`rebotado`/`fallido`):
  es telemetría de correo, no estado de negocio. Si se colorea: progresión
  enviado→entregado→abierto en neutro/verde; `rebotado`/`fallido` en 🔴 ROJO
  (problema de entrega).
- **`ClientPlanItem` / contexto `status`** (`activo`/`pendiente`): `activo` →
  🟢 VERDE (vigente); `pendiente` → 🟡 ÁMBAR (por activar).

## Colisiones de color a tener presente

Distintos estados comparten color a propósito (el color = grupo semántico, no
identidador único). Donde una vista necesite distinguirlos, se agrega label o
icono, nunca un color nuevo:

- Tarea `hecha` vs `confirmada` (ambos 🟢).
- Contenido `aprobada_cliente` vs `aprobada` (ambos 🟢).
- Entregable/contenido `enviado`/`entregado` vs `cambios_solicitados` (ambos 🟡).

## Pendientes de rollout que salen de este mapa

1. **Hitos:** agregar flag de cumplido para habilitar el 🔴 ROJO de hito
   vencido-e-incumplido (ver sección 5). Único cambio de esquema que exige este
   mapa; el resto de colores es derivable de estados ya existentes.
2. **`billings`:** sigue vivo; no depreciar por ahora. Revisar a futuro si migra
   del todo a `installments`.
