-- Fill the profile name and photo from Google (name, picture) as well as
-- email sign-up (full_name, avatar_url). Apple sends no name in its token;
-- the app saves it right after the first Apple sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', '')),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    'viewer'
  );
  return new;
end $function$;
