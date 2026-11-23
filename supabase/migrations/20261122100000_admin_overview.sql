-- Siqa Admin overview: headline numbers, what's waiting in each queue, and recent activity, in one call.
-- Siqa admins only. (Applied to production 2026-11-22.)
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = '' as $$
declare v json;
begin
  if not public.is_siqa_admin() then raise exception 'not allowed'; end if;
  select json_build_object(
    'members', (select count(*) from public.profiles),
    'members_week', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'speakers', (select count(*) from public.speakers),
    'speakers_claimed', (select count(*) from public.speakers where is_claimed),
    'gems_published', (select count(*) from public.videos where is_published),
    'gems_total', (select count(*) from public.videos),
    'orgs', (select count(*) from public.organizations),
    'masjids', (select count(*) from public.organizations where org_kind = 'masjid'),
    'given_cents', (select coalesce(sum(amount), 0) from public.donations where status = 'completed'),
    'gifts', (select count(*) from public.donations where status = 'completed'),
    'tvs', (select count(*) from public.masjid_screens),
    'queues', json_build_object(
      'claim', (select count(*) from public.profile_claims where status = 'pending'),
      'gem', (select count(*) from public.videos where is_published = false or status in ('pending', 'submitted', 'draft')),
      'application', (select count(*) from public.speaker_applications where status = 'pending'),
      'speaker', (select count(*) from public.speakers where is_claimed and coalesce(is_verified, false) = false),
      'tax', (select count(*) from public.organizations where tax_exempt_status = 'pending'),
      'org', (select count(*) from public.organizations where coalesce(is_verified, false) = false or coalesce(approval_status, '') <> 'approved'),
      'seller', (select count(*) from public.marketplace_sellers where approval_status = 'pending'),
      'report', (select count(*) from public.content_reports where status is null or status in ('open', 'pending'))
    ),
    'oldest', json_build_object(
      'claim', (select min(created_at) from public.profile_claims where status = 'pending'),
      'gem', (select min(created_at) from public.videos where is_published = false or status in ('pending', 'submitted', 'draft')),
      'application', (select min(created_at) from public.speaker_applications where status = 'pending'),
      'speaker', (select min(created_at) from public.speakers where is_claimed and coalesce(is_verified, false) = false),
      'tax', (select min(tax_exempt_submitted_at) from public.organizations where tax_exempt_status = 'pending'),
      'org', (select min(created_at) from public.organizations where coalesce(is_verified, false) = false or coalesce(approval_status, '') <> 'approved'),
      'seller', (select min(created_at) from public.marketplace_sellers where approval_status = 'pending'),
      'report', (select min(created_at) from public.content_reports where status is null or status in ('open', 'pending'))
    ),
    'activity', coalesce((select json_agg(a order by a.at desc) from (
      (select 'member' as kind, coalesce(nullif(full_name, ''), username, 'Someone') || ' joined Siqa' as text, created_at as at from public.profiles order by created_at desc limit 6)
      union all
      (select 'gift', case when is_anonymous then 'An anonymous donor' else coalesce(nullif(donor_name, ''), 'Someone') end || ' gave $' || to_char(amount / 100.0, 'FM999,999,990') || coalesce(' to ' || campaign_title, ''), created_at from public.donations where status = 'completed' order by created_at desc limit 6)
      union all
      (select 'org', org_name || ' was added', created_at from public.organizations order by created_at desc limit 4)
      union all
      (select 'speaker', display_name || ' was added as a speaker', created_at from public.speakers order by created_at desc limit 4)
      union all
      (select 'event', title || ' was created', created_at from public.events order by created_at desc limit 4)
      union all
      (select 'tv', 'A TV was linked: ' || coalesce(name, 'Screen'), coalesce(paired_at, created_at) from public.masjid_screens order by coalesce(paired_at, created_at) desc limit 4)
      order by at desc limit 10
    ) a), '[]'::json)
  ) into v;
  return v;
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
