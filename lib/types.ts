// Tipos del dominio, alineados con supabase/schema.sql.

export type ClientSegment =
  | "corporativo"
  | "asuntos_publicos"
  | "pyme"
  | "personal_brand";

export type ClientStatus = "activo" | "propuesta" | "inactivo";
export type CurrencyKind = "UF" | "CLP";
export type ProjectStatus = "activo" | "pausado" | "cerrado";
export type DeliverableStatus = "en_proceso" | "entregado" | "aprobado";
export type ContractModality = "proyecto" | "plazo_fijo" | "retainer";
export type InstallmentStatus =
  | "proyectada"
  | "facturada"
  | "pagada"
  | "vencida"
  | "anulada";
export type EventSource = "google" | "panel";
export type ClientRole = "owner" | "finance" | "content";
export type AdminRole = "owner" | "ejecutivo" | "productor";

export type ClientDetails = {
  client_id: string;
  razon_social: string | null;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  region: string | null;
  horarios: string | null;
  notas: string | null;
  logo_path: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type ClientContact = {
  id: string;
  client_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
};

export type InvitationStatus =
  | "enviado"
  | "entregado"
  | "abierto"
  | "rebotado"
  | "fallido";

export type ClientInvitation = {
  id: string;
  client_id: string;
  user_id: string | null;
  email: string;
  kind: "invite" | "recovery";
  message_id: string | null;
  status: InvitationStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientStrategy = {
  client_id: string;
  objetivo: string | null;
  publico: string | null;
  mensajes_clave: string | null;
  cuerpo: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type PlanItemStatus = "activo" | "pendiente";

export type ClientPlanItem = {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: PlanItemStatus;
  sort_order: number;
  created_at: string;
};

export type CompanyBankInfo = {
  id: number;
  razon_social: string | null;
  rut: string | null;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  email: string | null;
  notas: string | null;
  updated_at: string;
};

export type EventAttendance = {
  id: string;
  event_id: string;
  client_id: string;
  user_id: string;
  attending: boolean;
  created_at: string;
  updated_at: string;
};

export type MeetingUrgency = "baja" | "media" | "alta";
export type MeetingRequestStatus = "pendiente" | "agendada" | "descartada";

export type MeetingRequest = {
  id: string;
  client_id: string;
  requested_by: string;
  reason: string;
  preferred_at: string | null;
  urgency: MeetingUrgency;
  status: MeetingRequestStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentPeriodKind = "mensual" | "quincenal" | "semanal";
export type ContentStatus =
  | "borrador"
  | "propuesta"
  | "aprobada_cliente"
  | "cambios_solicitados"
  | "aprobada"
  | "rechazada";
export type ReviewKind =
  | "aprobacion"
  | "cambios"
  | "comentario"
  | "confirmacion"
  | "devolucion";
export type ReviewActor = "client" | "admin";

export type Client = {
  id: string;
  name: string;
  segment: ClientSegment;
  status: ClientStatus;
  rut: string | null;
  contact_email: string | null;
  accent_color: string | null;
  google_calendar_id: string | null;
  created_at: string;
};

export type Contract = {
  id: string;
  client_id: string;
  modality: ContractModality;
  currency: CurrencyKind;
  has_iva: boolean;
  net_uf: number | null; // neto en UF (modo UF)
  net_clp_fixed: number | null; // neto en CLP (modo CLP fijo)
  installments_count: number | null; // N cuotas (proyecto/plazo_fijo; null retainer)
  billing_day: number;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type Installment = {
  id: string;
  contract_id: string;
  client_id: string;
  number: number;
  currency: CurrencyKind;
  net_uf: number | null;
  net_clp_fixed: number | null;
  has_iva: boolean;
  iva_rate: number;
  due_date: string;
  status: InstallmentStatus;
  // Congelado al facturar:
  uf_value: number | null;
  net_clp: number | null;
  iva_clp: number | null;
  total_clp: number | null;
  issued_at: string | null;
  dte_type: number | null;
  dte_number: string | null;
  paid_at: string | null;
  invoice_pdf_path: string | null;
  invoice_pdf_uploaded_at: string | null;
  created_at: string;
};

export type InstallmentPaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "rejected"
  | "canceled"
  | "error";

export type InstallmentPayment = {
  id: string;
  installment_id: string;
  client_id: string;
  commerce_order: string;
  flow_token: string | null;
  flow_order: string | null;
  amount: number;
  status: InstallmentPaymentStatus;
  payer_email: string | null;
  created_by: string | null;
  flow_env: string | null; // host crudo de Flow usado al crear el pago (trazabilidad)
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

export type Project = {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export type Phase = {
  id: string;
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  sort_order: number;
  created_at: string;
};

export type Deliverable = {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  url: string | null;
  status: DeliverableStatus;
  result: string | null;
  delivered_at: string | null;
  visible_to_client: boolean;
  created_at: string;
};

export type Action = {
  id: string;
  client_id: string;
  project_id: string | null;
  phase_id: string | null;
  action_date: string;
  title: string;
  description: string | null;
  result: string | null;
  kind: string | null;
  visible_to_client: boolean;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  client_id: string;
  project_id: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  kind: string | null;
  source: EventSource;
  visible_to_client: boolean;
  synced_at: string | null;
  created_at: string;
};

export type ContentPeriod = {
  id: string;
  client_id: string;
  kind: ContentPeriodKind;
  label: string;
  start_date: string | null;
  end_date: string | null;
  published: boolean;
  created_at: string;
};

export type ContentPiece = {
  id: string;
  period_id: string;
  client_id: string;
  title: string;
  sort_order: number;
  current_version_id: string | null;
  status: ContentStatus;
  created_at: string;
};

export type ContentVersion = {
  id: string;
  piece_id: string;
  version_number: number;
  image_path: string | null;
  body: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ContentMediaKind = "imagen" | "video";

export type ContentMedia = {
  id: string;
  version_id: string;
  kind: ContentMediaKind;
  sort_order: number;
  storage_path: string | null; // imagen: ruta en bucket 'contenido'
  embed_url: string | null; // video
  provider: string | null; // 'youtube' | 'vimeo'
  orientation: string | null; // 'vertical' | 'horizontal'
  created_at: string;
};

export type ContentReview = {
  id: string;
  piece_id: string;
  version_id: string | null;
  actor: ReviewActor;
  kind: ReviewKind;
  comment: string | null;
  created_by: string | null;
  created_at: string;
};
