import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Avatar } from '../components/SeedSocial';
import { Button, Chip, TextField } from '../components/ui';
import { font, radius, size as SIZE, space, type, useDS, type DSColors } from '../lib/ds';
import { goBack } from '../lib/goBack';

// Organization onboarding.
//
// First question: what kind of organization is this?
//   content   — publishes lectures by scholars who teach there (Yaqeen,
//               AlMaghrib style). Profile leads with Scholars + Videos and
//               its videos can reach Gems once approved. Gets an extra step
//               after submitting to add its scholars.
//   nonprofit — masjids, relief, charities. Seeds, services, projects.
//
// On desktop this is a focused page (no sidebar) with a live preview of the
// profile on the right that fills in as they answer.

type OrgKind = 'content' | 'nonprofit';
type Step = 'kind' | 'about' | 'contact' | 'mission' | 'scholars' | 'done';

const ORG_TYPES: Record<OrgKind, { value: string; label: string }[]> = {
  content: [
    { value: 'institute', label: 'Institute' },
    { value: 'seminary', label: 'Seminary' },
    { value: 'school', label: 'School' },
    { value: 'media', label: 'Media' },
    { value: 'masjid', label: 'Masjid' },
    { value: 'nonprofit', label: 'Nonprofit' },
  ],
  nonprofit: [
    { value: 'masjid', label: 'Masjid' },
    { value: 'nonprofit', label: 'Nonprofit' },
    { value: 'charity', label: 'Charity' },
    { value: 'school', label: 'School' },
    { value: 'relief', label: 'Relief' },
    { value: 'community', label: 'Community' },
  ],
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

type FormData = {
  org_name: string;
  org_type: string;
  city: string;
  state: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  ein: string;
  is_501c3: boolean;
  mission: string;
  tagline: string;
  fundraising_history: string;
};

const INITIAL: FormData = {
  org_name: '', org_type: '', city: '', state: '', website: '',
  contact_name: '', contact_email: '', contact_phone: '', ein: '', is_501c3: false,
  mission: '', tagline: '', fundraising_history: '',
};

type SpeakerHit = { id: string; display_name: string; avatar_url: string | null; is_claimed: boolean | null };
type Scholar = {
  key: string;
  speaker_id: string | null;
  name: string;
  avatar_url: string | null;
  claimed: boolean;
  invite_email: string | null;
  title: string;
};

const KIND_OPTIONS: { kind: OrgKind; title: string; body: string; shows: string; icon: any }[] = [
  {
    kind: 'content',
    title: 'We publish lectures and classes',
    body: 'Scholars teach with us and we post their videos, series and reminders.',
    shows: 'Your profile: Scholars · Videos · Posts',
    icon: 'diamond-outline',
  },
  {
    kind: 'nonprofit',
    title: 'We run programs and raise funds',
    body: 'Masjids, relief groups and charities that serve the community.',
    shows: 'Your profile: Seeds · Services · Projects',
    icon: 'leaf-outline',
  },
];

export default function OrgRegisterScreen() {
  const { c, shadow } = useDS();
  const isDesktopWeb = useIsDesktopWeb();
  const { width, height } = useWindowDimensions();
  const showPreview = isDesktopWeb && width >= 1100;
  const s = useMemo(() => makeStyles(c), [c]);

  const [kind, setKind] = useState<OrgKind | null>(null);
  const [step, setStep] = useState<Step>('kind');
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scholars step
  const [scholars, setScholars] = useState<Scholar[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SpeakerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const isContent = kind === 'content';
  const order: Step[] = isContent
    ? ['kind', 'about', 'contact', 'mission', 'scholars']
    : ['kind', 'about', 'contact', 'mission'];
  const stepIndex = order.indexOf(step);
  const totalSteps = order.length;

  function set(key: keyof FormData, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function fail(msg: string) {
    setError(msg);
    if (Platform.OS !== 'web') Alert.alert('Check this step', msg);
  }

  function validate(st: Step): string | null {
    if (st === 'kind' && !kind) return 'Pick the one that fits your organization best.';
    if (st === 'about') {
      if (!form.org_name.trim()) return 'Organization name is required.';
      if (!form.org_type) return 'Pick an organization type.';
      if (!form.city.trim()) return 'City is required.';
      if (!form.state) return 'Pick a state.';
    }
    if (st === 'contact') {
      if (!form.contact_name.trim()) return 'Contact name is required.';
      if (!form.contact_email.trim()) return 'Contact email is required.';
      if (!/\S+@\S+\.\S+/.test(form.contact_email)) return 'Enter a valid email address.';
      if (form.ein && !/^\d{9}$/.test(form.ein.replace(/-/g, ''))) return 'EIN must look like XX-XXXXXXX.';
    }
    if (st === 'mission' && !form.mission.trim()) return "Describe your organization's mission.";
    return null;
  }

  function next() {
    const err = validate(step);
    if (err) { fail(err); return; }
    setError(null);
    if (step === 'mission') { submit(); return; }
    setStep(order[stepIndex + 1]);
  }

  function back() {
    setError(null);
    if (step === 'kind' || step === 'scholars' || step === 'done') { goBack('/orgs'); return; }
    setStep(order[stepIndex - 1]);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to register your organization.');
        router.push('/(auth)/sign-in' as any);
        return;
      }

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({
          profile_id: user.id,
          org_name: form.org_name.trim(),
          org_type: form.org_type,
          org_kind: kind ?? 'nonprofit',
          city: form.city.trim(),
          state: form.state,
          website: form.website.trim() || null,
          ein: form.ein.trim() || null,
          mission: form.mission.trim(),
          tagline: form.tagline.trim() || null,
          approval_status: 'pending',
          trust_score: 60,
        })
        .select('id')
        .single();
      if (orgErr) throw orgErr;

      const { error: appErr } = await supabase.from('org_applications').insert({
        org_id: org.id,
        profile_id: user.id,
        org_name: form.org_name.trim(),
        org_type: form.org_type,
        ein: form.ein.trim() || null,
        website: form.website.trim() || null,
        city: form.city.trim(),
        state: form.state,
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone.trim() || null,
        is_501c3: form.is_501c3,
        fundraising_history: form.fundraising_history.trim() || null,
        status: 'pending',
      });
      if (appErr) throw appErr;

      setOrgId(org.id);
      setStep(isContent ? 'scholars' : 'done');
    } catch (e: any) {
      fail(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Scholar search ──────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'scholars') return;
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('speakers')
        .select('id, display_name, avatar_url, is_claimed')
        .eq('approval_status', 'approved')
        .ilike('display_name', `%${q.replace(/[%_]/g, '')}%`)
        .order('follower_count', { ascending: false })
        .limit(6);
      if (!live) return;
      setHits((data as SpeakerHit[]) ?? []);
      setSearching(false);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, step]);

  function addSpeaker(h: SpeakerHit) {
    if (scholars.some(x => x.speaker_id === h.id)) return;
    setScholars(prev => [...prev, {
      key: h.id, speaker_id: h.id, name: h.display_name, avatar_url: h.avatar_url,
      claimed: h.is_claimed !== false, invite_email: null, title: '',
    }]);
    setQuery('');
    setHits([]);
  }

  function addInvite() {
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name) { fail('Add their name.'); return; }
    if (email && !/\S+@\S+\.\S+/.test(email)) { fail('Enter a valid email or leave it blank.'); return; }
    setError(null);
    setScholars(prev => [...prev, {
      key: `invite-${Date.now()}`, speaker_id: null, name, avatar_url: null,
      claimed: false, invite_email: email || null, title: '',
    }]);
    setInviteName('');
    setInviteEmail('');
    setInviteOpen(false);
  }

  async function sendInvites() {
    if (!orgId) return;
    if (!scholars.length) { setStep('done'); return; }
    setSubmitting(true);
    const rows = scholars.map((x, i) => ({
      org_id: orgId,
      speaker_id: x.speaker_id,
      invite_name: x.speaker_id ? null : x.name,
      invite_email: x.invite_email,
      title: x.title.trim() || null,
      sort_order: i,
    }));
    const { error: err } = await supabase.from('speaker_affiliations').insert(rows);
    setSubmitting(false);
    if (err) { fail(err.message); return; }
    setStep('done');
  }

  // ── Pieces ──────────────────────────────────────────────────────────
  const header = (
    <View style={[s.header, isDesktopWeb && s.headerDesktop]}>
      {isDesktopWeb ? (
        <View style={s.brandRow}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>ص</Text></View>
          <Text style={s.headerTitle}>Register your organization</Text>
        </View>
      ) : step !== 'done' ? (
        <Pressable onPress={back} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="chevron-back" size={20} color={c.ink} />
        </Pressable>
      ) : <View />}
      {step !== 'done' ? (
        <View style={s.progressGroup}>
          <Text style={s.stepLabel}>Step {stepIndex + 1} of {totalSteps}</Text>
          {isDesktopWeb && (
            <View style={[s.progressTrack, { width: 160 }]}>
              <View style={[s.progressFill, { width: `${((stepIndex + 1) / totalSteps) * 100}%` }]} />
            </View>
          )}
          {isDesktopWeb && (
            <Pressable onPress={() => goBack('/orgs')} accessibilityRole="link">
              <Text style={s.exitLink}>{orgId ? 'Finish later' : 'Exit'}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );

  const mobileProgress = !isDesktopWeb && step !== 'done' ? (
    <View style={[s.progressTrack, { marginHorizontal: space[5] }]}>
      <View style={[s.progressFill, { width: `${((stepIndex + 1) / totalSteps) * 100}%` }]} />
    </View>
  ) : null;

  const titleFor: Record<Step, [string, string]> = {
    kind: ['What does your organization do?', 'This sets up your profile. Pick the one that fits most of your work.'],
    about: ['About your organization', 'The basics. This shows on your public profile.'],
    contact: ['Contact and legal info', 'This stays private. We use it to review and verify your application.'],
    mission: ['Your mission', isContent ? 'Tell people what you teach and who you serve.' : 'Help donors and community members understand who you are.'],
    scholars: ['Who teaches with you?', "They'll show under Scholars on your profile. Each one confirms before they appear."],
    done: ['', ''],
  };

  const kindStep = (
    <View style={[s.kindGrid, isDesktopWeb && s.kindGridDesktop]} accessibilityRole="radiogroup">
      {KIND_OPTIONS.map(o => {
        const on = kind === o.kind;
        return (
          <Pressable
            key={o.kind}
            onPress={() => { setKind(o.kind); setError(null); if (form.org_type && !ORG_TYPES[o.kind].some(t => t.value === form.org_type)) set('org_type', ''); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={({ pressed }) => [
              s.kindCard,
              isDesktopWeb && { flex: 1 },
              on ? [s.kindCardOn, shadow('card')] : shadow('hairline'),
              pressed && { transform: [{ scale: 0.99 }] },
            ]}
          >
            <View style={s.kindTop}>
              <View style={[s.kindTile, { backgroundColor: o.kind === 'content' ? c.goldTint : c.seedTint }]}>
                <Icon name={o.icon} size={22} color={o.kind === 'content' ? c.gold : c.seed} />
              </View>
              <View style={[s.radio, on && s.radioOn]} />
            </View>
            <Text style={[type.headline, { color: c.ink }]}>{o.title}</Text>
            <Text style={[type.subhead, font(400), { color: c.ink2 }]}>{o.body}</Text>
            <Text style={[type.micro, { color: c.ink2, marginTop: 4 }]}>{o.shows}</Text>
          </Pressable>
        );
      })}
      {isContent ? (
        <View style={s.note}>
          <Icon name="information-circle-outline" size={18} color={c.goldInk} />
          <Text style={[type.caption, { color: c.goldInk, flex: 1 }]}>
            Content organizations are reviewed by the Siqa team before their videos show in Gems. After you apply, you'll add the scholars who teach with you.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const aboutStep = (
    <View style={s.fields}>
      <TextField label="Organization name" placeholder={isContent ? 'e.g. Noor Institute' : 'e.g. ICNA Relief USA'} value={form.org_name} onChangeText={v => set('org_name', v)} autoCapitalize="words" />
      <View style={{ gap: 8 }}>
        <Text style={s.label}>Type</Text>
        <View style={s.chips}>
          {ORG_TYPES[kind ?? 'nonprofit'].map(t => (
            <Chip key={t.value} label={t.label} selected={form.org_type === t.value} onPress={() => set('org_type', t.value)} />
          ))}
        </View>
      </View>
      <View style={s.row}>
        <View style={{ flex: 1.4 }}>
          <TextField label="City" placeholder="Houston" value={form.city} onChangeText={v => set('city', v)} autoCapitalize="words" />
        </View>
        <View style={{ flex: 1, gap: 6, zIndex: 10 }}>
          <Text style={s.label}>State</Text>
          <Pressable style={s.select} onPress={() => setShowStateDropdown(v => !v)} accessibilityRole="button" accessibilityLabel="State">
            <Text style={[type.body, { color: form.state ? c.ink : c.ink3 }]}>{form.state || 'Select'}</Text>
            <Icon name={showStateDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={c.ink2} />
          </Pressable>
          {showStateDropdown && (
            <ScrollView style={[s.dropdown, shadow('raised')]} nestedScrollEnabled>
              {US_STATES.map(st => (
                <TouchableOpacity key={st} style={s.dropdownItem} onPress={() => { set('state', st); setShowStateDropdown(false); }}>
                  <Text style={[type.callout, { color: form.state === st ? c.ink : c.ink2 }, form.state === st && font(700)]}>{st}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
      <TextField label="Website" placeholder="https://yourorg.org" value={form.website} onChangeText={v => set('website', v)} autoCapitalize="none" keyboardType="url" />
    </View>
  );

  const contactStep = (
    <View style={s.fields}>
      <TextField label="Contact name" placeholder="Your full name" value={form.contact_name} onChangeText={v => set('contact_name', v)} autoCapitalize="words" />
      <TextField label="Contact email" placeholder="you@yourorg.org" value={form.contact_email} onChangeText={v => set('contact_email', v)} autoCapitalize="none" keyboardType="email-address" />
      <TextField label="Contact phone (optional)" placeholder="(555) 000-0000" value={form.contact_phone} onChangeText={v => set('contact_phone', v)} keyboardType="phone-pad" />
      <TextField label="EIN (optional)" placeholder="XX-XXXXXXX" value={form.ein} onChangeText={v => set('ein', v)} keyboardType="numbers-and-punctuation" />
      <View style={{ gap: 8 }}>
        <Text style={s.label}>501(c)(3) status</Text>
        <View style={s.chips}>
          <Chip label="Yes, we are 501(c)(3)" selected={form.is_501c3} onPress={() => set('is_501c3', true)} />
          <Chip label="Not yet" selected={!form.is_501c3} onPress={() => set('is_501c3', false)} />
        </View>
      </View>
      <View style={s.softNote}>
        <Icon name="lock-closed-outline" size={16} color={c.ink2} />
        <Text style={[type.caption, font(400), { color: c.ink2, flex: 1 }]}>Your EIN and contact details are never shown publicly. Only the Siqa team uses them to verify your organization.</Text>
      </View>
    </View>
  );

  const missionStep = (
    <View style={s.fields}>
      <TextField label="Mission" placeholder={isContent ? 'What do you teach, and who is it for?' : 'Describe what your organization does and who you serve...'} value={form.mission} onChangeText={v => set('mission', v)} multiline numberOfLines={4} style={{ minHeight: 110 }} />
      <TextField label="Tagline (optional)" placeholder="A short line people will remember" value={form.tagline} onChangeText={v => set('tagline', v)} maxLength={80} help={`${form.tagline.length}/80`} />
      {!isContent ? (
        <TextField label="Fundraising history (optional)" placeholder="Have you run fundraisers before?" value={form.fundraising_history} onChangeText={v => set('fundraising_history', v)} multiline numberOfLines={3} style={{ minHeight: 90 }} />
      ) : null}
    </View>
  );

  const scholarsStep = (
    <View style={s.fields}>
      <View style={{ gap: 6, zIndex: 10 }}>
        <TextField label="Search speakers on Siqa" placeholder="Type a name" value={query} onChangeText={setQuery} autoCapitalize="words" />
        {query.trim().length >= 2 ? (
          <View style={[s.results, shadow('raised')]}>
            {searching && !hits.length ? <ActivityIndicator color={c.ink2} style={{ padding: 12 }} /> : null}
            {hits.map(h => {
              const added = scholars.some(x => x.speaker_id === h.id);
              return (
                <View key={h.id} style={s.resultRow}>
                  <Avatar name={h.display_name} url={h.avatar_url} size={40} tone="neutral" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.body, font(600), { color: c.ink }]} numberOfLines={1}>{h.display_name}</Text>
                    <Text style={[type.caption, { color: c.ink2 }]}>{h.is_claimed === false ? 'Unclaimed profile' : 'On Siqa'}</Text>
                  </View>
                  <Button size="sm" variant={added ? 'soft' : 'primary'} label={added ? 'Added' : 'Add'} disabled={added} onPress={() => addSpeaker(h)} />
                </View>
              );
            })}
            <Pressable style={s.resultRow} onPress={() => { setInviteName(query.trim()); setInviteOpen(true); setQuery(''); }} accessibilityRole="button">
              <View style={s.plusTile}><Icon name="add" size={18} color={c.ink} /></View>
              <Text style={[type.body, font(600), { color: c.ink }]}>Not on Siqa? Invite “{query.trim()}”</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {inviteOpen ? (
        <View style={[s.inviteBox, shadow('card')]}>
          <Text style={[type.headline, { color: c.ink }]}>Invite someone not on Siqa</Text>
          <TextField label="Name" placeholder="e.g. Dr. Amina Khalid" value={inviteName} onChangeText={setInviteName} autoCapitalize="words" />
          <TextField label="Email (optional)" placeholder="name@example.com" value={inviteEmail} onChangeText={setInviteEmail} autoCapitalize="none" keyboardType="email-address" help="The Siqa team reaches out and verifies them before they appear." />
          <View style={s.chips}>
            <Button size="md" label="Add" onPress={addInvite} />
            <Button size="md" variant="secondary" label="Cancel" onPress={() => setInviteOpen(false)} />
          </View>
        </View>
      ) : (
        <Button size="md" variant="soft" icon="add" label="Add someone not on Siqa" onPress={() => setInviteOpen(true)} />
      )}

      {scholars.length ? (
        <View>
          <Text style={[type.headline, { color: c.ink, marginBottom: 4 }]}>Added ({scholars.length})</Text>
          {scholars.map(x => (
            <View key={x.key} style={[s.scholarRow, isDesktopWeb && { flexWrap: 'nowrap' }]}>
              <Avatar name={x.name} url={x.avatar_url} size={44} tone="neutral" />
              <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
                <Text style={[type.body, font(600), { color: c.ink }]} numberOfLines={1}>{x.name}</Text>
                <Text style={[type.micro, { color: x.speaker_id && x.claimed ? c.goldInk : c.seed }]}>
                  {!x.speaker_id ? 'Not on Siqa yet · Siqa will reach out'
                    : x.claimed ? 'On Siqa · they’ll confirm'
                    : 'Unclaimed profile · Siqa will verify'}
                </Text>
              </View>
              <TextField
                placeholder="Role, e.g. Senior Fellow"
                value={x.title}
                onChangeText={v => setScholars(prev => prev.map(y => y.key === x.key ? { ...y, title: v } : y))}
                maxLength={80}
                accessibilityLabel={`Role for ${x.name}`}
                containerStyle={{ flex: 1, minWidth: 170 }}
              />
              <Pressable
                onPress={() => setScholars(prev => prev.filter(y => y.key !== x.key))}
                style={s.removeBtn}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${x.name}`}
              >
                <Icon name="close" size={18} color={c.ink2} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const doneStep = (
    <View style={s.done}>
      <View style={s.doneIcon}><Icon name="checkmark" size={32} color={c.seed} /></View>
      <Text style={[type.title1, { color: c.ink, textAlign: 'center' }]}>Application submitted</Text>
      <Text style={[type.callout, { color: c.ink2, textAlign: 'center' }]}>
        <Text style={font(700)}>{form.org_name}</Text> is in review. The Siqa team usually reviews applications within 1–3 business days.
        {isContent && scholars.length ? ` We've asked ${scholars.length} scholar${scholars.length === 1 ? '' : 's'} to confirm.` : ''}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: 12, marginTop: 8 }}>
        {([
          ['Application submitted', true],
          [isContent ? 'Scholars confirm' : 'Siqa team reviews', false],
          [isContent ? 'Siqa team reviews · videos reach Gems' : 'Organization approved and live', false],
        ] as [string, boolean][]).map(([label, doneFlag], i) => (
          <View key={String(label)} style={s.doneRow}>
            <View style={[s.doneDot, doneFlag ? { backgroundColor: c.seedTint, borderColor: c.seed } : null]}>
              {doneFlag ? <Icon name="checkmark" size={14} color={c.seed} /> : <Text style={[type.micro, { color: c.ink2 }]}>{i + 1}</Text>}
            </View>
            <Text style={[type.body, { color: doneFlag ? c.seed : c.ink2 }, doneFlag && font(600)]}>{String(label)}</Text>
          </View>
        ))}
      </View>
      <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
        {orgId ? <Button label="View your profile" onPress={() => router.replace({ pathname: '/org-profile', params: { id: orgId } } as any)} /> : null}
        <Button variant="secondary" label="Back to organizations" onPress={() => router.replace('/(tabs)/orgs' as any)} />
      </View>
    </View>
  );

  const body =
    step === 'kind' ? kindStep
    : step === 'about' ? aboutStep
    : step === 'contact' ? contactStep
    : step === 'mission' ? missionStep
    : step === 'scholars' ? scholarsStep
    : doneStep;

  const primaryLabel =
    step === 'mission' ? 'Submit application'
    : step === 'scholars' ? (scholars.length ? `Send ${scholars.length} invite${scholars.length === 1 ? '' : 's'}` : 'Continue')
    : 'Continue';
  const primaryAction = step === 'scholars' ? sendInvites : next;

  const actions = step !== 'done' ? (
    <View style={[s.actions, isDesktopWeb && s.actionsDesktop]}>
      {error ? <Text style={[type.caption, { color: c.danger }]}>{error}</Text> : null}
      <View style={[{ gap: 8 }, isDesktopWeb && { flexDirection: 'row' }]}>
        {isDesktopWeb && step !== 'kind' && step !== 'scholars' ? (
          <Button variant="secondary" label="Back" onPress={back} />
        ) : null}
        <Button label={primaryLabel} onPress={primaryAction} loading={submitting} disabled={step === 'kind' && !kind} style={isDesktopWeb ? { minWidth: 200 } : undefined} />
        {step === 'scholars' ? (
          <Button variant={isDesktopWeb ? 'secondary' : 'ghost'} label="Skip for now" onPress={() => setStep('done')} />
        ) : null}
      </View>
      {step === 'mission' ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>The Siqa team reviews applications within 1–3 business days.</Text> : null}
    </View>
  ) : null;

  const formColumn = (
    <View style={[s.formCol, isDesktopWeb && s.formColDesktop]}>
      {step !== 'done' ? (
        <View style={{ gap: 6, marginBottom: space[6] }}>
          <Text style={[isDesktopWeb ? type.display : type.title1, { color: c.ink }]}>{titleFor[step][0]}</Text>
          <Text style={[type.callout, { color: c.ink2 }]}>{titleFor[step][1]}</Text>
        </View>
      ) : null}
      {body}
      {isDesktopWeb ? actions : null}
    </View>
  );

  const preview = showPreview && step !== 'done' ? (
    <View style={s.previewPane} accessibilityLabel="Profile preview">
      <Text style={[type.micro, { color: c.ink2, letterSpacing: 0.4 }]}>PREVIEW OF YOUR PROFILE</Text>
      <ProfilePreview c={c} shadow={shadow} kind={kind} name={form.org_name} tagline={form.tagline || form.mission} location={[form.city, form.state].filter(Boolean).join(', ')} scholars={scholars} />
      <Text style={[type.caption, { color: c.ink2 }]}>
        {kind === 'content'
          ? 'Your scholars and videos lead your page. Videos can show in Gems once you’re approved.'
          : kind === 'nonprofit'
          ? 'Your Seeds and programs lead your page. Profile videos stay on your page.'
          : 'Pick what your organization does to see your profile take shape.'}
      </Text>
    </View>
  ) : null;

  const page = (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      {mobileProgress}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={isDesktopWeb ? s.scrollDesktop : s.scroll} keyboardShouldPersistTaps="handled">
        {isDesktopWeb ? (
          <View style={[s.desktopRow, { minHeight: Math.max(0, height - 66) }]}>
            {formColumn}
            {preview}
          </View>
        ) : formColumn}
      </ScrollView>
      {!isDesktopWeb ? actions : null}
    </KeyboardAvoidingView>
  );

  // Phones keep the normal app chrome; desktop is a focused page.
  return isDesktopWeb ? page : <DesktopShell>{page}</DesktopShell>;
}

function ProfilePreview({ c, shadow, kind, name, tagline, location, scholars }: {
  c: DSColors; shadow: ReturnType<typeof useDS>['shadow']; kind: OrgKind | null; name: string; tagline: string; location: string; scholars: Scholar[];
}) {
  const tabs = kind === 'content' ? ['Overview', 'Scholars', 'Videos', 'Posts', 'About']
    : kind === 'nonprofit' ? ['Overview', 'Seeds', 'Videos', 'Endorsements', 'About']
    : ['Overview', '·  ·  ·'];
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden' }, shadow('card')]}>
      <View style={{ height: 84, backgroundColor: c.night }} />
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <View style={[{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.surface, marginTop: -32, alignItems: 'center', justifyContent: 'center' }, shadow('raised')]}>
          <Avatar name={name || '?'} size={52} tone={kind === 'nonprofit' ? 'emerald' : 'gold'} square />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Text style={[type.title2, { color: name ? c.ink : c.ink3 }]} numberOfLines={1}>{name || 'Your organization'}</Text>
          {kind ? (
            <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: kind === 'content' ? c.goldTint : c.seedTint }}>
              <Text style={[type.micro, { color: kind === 'content' ? c.goldInk : c.seed }]}>{kind === 'content' ? 'Content publisher' : 'Nonprofit'}</Text>
            </View>
          ) : null}
        </View>
        {tagline ? <Text style={[type.caption, font(400), { color: c.ink2, marginTop: 4 }]} numberOfLines={2}>{tagline}</Text> : null}
        {location ? <Text style={[type.caption, { color: c.ink2, marginTop: 2 }]}>{location}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14, borderBottomWidth: 1, borderBottomColor: c.line }}>
          {tabs.map((t, i) => (
            <Text key={t} style={[type.caption, { paddingVertical: 8, color: i === 0 ? c.ink : c.ink2 }, i === 0 && { ...font(700), borderBottomWidth: 2, borderBottomColor: c.ink }]}>{t}</Text>
          ))}
        </View>
        {kind === 'content' && scholars.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            {scholars.slice(0, 6).map(x => (
              <View key={x.key} style={{ width: '30%', minWidth: 90, alignItems: 'center', gap: 6, padding: 10, borderRadius: 14, backgroundColor: c.bgSunk }}>
                <Avatar name={x.name} url={x.avatar_url} size={44} tone="neutral" />
                <Text style={[type.micro, { color: c.ink, textAlign: 'center' }]} numberOfLines={2}>{x.name}</Text>
                {x.title ? <Text style={[type.micro, font(500), { color: c.ink2, textAlign: 'center' }]} numberOfLines={1}>{x.title}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {[0, 1, 2].map(i => <View key={i} style={{ flex: 1, height: 64, borderRadius: 12, backgroundColor: c.surfaceSoft }} />)}
          </View>
        )}
      </View>
    </View>
  );
}

function makeStyles(c: DSColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: Platform.OS === 'web' ? 16 : 56, paddingBottom: 12, paddingHorizontal: space[5],
    },
    headerDesktop: { paddingTop: 16, paddingHorizontal: space[10], borderBottomWidth: 1, borderBottomColor: c.line, flexWrap: 'wrap', gap: 12 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandMark: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.night, alignItems: 'center', justifyContent: 'center' },
    brandMarkText: { color: c.brandGold, fontSize: 18, ...font(700) },
    headerTitle: { ...type.headline, ...font(800, 'display'), fontSize: 18, color: c.ink },
    backBtn: { width: SIZE.controlMd, height: SIZE.controlMd, borderRadius: radius.pill, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
    progressGroup: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepLabel: { ...type.subhead, color: c.ink2 },
    exitLink: { ...type.subhead, ...font(600), color: c.ink, textDecorationLine: 'underline' },
    progressTrack: { height: 4, borderRadius: 999, backgroundColor: c.surfaceStrong, overflow: 'hidden' },
    progressFill: { height: 4, backgroundColor: c.primary },
    scroll: { paddingHorizontal: space[5], paddingTop: space[6], paddingBottom: 40 },
    scrollDesktop: { flexGrow: 1 },
    desktopRow: { flexDirection: 'row', flexWrap: 'wrap', flexGrow: 1, width: '100%', maxWidth: 1240, alignSelf: 'center' },
    formCol: { width: '100%' },
    formColDesktop: { flexGrow: 999, flexShrink: 1, flexBasis: 520, maxWidth: 680, paddingHorizontal: space[10], paddingVertical: 48 },
    previewPane: { flexGrow: 1, flexShrink: 1, flexBasis: 400, backgroundColor: c.bgSunk, paddingHorizontal: space[10], paddingVertical: 48, gap: 14 },
    kindGrid: { gap: space[3] },
    kindGridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
    kindCard: { padding: space[4], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 2, borderColor: c.line, gap: 4, minWidth: 240 },
    kindCardOn: { borderColor: c.primary },
    kindTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    kindTile: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.lineControl },
    radioOn: { borderWidth: 7, borderColor: c.primary },
    note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: c.goldTint, width: '100%' },
    softNote: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: c.surfaceSoft },
    fields: { gap: space[4] },
    label: { ...type.caption, ...font(600), color: c.ink2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    row: { flexDirection: 'row', gap: space[3], zIndex: 10 },
    select: {
      minHeight: SIZE.controlMd + 4, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.surfaceSoft,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    dropdown: { position: 'absolute', top: 76, left: 0, right: 0, maxHeight: 200, backgroundColor: c.surface, borderRadius: radius.md, zIndex: 999 },
    dropdownItem: { paddingHorizontal: 14, paddingVertical: 10 },
    results: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 6 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8, minHeight: SIZE.controlMd },
    plusTile: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
    inviteBox: { gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: c.surface },
    scholarRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line },
    removeBtn: { width: SIZE.controlMd, height: SIZE.controlMd, alignItems: 'center', justifyContent: 'center' },
    actions: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: 34, gap: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg },
    actionsDesktop: { paddingHorizontal: 0, paddingTop: space[8], paddingBottom: 0, borderTopWidth: 0, backgroundColor: 'transparent' },
    done: { alignItems: 'center', gap: space[4], maxWidth: 520, alignSelf: 'center', width: '100%', paddingVertical: space[8] },
    doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.seedTint, alignItems: 'center', justifyContent: 'center' },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    doneDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  });
}
