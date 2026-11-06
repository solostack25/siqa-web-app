import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Animated, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { DesktopShell } from '../components/DesktopShell';
import { Icon } from '../components/Icon';
import { showToast } from '../components/Toast';
import { Chip, PrimaryButton, REVIEW_REASONS } from '../components/SeedSocial';
import { brandStyles } from '../lib/ds';

type Visibility = 'full' | 'name' | 'anonymous';

export default function DonateSuccessScreen() {
  const { amount, title, fundraiserId, paymentIntentId, via } = useLocalSearchParams<{
    amount: string;
    title: string;
    fundraiserId?: string;
    paymentIntentId?: string;
    via?: string;
  }>();
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [settings, setSettings] = useState<{ allow: boolean; anon: boolean; prompt: string } | null>(null);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('full');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!fundraiserId || !paymentIntentId) return;
    supabase
      .from('fundraisers')
      .select('allow_reviews, allow_anonymous_reviews, review_prompt')
      .eq('id', fundraiserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSettings({
          allow: data.allow_reviews !== false,
          anon: data.allow_anonymous_reviews !== false,
          prompt: data.review_prompt || 'What moved you to give today?',
        });
      });
  }, [fundraiserId, paymentIntentId]);

  async function postReview() {
    if (!fundraiserId || !paymentIntentId || !body.trim()) return;
    setPosting(true);
    const { error } = await supabase.from('donation_reviews').insert({
      payment_intent_id: paymentIntentId,
      fundraiser_id: fundraiserId,
      body: body.trim(),
      reason,
      visibility,
      via_speaker_id: via || null,
    });
    setPosting(false);
    if (error) {
      showToast(/duplicate/i.test(error.message) ? 'You already left a review for this donation' : error.message);
      return;
    }
    setPosted(true);
  }

  const showReview = settings?.allow && !posted;
  const visibilityOptions: { key: Visibility; label: string }[] = [
    { key: 'full', label: 'My name and amount' },
    { key: 'name', label: 'My name only' },
    ...(settings?.anon ? [{ key: 'anonymous' as Visibility, label: 'Anonymous' }] : []),
  ];

  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
          <Icon name="heart" size={40} color={C.emerald} />
        </Animated.View>

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <Text style={styles.heading}>JazakAllahu khayran</Text>
          <Text style={styles.sub}>Your {amount || ''} gift to {title || 'this Seed'} was received. A receipt is on its way to your email.</Text>

          {showReview && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{settings!.prompt}</Text>
              <Text style={styles.muted}>Your words help others decide. Optional.</Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={280}
                placeholder="e.g. My family got help like this when we first arrived. Paying it forward."
                placeholderTextColor={C.text3}
                style={styles.input}
                accessibilityLabel={settings!.prompt}
              />
              <Text style={[styles.muted, { textAlign: 'right' }]}>{body.length}/280</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REVIEW_REASONS.map(r => (
                  <Chip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? null : r)} />
                ))}
              </View>
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>Show my review as</Text>
                {visibilityOptions.map(o => {
                  const on = visibility === o.key;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      onPress={() => setVisibility(o.key)}
                      style={styles.radioRow}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                    >
                      <View style={[styles.radio, on && { borderColor: C.emerald }]}>{on ? <View style={styles.radioDot} /> : null}</View>
                      <Text style={styles.body}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PrimaryButton label="Skip" tone="ghost" onPress={() => setSettings(s => s && { ...s, allow: false })} style={{ flex: 1 }} />
                <PrimaryButton label="Post review" tone="emerald" onPress={postReview} busy={posting} disabled={!body.trim()} style={{ flex: 2 }} />
              </View>
            </View>
          )}

          {posted && (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Icon name="checkmark-circle" size={22} color={C.emerald} />
                <Text style={styles.cardTitle}>Thanks for sharing</Text>
              </View>
              <Text style={styles.muted}>Your review shows on the Seed as soon as your payment finishes confirming — usually within a minute.</Text>
            </View>
          )}

          {!showReview && !posted && (
            <View style={styles.hadith}>
              <Text style={styles.hadithText}>"Charity does not decrease wealth."</Text>
              <Text style={styles.muted}>— Prophet Muhammad ﷺ (Sahih Muslim)</Text>
            </View>
          )}
        </Animated.View>

        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          {fundraiserId ? (
            <PrimaryButton label="Back to the Seed" onPress={() => router.replace({ pathname: '/seed/[id]', params: { id: fundraiserId } } as any)} />
          ) : null}
          <PrimaryButton label="See more Seeds" tone="ghost" onPress={() => router.replace('/(tabs)/seeds')} />
        </Animated.View>
      </ScrollView>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 32 : 72, paddingBottom: 40, gap: 20 },
    iconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.emeraldBg, alignItems: 'center', justifyContent: 'center' },
    content: { width: '100%', maxWidth: 520, alignItems: 'stretch', gap: 14 },
    heading: { fontSize: 26, fontWeight: '800', color: C.text, textAlign: 'center' },
    sub: { fontSize: 15, lineHeight: 22, color: C.text2, textAlign: 'center' },
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border2, padding: 18, gap: 12 },
    cardTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
    label: { color: C.text, fontSize: 14, fontWeight: '700' },
    body: { color: C.text, fontSize: 15 },
    muted: { color: C.text2, fontSize: 13, lineHeight: 18 },
    input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, color: C.text, fontSize: 15, minHeight: 110, textAlignVertical: 'top', lineHeight: 21 },
    radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.text3, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.emerald },
    hadith: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border2, padding: 18, alignItems: 'center', gap: 4 },
    hadithText: { color: C.text, fontSize: 15, fontStyle: 'italic', textAlign: 'center' },
    actions: { width: '100%', maxWidth: 520, gap: 10 },
  }));
}
