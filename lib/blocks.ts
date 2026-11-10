// Blocking and reporting (App Store Guideline 1.2).
// Blocks live in user_blocks (own rows only under RLS). The set of people
// you've blocked is cached here and shared by every screen through
// useBlocked(), so blocking someone hides them everywhere at once.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { confirmDialog } from './dialogs';
import { showToast } from '../components/Toast';

let blocked = new Set<string>();
let loadedFor: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function myId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function loadBlocks(force = false): Promise<Set<string>> {
  const uid = await myId();
  if (!uid) { if (blocked.size) { blocked = new Set(); loadedFor = null; emit(); } return blocked; }
  if (!force && loadedFor === uid) return blocked;
  if (!loading) {
    loading = (async () => {
      const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid).limit(2000);
      blocked = new Set((data ?? []).map((r: any) => r.blocked_id));
      loadedFor = uid;
      emit();
    })().finally(() => { loading = null; });
  }
  await loading;
  return blocked;
}

supabase.auth.onAuthStateChange(() => { loadedFor = null; loadBlocks(true); });

export function isBlocked(profileId: string | null | undefined) {
  return !!profileId && blocked.has(profileId);
}

/** The set of profile ids you've blocked; re-renders when it changes. */
export function useBlocked(): Set<string> {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    loadBlocks();
    return () => { listeners.delete(l); };
  }, []);
  return blocked;
}

/** Ask, then block. Returns true when blocked. */
export async function blockUser(profileId: string | null | undefined, name?: string | null): Promise<boolean> {
  if (!profileId) return false;
  const uid = await myId();
  if (!uid) { showToast('Sign in to block someone'); return false; }
  if (uid === profileId) return false;
  const who = name?.trim() || 'this person';
  const ok = await confirmDialog(
    `Block ${who}?`,
    "You won't see their comments, Gems or messages, and they can't message you. They aren't told. You can unblock them in Settings.",
    'Block',
  );
  if (!ok) return false;
  const { error } = await supabase.from('user_blocks').upsert({ blocker_id: uid, blocked_id: profileId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
  if (error) { showToast(`Couldn't block: ${error.message}`); return false; }
  blocked = new Set(blocked).add(profileId);
  emit();
  showToast(`Blocked ${who}`);
  return true;
}

export async function unblockUser(profileId: string): Promise<boolean> {
  const uid = await myId();
  if (!uid) return false;
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', uid).eq('blocked_id', profileId);
  if (error) { showToast(`Couldn't unblock: ${error.message}`); return false; }
  const next = new Set(blocked); next.delete(profileId); blocked = next;
  emit();
  showToast('Unblocked');
  return true;
}

export const REPORT_REASONS = ['Spam or scam', 'Hateful or abusive', 'Harassment', 'False or misleading', 'Something else'];

/** Everything people can report. Admin › Reports labels and links each kind. */
export type ReportTarget =
  | 'comment' | 'chai_comment' | 'message' | 'thread' | 'gem' | 'profile'
  | 'video' | 'speaker' | 'org' | 'org_post' | 'product' | 'shop' | 'seed' | 'business' | 'series' | 'playlist';

/** File a report for the Admin › Reports queue. Returns an error message or null. */
export async function reportContent(r: {
  targetType: ReportTarget;
  targetId?: string | null;
  reportedUserId?: string | null;
  videoId?: string | null;
  reason: string;
  details?: string | null;
}): Promise<string | null> {
  const uid = await myId();
  if (!uid) return 'Sign in to report.';
  const { error } = await supabase.from('content_reports').insert({
    profile_id: uid,
    target_type: r.targetType,
    target_id: r.targetId ?? null,
    reported_user_id: r.reportedUserId ?? null,
    video_id: r.videoId ?? null,
    reason: r.reason,
    details: r.details ? r.details.slice(0, 500) : null,
    status: 'open',
  });
  return error ? error.message : null;
}
