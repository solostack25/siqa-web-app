import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Icon, type SiqaIconName } from '../components/Icon';
import type { ClaimEntityType } from '../components/ClaimNotice';
import { brandStyles } from '../lib/ds';

/** Inbox that receives verification emails. Make sure it exists before launch. */
const CLAIMS_EMAIL = 'claims@siqa.us';

/**
 * Claim a profile Siqa curated (speaker now, businesses next).
 *
 * Flow: sign in → tell us who you are and how to verify → get a code →
 * Siqa reviews (admin queue) → on approval the profile is handed to
 * your account, marked verified, and the "Unclaimed" notice goes away.
 */

type Claim = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  verification_code: string;
  verification_method: string | null;
  rejection_reason: string | null;
  created_at: string;
};

type Method = 'official_email' | 'social_post' | 'other';

const METHODS: { key: Method; label: string; help: string; icon: SiqaIconName }[] = [
  {
    key: 'official_email',
    label: 'Email from an official address',
    help: `Send your code to ${CLAIMS_EMAIL} from an address on the speaker's or business's own domain.`,
    icon: 'mail-outline',
  },
  {
    key: 'social_post',
    label: 'Post on an official account',
    help: 'Add your code to the bio of, or post it from, the official Instagram, YouTube or X account. You can remove it after approval.',
    icon: 'logo-instagram',
  },
  {
    key: 'other',
    label: 'Something else',
    help: "Tell us how we can confirm it's you and we'll follow up by email.",
    icon: 'chatbubble-ellipses-outline',
  },
];

