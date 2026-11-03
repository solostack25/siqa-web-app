import { supabase } from './supabase';

// Report + block — Apple guideline 1.2 requires both for apps with user content.
// Tables/functions come from supabase/migrations/20261103_report_block_moderation.sql.

export type ReportTargetType = 'video' | 'comment' | 'listing' | 'message' | 'conversation';

export const REPORT_REASONS = [
  'Spam or scam',
  'Hate speech or harassment',
  'Misleading or fake religious content',
  'Sexual or inappropriate content',
  'Violence or dangerous acts',
  'Prohibited or counterfeit item',
  'Something else',
] as const;

export async function reportContent(opts: {
  targetType: ReportTargetType;
  targetId: string;
  reportedUserId?: string | null;
  reason: string;
  details?: string;
}): Promise<{ ok: boolean; needsSignIn?: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, needsSignIn: true };

  const { error } = await supabase.from('content_reports').insert({
    profile_id: user.id,
    target_type: opts.targetType,
    target_id: opts.targetId,
    // Kept so older admin tooling still sees Gem reports.
    video_id: opts.targetType === 'video' ? opts.targetId : null,
    reported_user_id: opts.reportedUserId ?? null,
    reason: opts.reason,
    details: opts.details?.trim() || null,
    status: 'open',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function blockUser(blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to block users.' };
  if (user.id === blockedId) return { ok: false, error: "You can't block yourself." };
  const { error } = await supabase
    .from('user_blocks')
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  blockedCache = null;
  return { ok: true };
}

export async function unblockUser(blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in first.' };
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId);
  if (error) return { ok: false, error: error.message };
  blockedCache = null;
  return { ok: true };
}

let blockedCache: { userId: string; ids: Set<string> } | null = null;

/** IDs of users the signed-in person has blocked. Empty when signed out. */
export async function getBlockedIds(): Promise<Set<string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return new Set();
  if (blockedCache?.userId === uid) return blockedCache.ids;
  const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid);
  const ids = new Set<string>((data ?? []).map((r: any) => r.blocked_id));
  blockedCache = { userId: uid, ids };
  return ids;
}
