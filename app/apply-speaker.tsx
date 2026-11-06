import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/Toast';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../constants/theme';
import { Icon } from '../components/Icon';
import { Glyph } from '../components/Glyph';
import { DesktopShell } from '../components/DesktopShell';
import { brandStyles } from '../lib/ds';

/**
 * Apply to be a speaker. Siqa exists so people can trust who they're
 * hearing from, so speaker accounts are never self-serve: this creates a
 * speaker_applications row, a Siqa admin reviews it (Admin → Speaker
 * applications), and approval creates the verified speaker profile.
 * The database enforces this — users can't create speaker profiles or
 * publish Gems until approved.
 */

type Application = {
  id: string;
  status: string;
  display_name: string;
  rejection_reason: string | null;
  created_at: string;
};

const list = (s: string) =>
  s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);

export default function ApplySpeakerScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [existing, setExisting] = useState<Application | null>(null);
  const [isSpeaker, setIsSpeaker] = useState(false);

  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [topics, setTopics] = useState('');
  const [languages, setLanguages] = useState('English');
  const [bio, setBio] = useState('');
  const [studied, setStudied] = useState('');
  const [youtube, setYoutube] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [why, setWhy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/(auth)/sign-in' as any);
        return;
      }
      setUserId(session.user.id);
      setEmail(session.user.email ?? '');
      setFullName((session.user.user_metadata?.full_name as string) ?? '');

      const [{ data: speaker }, { data: app }] = await Promise.all([
        supabase.from('speakers').select('id').eq('profile_id', session.user.id).maybeSingle(),
        supabase
          .from('speaker_applications')
          .select('id, status, display_name, rejection_reason, created_at')
          .eq('profile_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setIsSpeaker(Boolean(speaker));
      setExisting((app as Application) ?? null);
      setLoading(false);
    })();
  }, []);

  async function submit() {
    if (saving || !userId) return;
    setError('');
    if (!fullName.trim() || !displayName.trim()) return setError('Add your full name and the name people know you by.');
    if (!studied.trim()) return setError('Tell us where you studied or who you studied with.');
    if (!youtube.trim() && !instagram.trim() && !website.trim()) {
      return setError('Add at least one link where people can already find your talks.');
    }

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('speaker_applications')
      .insert({
        profile_id: userId,
        full_name: fullName.trim(),
        display_name: displayName.trim(),
        email,
        phone: phone.trim() || null,
        state: state.trim() || null,
        topics: list(topics),
        languages: list(languages),
        bio: bio.trim() || null,
        youtube_url: youtube.trim() || null,
        instagram_url: instagram.trim() || null,
        website: website.trim() || null,
        why_siqa: [studied.trim() && `Studied: ${studied.trim()}`, why.trim()].filter(Boolean).join('\n\n') || null,
      })
      .select('id, status, display_name, rejection_reason, created_at')
      .single();
    setSaving(false);

    if (insertError) return setError(insertError.message);
    setExisting(data as Application);
    showToast('Application sent — we’ll review it soon');
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as any));

  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}><ActivityIndicator color={C.gold} /></View>
      </DesktopShell>
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.roundBtn} onPress={back} accessibilityLabel="Back">
        <Icon name="arrow-back" size={18} color={C.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Become a speaker</Text>
    </View>
  );

  if (isSpeaker) {
    return (
      <DesktopShell>
        <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
          {header}
          <View style={styles.card}>
            <Glyph name="checkmark-circle" size={40} color={C.emerald} />
            <Text style={styles.cardTitle}>You’re a Siqa speaker</Text>
            <Text style={styles.body}>Your speaker profile is set up. You can post Gems from the upload button.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/gem-upload' as any)}>
              <Text style={styles.primaryBtnText}>Post a Gem</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </DesktopShell>
    );
  }

  if (existing && existing.status !== 'rejected') {
    return (
      <DesktopShell>
        <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
          {header}
          <View style={styles.card}>
            <Glyph name="time-outline" size={40} color={C.gold} />
            <Text style={styles.cardTitle}>Application under review</Text>
            <Text style={styles.body}>
              Thanks, {existing.display_name}. The Siqa team reviews every speaker so people can trust who they’re
              hearing from. We may reach out by email to verify your background. You’ll be able to post Gems as soon
              as you’re approved.
            </Text>
          </View>
        </ScrollView>
      </DesktopShell>
    );
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts: { placeholder?: string; multiline?: boolean; keyboard?: any; autoComplete?: any; hint?: string } = {},
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, opts.multiline && styles.inputMulti]}
        value={value}
        onChangeText={set}
        placeholder={opts.placeholder}
        placeholderTextColor={C.text3}
        multiline={opts.multiline}
        keyboardType={opts.keyboard}
        autoComplete={opts.autoComplete}
        autoCapitalize={opts.keyboard === 'url' ? 'none' : 'sentences'}
      />
      {opts.hint ? <Text style={styles.hint}>{opts.hint}</Text> : null}
    </View>
  );

  return (
    <DesktopShell>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {header}
        <View style={styles.intro}>
          <Text style={styles.body}>
            Siqa only publishes talks from verified speakers, so AI or impersonators can’t speak in your name. Tell us
            about yourself and where people already find your work. We review every application.
          </Text>
          {existing?.status === 'rejected' && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Your last application wasn’t approved{existing.rejection_reason ? `: ${existing.rejection_reason}` : '.'} You can apply again.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          {field('Full legal name', fullName, setFullName, { autoComplete: 'name' })}
          {field('Name people know you by', displayName, setDisplayName, { placeholder: 'e.g. Sh. Ahmed Ali' })}
          {field('Where did you study, or with whom?', studied, setStudied, {
            multiline: true,
            placeholder: 'Institution, teachers, ijazah, years of study',
          })}
          {field('Topics you speak on', topics, setTopics, { placeholder: 'Seerah, Fiqh, Youth, Marriage', hint: 'Separate with commas' })}
          {field('Languages', languages, setLanguages, { hint: 'Separate with commas' })}
          {field('Short bio', bio, setBio, { multiline: true })}
          {field('YouTube channel', youtube, setYoutube, { keyboard: 'url', placeholder: 'https://youtube.com/@yourchannel' })}
          {field('Instagram', instagram, setInstagram, { keyboard: 'url', placeholder: 'https://instagram.com/you' })}
          {field('Website', website, setWebsite, { keyboard: 'url' })}
          {field('Phone (private, for verification)', phone, setPhone, { keyboard: 'phone-pad', autoComplete: 'tel' })}
          {field('State', state, setState, { autoComplete: 'address-level1' })}
          {field('Why Siqa?', why, setWhy, { multiline: true })}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Submit application</Text>}
          </TouchableOpacity>
          <Text style={styles.hint}>Your phone and email are only seen by the Siqa team.</Text>
        </View>
      </ScrollView>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    scroll: { paddingBottom: 80, maxWidth: 600, width: '100%', alignSelf: 'center' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.lg,
    },
    roundBtn: {
      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface2,
    },
    headerTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
    intro: { paddingHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.lg, gap: Theme.spacing.md },
    body: { fontSize: Theme.fontSize.md, color: C.text2, lineHeight: 22 },
    notice: { backgroundColor: C.goldBg, borderRadius: Theme.radius.md, padding: Theme.spacing.md },
    noticeText: { color: C.text, fontSize: Theme.fontSize.sm, lineHeight: 19 },
    card: {
      marginHorizontal: Theme.spacing.lg, backgroundColor: C.surface, borderRadius: Theme.radius.xl,
      padding: Theme.spacing.xl, borderWidth: 1, borderColor: C.border2, gap: Theme.spacing.md,
    },
    cardTitle: { fontSize: Theme.fontSize.lg, fontWeight: '700', color: C.text },
    field: { gap: 6 },
    label: { fontSize: Theme.fontSize.sm, fontWeight: '600', color: C.text },
    input: {
      borderWidth: 1, borderColor: C.border, borderRadius: Theme.radius.md, paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'web' ? 10 : 12, fontSize: 16, color: C.text, backgroundColor: C.bg,
    },
    inputMulti: { minHeight: 88, textAlignVertical: 'top' },
    hint: { fontSize: 12, color: C.text3 },
    error: { color: C.danger, fontSize: Theme.fontSize.sm },
    primaryBtn: {
      backgroundColor: C.gold, borderRadius: Theme.radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 4,
    },
    primaryBtnText: { color: '#000', fontWeight: '700', fontSize: Theme.fontSize.md },
  }));
}