export default function ClaimScreen() {
  const { type, id } = useLocalSearchParams<{ type?: string; id?: string }>();
  const entityType: ClaimEntityType = type === 'business' ? 'business' : type === 'organization' ? 'organization' : 'speaker';
  const noun = entityType === 'speaker' ? 'profile' : entityType === 'organization' ? 'organization' : 'business';
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C, isDesktopWeb);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [existing, setExisting] = useState<Claim | null>(null);

  const [relationship, setRelationship] = useState<'self' | 'representative'>('self');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [link, setLink] = useState('');
  const [method, setMethod] = useState<Method>('official_email');
  const [notes, setNotes] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;
    setUserId(uid);
    if (session?.user?.email) setEmail(e => e || session.user.email!);

    if (id && entityType === 'speaker') {
      const { data } = await supabase.from('speakers').select('display_name, is_claimed').eq('id', id).maybeSingle();
      setEntityName((data as any)?.display_name ?? null);
      setAlreadyClaimed(Boolean((data as any)?.is_claimed));
    } else if (id && entityType === 'business') {
      const { data } = await supabase.from('business_listings').select('name, is_claimed').eq('id', id).maybeSingle();
      setEntityName((data as any)?.name ?? null);
      setAlreadyClaimed(Boolean((data as any)?.is_claimed));
    } else if (id && entityType === 'organization') {
      const { data } = await supabase.rpc('directory_listed_org', { p_id: id });
      const row = Array.isArray(data) ? data[0] : data;
      setEntityName(row?.name ?? null);
      setAlreadyClaimed(Boolean(row?.claimed_org_id));
    }

    if (uid && id) {
      const { data } = await supabase
        .from('profile_claims')
        .select('id, status, verification_code, verification_method, rejection_reason, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', id)
        .eq('claimant_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setExisting((data as Claim) ?? null);
    }
    setLoading(false);
  }, [id, entityType]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const name = entityName || (entityType === 'speaker' ? 'this speaker' : `this ${noun}`);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = fullName.trim().length > 1 && emailOk && agree && !submitting &&
    (relationship === 'self' || title.trim().length > 1);

  async function submit() {
    if (!id || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('submit_profile_claim', {
      p_entity_type: entityType,
      p_entity_id: id,
      p_relationship: relationship,
      p_full_name: fullName,
      p_title: relationship === 'representative' ? title : null,
      p_contact_email: email,
      p_contact_phone: phone || null,
      p_official_link: link || null,
      p_verification_method: method,
      p_notes: notes || null,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setExisting(data as Claim);
  }

  function back() {
    if (router.canGoBack()) router.back();
    else if (id && entityType === 'speaker') router.replace(`/speaker/${id}` as any);
    else if (id && entityType === 'organization') router.replace(`/org-listing/${id}` as any);
    else if (id && entityType === 'business') router.replace(`/local/${id}` as any);
    else router.replace('/(tabs)' as any);
  }

  const shell = (children: React.ReactNode) => (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.page}>
            <TouchableOpacity onPress={back} style={styles.backBtn} accessibilityLabel="Back">
              <Icon name="chevron-back" size={20} color={C.text} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            {children}
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );

  if (loading) {
    return shell(<View style={styles.center}><ActivityIndicator color={C.gold} /></View>);
  }

  if (!id) {
    return shell(<Text style={styles.body}>Open this page from the profile you want to claim.</Text>);
  }

  // ── Status screens ──
  if (existing && (existing.status === 'approved' || existing.status === 'pending')) {
    if (existing.status === 'approved') {
      return shell(
        <View style={styles.card}>
          <StatusIcon C={C} name="checkmark-circle" color={C.emerald} />
          <Text style={styles.h1}>You manage {name} on Siqa</Text>
          <Text style={styles.body}>Your claim was approved. The profile is now linked to your account and marked as verified.</Text>
          <View style={styles.row}>
            {entityType === 'speaker' && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/studio' as any)}>
                <Text style={styles.primaryBtnText}>Open Speaker Studio</Text>
              </TouchableOpacity>
            )}
            {entityType === 'speaker' && (
              <TouchableOpacity style={styles.ghostBtn} onPress={() => router.replace(`/speaker/${id}` as any)}>
                <Text style={styles.ghostBtnText}>View profile</Text>
              </TouchableOpacity>
            )}
            {entityType === 'business' && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace({ pathname: '/local/edit', params: { id } } as any)}>
                <Text style={styles.primaryBtnText}>Update your listing</Text>
              </TouchableOpacity>
            )}
            {entityType === 'organization' && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/dashboard' as any)}>
                <Text style={styles.primaryBtnText}>Set up your organization</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>,
      );
    }
    if (existing.status === 'pending') {
      const m = METHODS.find(x => x.key === existing.verification_method) ?? METHODS[2];
      return shell(
        <View style={styles.card}>
          <StatusIcon C={C} name="time-outline" color={C.goldDim} />
          <Text style={styles.h1}>Your claim is in review</Text>
          <Text style={styles.body}>
            We'll confirm it's really you, then hand {name} over to your account. You'll get a notification either way.
          </Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Your verification code</Text>
            <Text style={styles.code} selectable>{existing.verification_code}</Text>
          </View>
          <View style={styles.stepRow}>
            <Icon name={m.icon} size={18} color={C.text} />
            <Text style={[styles.body, { flex: 1 }]}>
              <Text style={styles.strong}>{m.label}. </Text>{m.help}
            </Text>
          </View>
          <Text style={styles.small}>Submitted {new Date(existing.created_at).toLocaleDateString()}</Text>
        </View>,
      );
    }
  }

  if (alreadyClaimed) {
    return shell(
      <View style={styles.card}>
        <StatusIcon C={C} name="lock-closed-outline" color={C.text2} />
        <Text style={styles.h1}>This {noun} has already been claimed</Text>
        <Text style={styles.body}>
          If you believe that's a mistake, email {CLAIMS_EMAIL} with a link to the profile and how we can reach you.
        </Text>
      </View>,
    );
  }

  if (!userId) {
    return shell(
      <View style={styles.card}>
        <StatusIcon C={C} name="person-circle-outline" color={C.text2} />
        <Text style={styles.h1}>Sign in to claim {name}</Text>
        <Text style={styles.body}>
          Claims are tied to a Siqa account. Once approved, that account manages the {entityType === 'speaker' ? 'profile, videos and Speaker Studio' : entityType === 'organization' ? 'organization, its donations and Seeds' : 'listing'}.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(auth)/sign-in' as any)}>
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/(auth)/sign-up' as any)}>
            <Text style={styles.ghostBtnText}>Create an account</Text>
          </TouchableOpacity>
        </View>
      </View>,
    );
  }

  // ── Form ──
  return shell(
    <>
      <View style={{ gap: 6 }}>
        <Text style={styles.eyebrow}>CLAIM {noun.toUpperCase()}</Text>
        <Text style={styles.h1}>{name}</Text>
        <Text style={styles.body}>
          Claiming lets you run this {entityType === 'speaker' ? 'profile: post videos, see analytics, and get a verified badge' : entityType === 'organization' ? 'organization: update its page, take donations and launch Seeds' : 'listing: update details and respond to customers'}.
          We review every claim by hand to stop impersonation.
        </Text>
      </View>

      {existing?.status === 'rejected' && (
        <View style={styles.warn}>
          <Icon name="alert-circle-outline" size={18} color={C.danger} />
          <Text style={[styles.body, { flex: 1 }]}>
            Your last claim wasn't approved{existing.rejection_reason ? `: ${existing.rejection_reason}` : '.'} You can submit again with more detail.
          </Text>
        </View>
      )}

      <Steps C={C} styles={styles} />

      <View style={styles.card}>
        <Text style={styles.label}>Who are you?</Text>
        <View style={styles.row}>
          <Choice active={relationship === 'self'} onPress={() => setRelationship('self')} styles={styles}
            label={entityType === 'speaker' ? `I am ${name}` : entityType === 'organization' ? 'I lead this organization' : 'I own this business'} />
          <Choice active={relationship === 'representative'} onPress={() => setRelationship('representative')} styles={styles}
            label={entityType === 'speaker' ? 'I represent them' : entityType === 'organization' ? 'I work or volunteer there' : 'I manage it for the owner'} />
        </View>

        <Field styles={styles} C={C} label="Your full name" value={fullName} onChange={setFullName} autoComplete="name" />
        {relationship === 'representative' && (
          <Field styles={styles} C={C} label="Your role" placeholder="e.g. Media manager, Executive assistant"
            value={title} onChange={setTitle} />
        )}
        <Field styles={styles} C={C} label="Contact email" value={email} onChange={setEmail}
          keyboardType="email-address" autoComplete="email"
          error={email.length > 3 && !emailOk ? 'Enter a valid email' : undefined} />
        <Field styles={styles} C={C} label="Phone (optional)" value={phone} onChange={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        <Field styles={styles} C={C} label={entityType === 'speaker' ? 'Official website or social account' : entityType === 'organization' ? 'Organization website or social account' : 'Business website or social account'}
          placeholder="https://" value={link} onChange={setLink} keyboardType="url" />

        <Text style={[styles.label, { marginTop: 6 }]}>How should we verify you?</Text>
        <View style={{ gap: 8 }}>
          {METHODS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.method, method === m.key && styles.methodActive]}
              onPress={() => setMethod(m.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: method === m.key }}
            >
              <Icon name={m.icon} size={18} color={C.text} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.methodTitle}>{m.label}</Text>
                <Text style={styles.small}>{m.help}</Text>
              </View>
              <Icon name={method === m.key ? 'radio-button-on' : 'radio-button-off'} size={20} color={method === m.key ? C.emerald : C.text3} />
            </TouchableOpacity>
          ))}
        </View>

        <Field styles={styles} C={C} label="Anything else we should know? (optional)" value={notes} onChange={setNotes} multiline />

        <TouchableOpacity style={styles.agreeRow} onPress={() => setAgree(a => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
          <Icon name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? C.emerald : C.text3} />
          <Text style={[styles.small, { flex: 1, fontSize: 13 }]}>
            I confirm I am {entityType === 'speaker' ? name : entityType === 'organization' ? `authorized to act for ${name}` : 'the owner'}{relationship === 'representative' && entityType !== 'organization' ? ' or authorized to act on their behalf' : ''}. Submitting a false claim will get this account removed.
          </Text>
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.primaryBtn, !canSubmit && { opacity: 0.45 }]} onPress={submit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Submit claim</Text>}
        </TouchableOpacity>
      </View>
    </>,
  );
}

