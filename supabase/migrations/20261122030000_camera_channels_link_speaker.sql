-- Every camera stream belongs to its owner's approved speaker profile,
-- however it was created (Studio API, admin tools, SQL). Before this, streams made by
-- staff accounts had no speaker_id, so Go Live couldn't find them and failed silently.
-- (Applied to production 2026-11-22.)
create or replace function studio.camera_channel_link_speaker()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text;
begin
  if new.speaker_id is null and new.owner_id is not null then
    select s.id, s.display_name into v_id, v_name
      from public.speakers s
     where s.profile_id = new.owner_id and s.approval_status = 'approved'
     limit 1;
    if v_id is not null then
      new.speaker_id := v_id;
      new.speaker_name := coalesce(new.speaker_name, v_name);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists camera_channel_link_speaker on studio.camera_channels;
create trigger camera_channel_link_speaker
  before insert or update of owner_id, speaker_id on studio.camera_channels
  for each row execute function studio.camera_channel_link_speaker();

update studio.camera_channels c
   set speaker_id = s.id, speaker_name = coalesce(c.speaker_name, s.display_name)
  from public.speakers s
 where c.speaker_id is null and s.profile_id = c.owner_id and s.approval_status = 'approved';
