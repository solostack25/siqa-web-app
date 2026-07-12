import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme } from '../../constants/theme';

type Speaker = {
  id: string;
  display_name: string;
  denomination: string | null;
  state: string | null;
  topics: string[];
  total_raised: number | null;
  follower_count: number | null;
  is_verified: boolean;
  approval_status: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
};

const TOPICS = ['All', 'Fundraising', 'Quran', 'Youth', 'Aqeedah', 'Marriage', 'Seerah'];

const ALL_TOPICS = ['Quran', 'Aqeedah', 'Fiqh', 'Seerah', 'Youth', 'Marriage', 'Fundraising', 'Dawah', 'Mental Health', 'Social Issues', 'Islamic History', 'Spirituality'];
const DENOMINATIONS = ['Sunni', 'Shia', 'Sufi', 'Salafi', 'Deobandi', 'Barelvi', 'Other'];
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ─── Speaker Application Modal ──────────────────────────────────
function SpeakerApplicationModal({
  visible,
  onClose,
  claimedSpeaker,
  profile,
}: {
  visible: boolean;
  onClose: () => void;
  claimedSpeaker: Speaker | null;
  profile: Profile | null;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Step 1 fields
  const [displayName, setDisplayName] = useState(claimedSpeaker?.display_name || '');
  const [denomination, setDenomination] = useState(claimedSpeaker?.denomination || '');
  const [state, setState] = useState(claimedSpeaker?.state || '');
  const [phone, setPhone] = useState('');

  // Step 2 fields
  const [selectedTopics, setSelectedTopics] = useState<string[]>(claimedSpeaker?.topics || []);

  // Step 3 fields
  const [bio, setBio] = useState('');
  const [whySiqa, setWhySiqa] = useState('');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function toggleTopic(t: string) {
    setSelectedTopics(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  }

  async function handleSubmit() {
    if (!profile) return;
    setSubmitting(true);
    const { error } = await supabase.from('speaker_applications').insert({
      profile_id: profile.id,
      full_name: profile.full_name || displayName,
      display_name: displayName,
      email: '',
      phone,
      denomination,
      state,
      topics: selectedTopics,
      bio,
      why_siqa: whySiqa,
      website,
      instagram_url: instagram,
      youtube_url: youtube,
      claimed_speaker_id: claimedSpeaker?.id || null,
      status: 'pending',
    });
    setSubmitting(false);
    if (error) {
      Alert.alert('Error', 'Could not submit application. Please try again.');
      return;
    }
    setSubmitted(true);
  }

  function handleClose() {
    setStep(1);
    setSubmitted(false);
    onClose();
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {submitted ? 'Application Sent' : claimedSpeaker ? 'Claim Your Profile' : 'Apply as Speaker'}
            </Text>
            <View style={{ width: 55 }} />
          </View>

          {submitted ? (
            // ── Success screen ───────────────────────────────
            <View style={styles.successWrap}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.successTitle}>Application Submitted!</Text>
              <Text style={styles.successSub}>
                JazakAllahu khayran. Our team will review your application and reach out within 2-3 business days.
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Progress bar */}
              <View style={styles.progressBar}>
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.progressDot, i < step && styles.progressDotActive]}
                  />
                ))}
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {step === 1 && (
                  <View style={styles.stepWrap}>
                    <Text style={styles.stepTitle}>Basic Information</Text>
                    <Text style={styles.stepSub}>How you'll appear on Siqa Speakers</Text>

                    <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="e.g. Sh. Omar Suleiman"
                      placeholderTextColor={C.text3}
                      autoCapitalize="words"
                    />

                    <Text style={styles.fieldLabel}>DENOMINATION</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
                      {DENOMINATIONS.map(d => (
                        <TouchableOpacity
                          key={d}
                          style={[styles.pill, denomination === d && styles.pillActive]}
                          onPress={() => setDenomination(d)}
                        >
                          <Text style={[styles.pillText, denomination === d && styles.pillTextActive]}>{d}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <Text style={styles.fieldLabel}>STATE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
                      {US_STATES.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={[styles.pill, state === s && styles.pillActive]}
                          onPress={() => setState(s)}
                        >
                          <Text style={[styles.pillText, state === s && styles.pillTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <Text style={styles.fieldLabel}>PHONE (optional)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+1 (555) 000-0000"
                      placeholderTextColor={C.text3}
                      keyboardType="phone-pad"
                    />
                  </View>
                )}

                {step === 2 && (
                  <View style={styles.stepWrap}>
                    <Text style={styles.stepTitle}>Topics You Speak On</Text>
                    <Text style={styles.stepSub}>Select all that apply</Text>
                    <View style={styles.topicGrid}>
                      {ALL_TOPICS.map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.topicChip, selectedTopics.includes(t) && styles.topicChipActive]}
                          onPress={() => toggleTopic(t)}
                        >
                          <Text style={[styles.topicChipText, selectedTopics.includes(t) && styles.topicChipTextActive]}>
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {step === 3 && (
                  <View style={styles.stepWrap}>
                    <Text style={styles.stepTitle}>Your Online Presence</Text>
                    <Text style={styles.stepSub}>Help us verify your identity</Text>

                    <Text style={styles.fieldLabel}>WEBSITE (optional)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={website}
                      onChangeText={setWebsite}
                      placeholder="https://yoursite.com"
                      placeholderTextColor={C.text3}
                      autoCapitalize="none"
                      keyboardType="url"
                    />

                    <Text style={styles.fieldLabel}>INSTAGRAM (optional)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={instagram}
                      onChangeText={setInstagram}
                      placeholder="https://instagram.com/yourhandle"
                      placeholderTextColor={C.text3}
                      autoCapitalize="none"
                    />

                    <Text style={styles.fieldLabel}>YOUTUBE (optional)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={youtube}
                      onChangeText={setYoutube}
                      placeholder="https://youtube.com/@yourchannel"
                      placeholderTextColor={C.text3}
                      autoCapitalize="none"
                    />
                  </View>
                )}

                {step === 4 && (
                  <View style={styles.stepWrap}>
                    <Text style={styles.stepTitle}>About You</Text>
                    <Text style={styles.stepSub}>Tell us about yourself and why you want to join Siqa</Text>

                    <Text style={styles.fieldLabel}>SHORT BIO</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.textArea]}
                      value={bio}
                      onChangeText={setBio}
                      placeholder="Share your background, education, and speaking experience..."
                      placeholderTextColor={C.text3}
                      multiline
                      numberOfLines={4}
                    />

                    <Text style={styles.fieldLabel}>WHY SIQA?</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.textArea]}
                      value={whySiqa}
                      onChangeText={setWhySiqa}
                      placeholder="Why do you want to be on Siqa Speakers?"
                      placeholderTextColor={C.text3}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                )}

                <View style={{ height: 40 }} />
              </ScrollView>

              {/* Footer nav */}
              <View style={styles.modalFooter}>
                {step > 1 && (
                  <TouchableOpacity style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
                    <Text style={styles.backBtnText}>← Back</Text>
                  </TouchableOpacity>
                )}
                {step < TOTAL_STEPS ? (
                  <TouchableOpacity
                    style={[styles.nextBtn, !displayName.trim() && step === 1 && styles.nextBtnDisabled]}
                    onPress={() => setStep(s => s + 1)}
                    disabled={!displayName.trim() && step === 1}
                  >
                    <Text style={styles.nextBtnText}>Next →</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.nextBtn, submitting && styles.nextBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting
                      ? <ActivityIndicator color={C.black} />
                      : <Text style={styles.nextBtnText}>Submit Application</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ────────────────────────────────────────────────
export default function DiscoverScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const { apply } = useLocalSearchParams<{ apply?: string }>();

  const [speakers, setSpeakers]       = useState<Speaker[]>([]);
  const [filtered, setFiltered]       = useState<Speaker[]>([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [activeTopic, setActiveTopic] = useState('All');
  const [profile, setProfile]         = useState<Profile | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [claimedSpeaker, setClaimedSpeaker] = useState<Speaker | null>(null);

  useEffect(() => {
    loadSpeakers();
    loadProfile();
  }, []);

  useEffect(() => {
    if (apply === '1' && (profile?.role === 'speaker' || profile?.role === 'admin')) {
      setClaimedSpeaker(null);
      setModalVisible(true);
    }
  }, [apply, profile]);

  useEffect(() => {
    applyFilters();
  }, [query, activeTopic, speakers]);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data);
  }

  async function loadSpeakers() {
    const { data, error } = await supabase
      .from('speakers')
      .select(`id, display_name, denomination, state, topics, total_raised, follower_count, is_verified, approval_status`)
      .eq('approval_status', 'approved')
      .order('follower_count', { ascending: false });

    if (!error && data) {
      setSpeakers(data);
      setFiltered(data);
    }
    setLoading(false);
  }

  function applyFilters() {
    let list = [...speakers];
    if (activeTopic !== 'All') {
      const topic = activeTopic.toLowerCase();
      list = list.filter(s => s.topics?.some(t => t.toLowerCase() === topic));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(s =>
        s.display_name.toLowerCase().includes(q) ||
        s.topics?.some(t => t.toLowerCase().includes(q)) ||
        s.state?.toLowerCase().includes(q) ||
        s.denomination?.toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }

  function formatRaised(cents: number | null) {
    if (!cents) return null;
    const d = cents / 100;
    if (d >= 1000000) return '$' + (d / 1000000).toFixed(1) + 'M';
    if (d >= 1000) return '$' + (d / 1000).toFixed(0) + 'k';
    return '$' + d.toFixed(0);
  }

  // Check if speaker name fuzzy-matches the logged-in user's name
  function isClaimed(speaker: Speaker): boolean {
    if (!profile?.full_name || (profile.role !== 'speaker' && profile.role !== 'admin')) return false;
    const normalize = (s: string) => s.toLowerCase()
      .replace(/^(sh\.|dr\.|imam|ustadha|ustadh)\s+/i, '').trim();
    return normalize(speaker.display_name).includes(normalize(profile.full_name)) ||
      normalize(profile.full_name).includes(normalize(speaker.display_name));
  }

  function handleClaim(speaker: Speaker) {
    setClaimedSpeaker(speaker);
    setModalVisible(true);
  }

  function handleApplyNew() {
    setClaimedSpeaker(null);
    setModalVisible(true);
  }

  function renderSpeaker({ item }: { item: Speaker }) {
    const initial = item.display_name
      .replace(/^(Sh\.|Dr\.|Imam|Ustadha|Ustadh)\s+/i, '')
      .charAt(0).toUpperCase();
    const location = [item.denomination, item.state].filter(Boolean).join(' · ');
    const raised = formatRaised(item.total_raised);
    const canClaim = isClaimed(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/speaker/[id]', params: { id: item.id } } as any)}
        activeOpacity={0.8}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.display_name}</Text>
            {item.is_verified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓</Text>
              </View>
            )}
          </View>
          {location ? <Text style={styles.location}>{location}</Text> : null}
          <View style={styles.tags}>
            {item.topics?.slice(0, 3).map(t => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
          {canClaim && (
            <TouchableOpacity
              style={styles.claimBtn}
              onPress={() => handleClaim(item)}
            >
              <Text style={styles.claimBtnText}>Claim this profile →</Text>
            </TouchableOpacity>
          )}
        </View>
        {raised ? (
          <View style={styles.right}>
            <Text style={styles.raised}>{raised}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  const ListFooter = useCallback(() => (
    (profile?.role === 'speaker' || profile?.role === 'admin') ? (
      <TouchableOpacity style={styles.applyRow} onPress={handleApplyNew}>
        <Text style={styles.applyRowText}>Don't see your profile?</Text>
        <Text style={styles.applyRowLink}> Apply now →</Text>
      </TouchableOpacity>
    ) : null
  ), [profile]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover Speakers</Text>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, topic, city..."
          placeholderTextColor={C.text3}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={TOPICS}
        keyExtractor={t => t}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topics}
        renderItem={({ item: topic }) => (
          <TouchableOpacity
            style={[styles.topicPill, activeTopic === topic && styles.topicPillActive]}
            onPress={() => setActiveTopic(topic)}
          >
            <Text style={[styles.topicText, activeTopic === topic && styles.topicTextActive]}>
              {topic}
            </Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.resultsRow}>
        <Text style={styles.resultsCount}>
          {filtered.length} verified speaker{filtered.length !== 1 ? 's' : ''}
        </Text>
        <Text style={styles.sortBtn}>Top Rated ↓</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderSpeaker}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<ListFooter />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No speakers match your search</Text>
            </View>
          }
        />
      )}

      <SpeakerApplicationModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        claimedSpeaker={claimedSpeaker}
        profile={profile}
      />
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    header: { paddingHorizontal: Theme.spacing.xl, paddingTop: 60, paddingBottom: Theme.spacing.md },
    title: { fontSize: Theme.fontSize.xxl, fontWeight: Theme.fontWeight.semibold, color: C.text },
    searchWrap: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
      borderRadius: Theme.radius.lg, marginHorizontal: Theme.spacing.lg,
      marginBottom: Theme.spacing.md, paddingHorizontal: Theme.spacing.md,
      borderWidth: 0.5, borderColor: C.border2, gap: Theme.spacing.sm,
    },
    searchIcon: { fontSize: 16 },
    searchInput: { flex: 1, paddingVertical: Theme.spacing.md, color: C.text, fontSize: Theme.fontSize.base },
    clearBtn: { color: C.text3, fontSize: 14, padding: 4 },
    topics: { paddingHorizontal: Theme.spacing.lg, paddingBottom: Theme.spacing.md, gap: Theme.spacing.sm },
    topicPill: {
      paddingHorizontal: Theme.spacing.md, paddingVertical: 6, height: 32,
      borderRadius: Theme.radius.full, backgroundColor: C.surface,
      borderWidth: 0.5, borderColor: C.border2, alignItems: 'center', justifyContent: 'center',
    },
    topicPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    topicText: { fontSize: Theme.fontSize.sm, color: C.text2, fontWeight: Theme.fontWeight.medium },
    topicTextActive: { color: C.black, fontWeight: Theme.fontWeight.bold },
    resultsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Theme.spacing.xl, paddingBottom: Theme.spacing.sm },
    resultsCount: { fontSize: Theme.fontSize.sm, color: C.text3 },
    sortBtn: { fontSize: Theme.fontSize.sm, color: C.gold },
    list: { paddingBottom: 100 },
    card: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, paddingVertical: Theme.spacing.md, paddingHorizontal: Theme.spacing.xl, borderBottomWidth: 0.5, borderBottomColor: C.border2 },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.goldDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarText: { color: C.gold, fontSize: 19, fontWeight: Theme.fontWeight.semibold },
    info: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: { fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.medium, color: C.text },
    verifiedBadge: { backgroundColor: C.goldBg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 0.5, borderColor: C.goldDim },
    verifiedText: { color: C.gold, fontSize: 9, fontWeight: Theme.fontWeight.bold },
    location: { fontSize: Theme.fontSize.xs, color: C.text3, marginTop: 2 },
    tags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 5 },
    tag: { backgroundColor: C.emeraldBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: Theme.radius.full },
    tagText: { color: C.emeraldLight, fontSize: 10 },
    right: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
    raised: { fontSize: Theme.fontSize.sm, color: C.gold, fontWeight: Theme.fontWeight.semibold },
    claimBtn: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.radius.sm, backgroundColor: C.goldBg, borderWidth: 0.5, borderColor: C.goldDim },
    claimBtnText: { fontSize: 11, color: C.gold, fontWeight: '600' },
    applyRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 24, paddingHorizontal: Theme.spacing.xl },
    applyRowText: { fontSize: Theme.fontSize.sm, color: C.text3 },
    applyRowLink: { fontSize: Theme.fontSize.sm, color: C.gold, fontWeight: '600' },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { color: C.text3, fontSize: Theme.fontSize.base },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: C.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: C.border2 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    modalCancel: { fontSize: 14, color: C.text3, width: 55 },
    progressBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingVertical: 14, justifyContent: 'center' },
    progressDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: C.border2 },
    progressDotActive: { backgroundColor: C.gold },
    modalBody: { paddingHorizontal: 20 },
    modalFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 0.5, borderTopColor: C.border2 },
    stepWrap: { gap: 14 },
    stepTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginTop: 4 },
    stepSub: { fontSize: 13, color: C.text3, marginTop: -8 },
    fieldLabel: { fontSize: 11, color: C.text3, letterSpacing: 1, fontWeight: '600', marginTop: 4 },
    fieldInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border2, borderRadius: Theme.radius.md, padding: 12, color: C.text, fontSize: 15 },
    textArea: { height: 100, textAlignVertical: 'top' },
    pillRow: { flexDirection: 'row' },
    pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Theme.radius.full, borderWidth: 1, borderColor: C.border2, marginRight: 7, backgroundColor: C.surface },
    pillActive: { backgroundColor: C.goldBg, borderColor: C.gold },
    pillText: { fontSize: 13, color: C.text2 },
    pillTextActive: { color: C.gold, fontWeight: '600' },
    topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    topicChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Theme.radius.full, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    topicChipActive: { backgroundColor: C.goldBg, borderColor: C.gold },
    topicChipText: { fontSize: 13, color: C.text2 },
    topicChipTextActive: { color: C.gold, fontWeight: '600' },
    backBtn: { flex: 1, paddingVertical: 14, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.border2, alignItems: 'center' },
    backBtnText: { fontSize: 15, color: C.text2, fontWeight: '600' },
    nextBtn: { flex: 2, paddingVertical: 14, borderRadius: Theme.radius.md, backgroundColor: C.gold, alignItems: 'center' },
    nextBtnDisabled: { opacity: 0.5 },
    nextBtnText: { fontSize: 15, color: C.black, fontWeight: '700' },
    successWrap: { alignItems: 'center', padding: 40, gap: 16 },
    successIcon: { fontSize: 56 },
    successTitle: { fontSize: 22, fontWeight: '700', color: C.text },
    successSub: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22 },
    doneBtn: { backgroundColor: C.gold, paddingHorizontal: 40, paddingVertical: 14, borderRadius: Theme.radius.md, marginTop: 8 },
    doneBtnText: { fontSize: 15, color: C.black, fontWeight: '700' },
  });
}