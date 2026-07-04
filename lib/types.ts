// Tipos del dominio, alineados con supabase/schema.sql.

export type ClientSegment =
  | "corporativo"
  | "asuntos_publicos"
  | "pyme"
  | "personal_brand";

export type ClientStatus = "activo" | "propuesta" | "inactivo";
export type CurrencyKind = "UF" | "CLP";
export type ProjectStatus = "activo" | "pausado" | "cerrado";

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
  currency: CurrencyKind;
  base_amount: number;
  indexed_uf: boolean;
  billing_day: number;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
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
