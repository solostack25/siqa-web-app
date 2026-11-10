-- Donations only for organizations with proven 501(c)(3) status.
--
-- Google Play and the App Store only allow donations to validated
-- tax-exempt charities (e.g. a 501(c)(3)). Being a verified org on Siqa
-- isn't enough on its own, so an org now uploads proof (IRS determination
-- letter, or the IRS Tax Exempt Organization Search result) and a Siqa
-- admin checks it. create-payment-intent refuses donations until then.

alter table public.organizations
  add column if not exists tax_exempt_status text not null default 'none',
  add column if not exists tax_exempt_doc_url text,
  add column if not exists tax_exempt_note text,
  add column if not exists tax_exempt_submitted_at timestamptz,
  add column if not exists tax_exempt_verified_at timestamptz,
  add column if not exists tax_exempt_verified_by uuid references auth.users(id) on delete set null;

alter table public.organizations drop constraint if exists organizations_tax_exempt_status_check;
alter table public.organizations
  add constraint organizations_tax_exempt_status_check
  check (tax_exempt_status in ('none', 'pending', 'verified', 'rejected'));

comment on column public.organizations.tax_exempt_status is
  'none | pending (proof uploaded) | verified (Siqa checked 501(c)(3)) | rejected. Donations require verified.';

-- Owners may upload proof (-> pending). Only Siqa admins (or the server)
-- can mark it verified or rejected.
create or replace function public.organizations_guard_tax_exempt()
returns trigger language plpgsql set search_path = public as $$
declare
  privileged boolean := public.is_siqa_admin()
    or current_user in ('postgres', 'service_role', 'supabase_admin');
begin
  if new.tax_exempt_status is distinct from old.tax_exempt_status then
    if new.tax_exempt_status in ('verified', 'rejected') and not privileged then
      raise exception 'Only the Siqa team can verify tax-exempt status';
    end if;
    if new.tax_exempt_status = 'verified' then
      new.tax_exempt_verified_at := now();
      new.tax_exempt_verified_by := auth.uid();
    end if;
    if new.tax_exempt_status = 'pending' then
      new.tax_exempt_submitted_at := now();
      new.tax_exempt_verified_at := null;
      new.tax_exempt_verified_by := null;
    end if;
  end if;
  -- New proof after a decision goes back to review.
  if new.tax_exempt_doc_url is distinct from old.tax_exempt_doc_url and not privileged then
    new.tax_exempt_status := 'pending';
    new.tax_exempt_submitted_at := now();
    new.tax_exempt_verified_at := null;
    new.tax_exempt_verified_by := null;
  end if;
  if (new.tax_exempt_verified_at is distinct from old.tax_exempt_verified_at
      or new.tax_exempt_verified_by is distinct from old.tax_exempt_verified_by)
     and new.tax_exempt_status is not distinct from old.tax_exempt_status
     and not privileged then
    new.tax_exempt_verified_at := old.tax_exempt_verified_at;
    new.tax_exempt_verified_by := old.tax_exempt_verified_by;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_tax_exempt on public.organizations;
create trigger organizations_guard_tax_exempt
  before update on public.organizations
  for each row execute function public.organizations_guard_tax_exempt();

-- New orgs can't create themselves as already verified.
create or replace function public.organizations_guard_tax_exempt_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tax_exempt_status in ('verified', 'rejected')
     and not (public.is_siqa_admin() or current_user in ('postgres', 'service_role', 'supabase_admin')) then
    new.tax_exempt_status := 'none';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_tax_exempt_insert on public.organizations;
create trigger organizations_guard_tax_exempt_insert
  before insert on public.organizations
  for each row execute function public.organizations_guard_tax_exempt_insert();
