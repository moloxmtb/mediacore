-- ============================================================
--  "MI EMPRESA" EDITABLE TAMBIÉN POR EL ROL content
--  Correr en Supabase → SQL Editor. Idempotente.
--
--  Único cambio: las policies de ESCRITURA de client_details y client_contacts
--  pasan de owner/finance a owner/finance/content. Abre solo la ficha de la
--  empresa (antecedentes + contactos). NO toca finanzas ni ninguna otra policy.
--  El SELECT de ambas ya era abierto a cualquier rol del propio cliente y no se
--  modifica. Aditiva: solo amplía el conjunto de roles permitidos.
-- ============================================================

drop policy if exists "client_details write" on client_details;
create policy "client_details write" on client_details for all
  using (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance','content')))
  with check (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance','content')));

drop policy if exists "client_contacts write" on client_contacts;
create policy "client_contacts write" on client_contacts for all
  using (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance','content')))
  with check (is_admin() or (client_id = auth_client_id() and auth_client_role() in ('owner','finance','content')));
