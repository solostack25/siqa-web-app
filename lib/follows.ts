import { supabase } from './supabase';

// Following a speaker. Speakers with an account are followed through
// `follows` (their profile); curated speakers who haven't claimed their
// profile yet have no account, so they're followed through
// `speaker_follows`. When they claim it, a database trigger moves those
// follows over. Both kinds feed the follower count and the follow emails.

export type FollowableSpeaker = { id: string; profile_id?: string | null };

export async function isFollowingSpeaker(userId: string, s: FollowableSpeaker): Promise<boolean> {
  const q = s.profile_id
    ? supabase.from('follows').select('follower_id').eq('follower_id', userId).eq('following_id', s.profile_id)
    : supabase.from('speaker_follows').select('follower_id').eq('follower_id', userId).eq('speaker_id', s.id);
  const { data } = await q.maybeSingle();
  return Boolean(data);
}

/** Follow (on = true) or unfollow. Returns false if it didn't save. */
export async function setSpeakerFollow(userId: string, s: FollowableSpeaker, on: boolean): Promise<boolean> {
  if (s.profile_id && s.profile_id === userId) return false;
  let error;
  if (s.profile_id) {
    ({ error } = on
      ? await supabase.from('follows').insert({ follower_id: userId, following_id: s.profile_id })
      : await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', s.profile_id));
  } else {
    ({ error } = on
      ? await supabase.from('speaker_follows').insert({ follower_id: userId, speaker_id: s.id })
      : await supabase.from('speaker_follows').delete().eq('follower_id', userId).eq('speaker_id', s.id));
  }
  // Already following (unique key) counts as success.
  return !error || (on && (error as any).code === '23505');
}