function Steps({ C, styles }: { C: AppColors; styles: any }) {
  const steps = [
    { icon: 'create-outline' as SiqaIconName, text: 'Tell us who you are' },
    { icon: 'key-outline' as SiqaIconName, text: 'Verify with your code' },
    { icon: 'shield-checkmark-outline' as SiqaIconName, text: 'We review and hand it over' },
  ];
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => (
        <View key={s.text} style={styles.step}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
          <Icon name={s.icon} size={16} color={C.text2} />
          <Text style={styles.stepText}>{s.text}</Text>
        </View>
      ))}
    </View>
  );
}

function Choice({ active, label, onPress, styles }: { active: boolean; label: string; onPress: () => void; styles: any }) {
  return (
    <TouchableOpacity style={[styles.choice, active && styles.choiceActive]} onPress={onPress}
      accessibilityRole="radio" accessibilityState={{ selected: active }}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({
  styles, C, label, value, onChange, placeholder, keyboardType, autoComplete, multiline, error,
}: {
  styles: any; C: AppColors; label: string; value: string; onChange: (t: string) => void; placeholder?: string;
  keyboardType?: any; autoComplete?: any; multiline?: boolean; error?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.text3}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize={keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'}
        multiline={multiline}
        accessibilityLabel={label}
        style={[styles.input, multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, error && { borderColor: C.danger }]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function StatusIcon({ C, name, color }: { C: AppColors; name: SiqaIconName; color: string }) {
  return (
    <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={26} color={color} />
    </View>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create(brandStyles({
    scroll: { paddingBottom: 48 },
    page: {
      width: '100%', maxWidth: 640, alignSelf: 'center', gap: 18,
      paddingHorizontal: desktop ? 24 : 16, paddingTop: desktop ? 28 : HEADER_TOP_PADDING,
    },
    center: { paddingVertical: 80, alignItems: 'center' },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 40 },
    backText: { fontSize: 14, color: C.text, fontWeight: '600' },
    eyebrow: { fontSize: 12, fontWeight: '700', color: C.emerald, letterSpacing: 1 },
    h1: { fontSize: desktop ? 28 : 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
    body: { fontSize: 15, lineHeight: 22, color: C.text2 },
    strong: { fontWeight: '700', color: C.text },
    small: { fontSize: 12, lineHeight: 17, color: C.text3 },
    card: {
      gap: 14, padding: desktop ? 22 : 16, borderRadius: Theme.radius.lg,
      borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    label: { fontSize: 13, fontWeight: '700', color: C.text },
    input: {
      minHeight: 46, borderWidth: 1, borderColor: C.border, borderRadius: Theme.radius.md,
      paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.bg,
      ...(Platform.OS === 'web' ? { outlineColor: C.emerald } as any : {}),
    },
    error: { fontSize: 13, color: C.danger },
    choice: {
      flexGrow: 1, flexBasis: 200, minHeight: 46, paddingHorizontal: 14, borderRadius: Theme.radius.md,
      borderWidth: 1, borderColor: C.border, justifyContent: 'center',
    },
    choiceActive: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    choiceText: { fontSize: 14, color: C.text, fontWeight: '500' },
    choiceTextActive: { color: C.emerald, fontWeight: '700' },
    method: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: Theme.radius.md,
      borderWidth: 1, borderColor: C.border,
    },
    methodActive: { borderColor: C.emerald, backgroundColor: C.emeraldBg },
    methodTitle: { fontSize: 14, fontWeight: '700', color: C.text },
    agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingTop: 4 },
    primaryBtn: {
      minHeight: 48, paddingHorizontal: 20, borderRadius: 999, backgroundColor: C.emerald,
      alignItems: 'center', justifyContent: 'center',
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    ghostBtn: {
      minHeight: 48, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    ghostBtnText: { color: C.text, fontSize: 15, fontWeight: '600' },
    warn: {
      flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: Theme.radius.md,
      backgroundColor: 'rgba(217,117,95,0.10)',
    },
    codeBox: { padding: 16, borderRadius: Theme.radius.md, backgroundColor: C.surface2, alignItems: 'center', gap: 4 },
    codeLabel: { fontSize: 12, color: C.text3, fontWeight: '600' },
    code: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: 2 },
    stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    step: {
      flexGrow: 1, flexBasis: 170, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
      borderRadius: Theme.radius.md, backgroundColor: C.surface2,
    },
    stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
    stepNumText: { color: C.bg, fontSize: 12, fontWeight: '800' },
    stepText: { fontSize: 13, color: C.text, fontWeight: '500', flexShrink: 1 },
  }));
}
