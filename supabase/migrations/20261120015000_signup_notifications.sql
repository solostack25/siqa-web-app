-- Email registration@siqa.us about every new Siqa account (edge function
-- signup-notifications), while platform_settings.notify_new_signups is true.
-- Turn off: update platform_settings set value = 'false' where key = 'notify_new_signups';

insert into public.platform_settings (key, value) values ('notify_new_signups', 'true'::jsonb)
  on conflict (key) do nothing;

create or replace function public.notify_new_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select value from public.platform_settings where key = 'notify_new_signups'), 'false'::jsonb) <> 'true'::jsonb then
    return new;
  end if;
  perform net.http_post(
    url := 'https://eixlmylbqqrfazjlgxcz.supabase.co/functions/v1/signup-notifications',
    body := jsonb_build_object('profile_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-siqa-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'siqa_internal_secret')
    ),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  return new; -- never block a sign-up because the alert failed
end $$;
revoke execute on function public.notify_new_signup() from public, anon, authenticated;

drop trigger if exists notify_new_signup on public.profiles;
create trigger notify_new_signup after insert on public.profiles
  for each row execute function public.notify_new_signup();
