-- Let a masjid's team (not only the org owner) create and edit the masjid's Seeds.
-- Needs approval before it's applied to production: it adds policies to the existing fundraisers table.
create policy fundraisers_masjid_team_insert on public.fundraisers for insert
  with check (org_id is not null and exists (select 1 from public.organizations o where o.id = org_id and o.org_kind = 'masjid') and public.is_masjid_admin(org_id));
create policy fundraisers_masjid_team_update on public.fundraisers for update
  using (org_id is not null and exists (select 1 from public.organizations o where o.id = org_id and o.org_kind = 'masjid') and public.is_masjid_admin(org_id));
