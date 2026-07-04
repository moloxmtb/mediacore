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
  created_at: string;
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
