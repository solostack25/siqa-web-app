import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { REPORT_REASONS, reportContent, type ReportTarget } from '../lib/blocks';
import { font, type, useDS } from '../lib/ds';
import { Icon } from './Icon';
import { BottomSheet, Button, Chip, IconButton, OptionRow, TextField } from './ui';
import { showToast } from './Toast';

// One Report control for anything people post: videos, profiles, org posts,
// products, shops, Seeds, business listings. Files into Admin › Reports.
// Google Play and the App Store both require reporting on all user content.

export function ReportButton({
  targetType, targetId, reportedUserId, videoId, label = 'Report', variant = 'icon', what,
}: {
  targetType: ReportTarget;
  targetId: string;
  reportedUserId?: string | null;
  videoId?: string | null;
  label?: string;
  /** icon: round flag button · chip · button (secondary) · link (small text) · row (menu row) */
  variant?: 'icon' | 'chip' | 'button' | 'link' | 'row';
  /** For the sheet title, e.g. "this video" */
  what?: string;
}) {
  const { c } = useDS();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function start() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/(auth)/login' as any); return; }
    setReason(null); setDetails(''); setOpen(true);
  }

  async function send(r: string) {
    setBusy(true);
    const err = await reportContent({ targetType, targetId, reportedUserId: reportedUserId ?? null, videoId: videoId ?? null, reason: r, details: details.trim() || null });
    setBusy(false);
    if (err) { showToast(`Couldn't send report: ${err}`); return; }
    setOpen(false);
    showToast('Thanks. Siqa reviews every report within 24 hours.');
  }

  const title = `Report ${what ?? 'this'}`;
  const trigger =
    variant === 'chip' ? <Chip icon="flag-outline" label={label} onPress={start} />
    : variant === 'button' ? <Button size="md" variant="secondary" icon="flag-outline" label={label} onPress={start} />
    : variant === 'link' ? (
      <Pressable onPress={start} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
        <Icon name="flag-outline" size={15} color={c.ink2} />
        <Text style={[type.caption, font(600), { color: c.ink2 }]}>{label}</Text>
      </Pressable>
    )
    : variant === 'row' ? (
      <Pressable onPress={start} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12 }}>
        <Icon name="flag-outline" size={18} color={c.ink} />
        <Text style={[type.body, { color: c.ink }]}>{label}</Text>
      </Pressable>
    )
    : <IconButton icon="flag-outline" label={title} onPress={start} />;

  return (
    <>
      {trigger}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        <Text style={[type.caption, font(400), { color: c.ink2, marginBottom: 6 }]}>What's wrong? Siqa reviews every report.</Text>
        {!reason ? REPORT_REASONS.map((r, i) => (
          <OptionRow key={r} action label={r} last={i === REPORT_REASONS.length - 1} onPress={() => setReason(r)} />
        )) : (
          <View style={{ gap: 12, paddingTop: 4 }}>
            <Text style={[type.headline, { color: c.ink }]}>{reason}</Text>
            <TextField label="Anything else? (optional)" value={details} onChangeText={setDetails} multiline maxLength={500} style={{ minHeight: 80 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button size="md" label="Send report" onPress={() => send(reason)} loading={busy} />
              <Button size="md" variant="secondary" label="Back" onPress={() => setReason(null)} />
            </View>
          </View>
        )}
      </BottomSheet>
    </>
  );
}
