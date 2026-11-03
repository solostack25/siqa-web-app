import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme } from '../constants/theme';
import { Icon } from './Icon';
import { REPORT_REASONS, reportContent, blockUser, type ReportTargetType } from '../lib/moderation';

// One report + block sheet for every kind of content. Built on <Modal>
// instead of Alert.alert because Alert buttons don't work on web.

const TARGET_LABEL: Record<ReportTargetType, string> = {
  video: 'Gem',
  comment: 'comment',
  listing: 'listing',
  message: 'message',
  conversation: 'conversation',
};

export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  reportedUserId,
  reportedName,
  onBlocked,
}: {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** Pass this to offer "Block" alongside the report. */
  reportedUserId?: string | null;
  reportedName?: string | null;
  /** Called after a successful block so the screen can hide that user's content. */
  onBlocked?: (userId: string) => void;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'done' | 'blocked'>('form');

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setError(null);
      setBusy(false);
      setStep('form');
    }
  }, [visible, targetId]);

  const label = TARGET_LABEL[targetType];
  const name = reportedName || 'this user';
  const canBlock = Boolean(reportedUserId);

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    const res = await reportContent({ targetType, targetId, reportedUserId, reason, details });
    setBusy(false);
    if (res.needsSignIn) {
      onClose();
      router.push('/(auth)/sign-in' as any);
      return;
    }
    if (!res.ok) {
      setError("Your report didn't go through. Please try again.");
      return;
    }
    setStep('done');
  }

  async function block() {
    if (!reportedUserId || busy) return;
    setBusy(true);
    setError(null);
    const res = await blockUser(reportedUserId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Couldn't block. Please try again.");
      return;
    }
    onBlocked?.(reportedUserId);
    setStep('blocked');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headRow}>
            <Text style={styles.title}>
              {step === 'form' ? `Report ${label}` : step === 'done' ? 'Thanks for reporting' : 'Blocked'}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Icon name="close" size={22} color={C.text2} />
            </TouchableOpacity>
          </View>

          {step === 'form' && (
            <ScrollView style={{ maxHeight: 540 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.sub}>Why are you reporting this {label}? A Siqa moderator will review it.</Text>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity key={r} style={styles.reasonRow} onPress={() => setReason(r)}>
                  <View style={[styles.radio, reason === r && styles.radioOn]}>
                    {reason === r ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={styles.reasonText}>{r}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.input}
                placeholder="Add details (optional)"
                placeholderTextColor={C.text3}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={1000}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, (!reason || busy) && { opacity: 0.45 }]}
                onPress={submit}
                disabled={!reason || busy}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryText}>Submit report</Text>}
              </TouchableOpacity>
              {canBlock && (
                <TouchableOpacity style={styles.blockBtn} onPress={block} disabled={busy}>
                  <Icon name="ban-outline" size={16} color={C.danger} />
                  <Text style={styles.blockText}>Block {name} instead</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {step === 'done' && (
            <View>
              <Text style={styles.sub}>We'll review this {label} and take action if it breaks our Community Guidelines.</Text>
              {canBlock && (
                <>
                  <Text style={styles.sub}>You can also block {name}. You won't see their comments or messages, and they can't message you.</Text>
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <TouchableOpacity style={styles.blockBtnFilled} onPress={block} disabled={busy}>
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryText}>Block {name}</Text>}
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'blocked' && (
            <View>
              <Text style={styles.sub}>You blocked {name}. You won't see their comments or messages, and they can't message you. You can unblock them in Settings.</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: Theme.spacing.lg },
    sheet: {
      width: '100%', maxWidth: 440, backgroundColor: C.surface, borderRadius: Theme.radius.xl,
      padding: Theme.spacing.xl, borderWidth: 0.5, borderColor: C.border,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Theme.spacing.sm },
    title: { color: C.text, fontSize: Theme.fontSize.lg, fontWeight: '700' },
    sub: { color: C.text2, fontSize: Theme.fontSize.sm, lineHeight: 19, marginBottom: Theme.spacing.md },
    reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.text3, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: C.gold },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.gold },
    reasonText: { color: C.text, fontSize: Theme.fontSize.md, flex: 1 },
    input: {
      marginTop: Theme.spacing.sm, minHeight: 70, borderWidth: 0.5, borderColor: C.border, borderRadius: Theme.radius.md,
      padding: Theme.spacing.md, color: C.text, fontSize: Theme.fontSize.md, textAlignVertical: 'top',
    },
    error: { color: C.danger, fontSize: Theme.fontSize.sm, marginTop: Theme.spacing.sm },
    primaryBtn: { marginTop: Theme.spacing.lg, backgroundColor: C.gold, borderRadius: Theme.radius.full, paddingVertical: 13, alignItems: 'center' },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: Theme.fontSize.md },
    blockBtn: { marginTop: Theme.spacing.md, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    blockText: { color: C.danger, fontWeight: '600', fontSize: Theme.fontSize.sm },
    blockBtnFilled: { backgroundColor: C.danger, borderRadius: Theme.radius.full, paddingVertical: 13, alignItems: 'center', marginBottom: Theme.spacing.sm },
    secondaryBtn: { marginTop: Theme.spacing.sm, borderRadius: Theme.radius.full, paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: C.border },
    secondaryText: { color: C.text, fontWeight: '600', fontSize: Theme.fontSize.md },
  });
}
