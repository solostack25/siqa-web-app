-- Applied to production on 2026-11-05 via Supabase MCP (kept here for history).

-- fundraisers: allow drafts (seed-create saves 'draft', which the old check
-- rejected) and stop new Seeds defaulting to live.
alter table public.fundraisers drop constraint if exists fundraisers_status_check;
alter table public.fundraisers add constraint fundraisers_status_check
  check (status = any (array['draft','pending_review','active','completed','paused','cancelled']));
alter table public.fundraisers alter column status set default 'draft';

-- One donation row per PaymentIntent (webhook retries can't double count).
create unique index if not exists donations_stripe_payment_intent_id_key
  on public.donations (stripe_payment_intent_id);

-- Internal secret (Vault) for DB → edge function calls; see
-- check_internal_secret(), notify_order_paid(), and the youtube-daily-sync
-- cron job, which now sends it and only syncs approved, verified speakers.
-- (Created with vault.create_secret(... 'siqa_internal_secret' ...).)

-- speaker_applications: applicants can't approve themselves.
-- guard_speaker_applications() trigger + "Users can update own pending application" policy.

alter function public.is_wisal_employee(public.employee_role[]) set search_path = public;
