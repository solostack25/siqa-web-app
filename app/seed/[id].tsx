import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { shareLink, getSeedShareUrl } from '../../lib/share';
import { useTheme, type AppColors } from '../../lib/theme';
import { DesktopShell } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { Glyph, type GlyphName } from '../../components/Glyph';
import { showToast } from '../../components/Toast';
import {
  Avatar,
  Card,
  CardTitle,
  Chip,
  ENDORSEMENT_SELECT,
  EndorseSeedSheet,
  EndorsementCard,
  PrimaryButton,
  ProgressBar,
  RequestEndorsementsSheet,
  ReviewCard,
  Tag,
  money,
  timeAgo,
  useMeasuredWidth,
  useReviewVotes,
  type PublicReview,
  type SeedEndorsement,
} from '../../components/SeedSocial';

type SeedDetail = {
  id: string;
  title: string;
  subtitle: string | null;
  story: string | null;
  description: string | null;
  goal_amount: number;
  raised_amount: number;
  donor_count: number;
  end_date: string | null;
  cause_category: string | null;
  cover_image_url: string | null;
  image_url: string | null;
  video_url: string | null;
  bunny_video_url: string | null;
  media_url: string | null;
  zakat_eligible: boolean | null;
  sadaqah_jariyah: boolean | null;
  is_emergency: boolean | null;
  org_id: string | null;
  speaker_id: string | null;
  status: string | null;
  allow_reviews: boolean | null;
  organizations: {
    id: string;
    org_name: string;
    is_verified: boolean | null;
    logo_url: string | null;
    city: string | null;
    state: string | null;
    profile_id: string | null;
    stripe_onboarded?: boolean | null;
    payment_method_type?: string | null;
    payment_method_url?: string | null;
    payment_method_label?: string | null;
  } | null;
};

type Donation = { id: string; donor_name: string | null; amount: number; is_anonymous: boolean | null; message: string | null; created_at: string };
type Update = { id: string; body: string; created_at: string };
type ReviewFilter = 'all' | 'speaker' | 'helpful';

function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const d = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  return d > 0 ? d : null;
}

function categoryIcon(cat: string | null): GlyphName {
  const map: Record<string, GlyphName> = {
    water: 'water-outline', education: 'book-outline', medical: 'medkit-outline', masjid: 'moon-outline', emergency: 'alert-circle-outline', food: 'restaurant-outline',
  };
  return map[cat?.toLowerCase() ?? ''] ?? 'leaf-outline';
}

export default function SeedDetailScreen() {
  const { id, via, endorse } = useLocalSearchParams<{ id: string; via?: string; endorse?: string }>();
  const { colors: C } = useTheme();
  const { width, onLayout } = useMeasuredWidth();
  const wide = width >= 900;
  const styles = useMemo(() => makeStyles(C, wide), [C, wide]);

  const [seed, setSeed] = useState<SeedDetail | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [endorsements, setEndorsements] = useState<SeedEndorsement[]>([]);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [mySpeaker, setMySpeaker] = useState<{ id: string; verified: boolean } | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [reviewLimit, setReviewLimit] = useState(8);
  const [requestOpen, setRequestOpen] = useState(false);
  const [endorseOpen, setEndorseOpen] = useState(endorse === '1');
  const [updateDraft, setUpdateDraft] = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);

  const { voted, toggle: toggleVote } = useReviewVotes(reviews.map(r => r.id));

  useFocusEffect(
    useCallback(() => {
      if (id) load(String(id));
    }, [id])
  );

  async function load(seedId: string) {
    const [seedRes, donationRes, endorseRes, reviewRes, updateRes, sessionRes] = await Promise.all([
      supabase
        .from('fundraisers')
        .select(`
          id, title, subtitle, story, description, goal_amount, raised_amount, donor_count,
          end_date, cause_category, cover_image_url, image_url, video_url, bunny_video_url, media_url,
          zakat_eligible, sadaqah_jariyah, is_emergency, org_id, speaker_id, status, allow_reviews,
          organizations ( id, org_name, is_verified, logo_url, city, state, profile_id, stripe_onboarded,
                          payment_method_type, payment_method_url, payment_method_label )
        `)
        .eq('id', seedId)
        .single(),
      // public_donations: no emails, anonymous donors shown as "Anonymous".
      supabase
        .from('public_donations')
        .select('id, donor_name, amount, is_anonymous, message, created_at')
        .eq('fundraiser_id', seedId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.from('seed_endorsements').select(ENDORSEMENT_SELECT).eq('fundraiser_id', seedId).order('responded_at', { ascending: false, nullsFirst: false }),
      supabase.from('public_donation_reviews').select('*').eq('fundraiser_id', seedId).order('created_at', { ascending: false }).limit(60),
      supabase.from('fundraiser_updates').select('id, body, created_at').eq('fundraiser_id', seedId).order('created_at', { ascending: false }).limit(20),
      supabase.auth.getSession(),
    ]);

    const s = (seedRes.data || null) as SeedDetail | null;
    setSeed(s);
    setDonations((donationRes.data || []) as Donation[]);
    setEndorsements((endorseRes.data || []) as any);
    setReviews((reviewRes.data || []) as PublicReview[]);
    setUpdates((updateRes.data || []) as Update[]);

    const uid = sessionRes.data?.session?.user?.id;
    if (uid && s) {
      const [{ data: profile }, { data: speaker }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', uid).maybeSingle(),
        supabase.from('speakers').select('id, is_verified, approval_status').eq('profile_id', uid).maybeSingle(),
      ]);
      const admin = ['admin', 'owner', 'moderator', 'super_admin'].includes(String(profile?.role || '').toLowerCase());
      const ownsViaSpeaker = !!speaker && s.speaker_id === speaker.id;
      setCanManage(admin || s.organizations?.profile_id === uid || ownsViaSpeaker);
      setMySpeaker(speaker ? { id: speaker.id, verified: Boolean(speaker.is_verified && speaker.approval_status === 'approved') } : null);
    } else {
      setCanManage(false);
      setMySpeaker(null);
    }
    setLoading(false);
  }

  const endorsed = endorsements.filter(e => e.status === 'endorsed');
  const pendingCount = endorsements.filter(e => e.status === 'requested').length;
  const myEndorsement = mySpeaker ? endorsements.find(e => e.speaker_id === mySpeaker.id) || null : null;
  // An endorsing speaker shares with ?via=<their id> so reviews from donors
  // they brought in are credited "Came via …".
  const viaSpeakerId = typeof via === 'string' && endorsed.some(e => e.speaker_id === via) ? via : '';

  function handleShare() {
    if (!seed) return;
    const base = getSeedShareUrl(seed.id);
    const url = myEndorsement?.status === 'endorsed' ? `${base}?via=${myEndorsement.speaker_id}` : base;
    shareLink({ url, title: seed.title, text: seed.subtitle || undefined });
  }

  function goToDonate() {
    if (!seed) return;
    const org = seed.organizations;
    router.push({
      pathname: '/donate',
      params: {
        fundraiserId: seed.id,
        orgId: seed.org_id ?? '',
        title: seed.title,
        orgStripeAccountId: org?.stripe_onboarded ? (seed.org_id ?? '') : '',
        paymentMethodType: org?.payment_method_type ?? '',
        paymentMethodUrl: org?.payment_method_url ?? '',
        paymentMethodLabel: org?.payment_method_label ?? '',
        via: viaSpeakerId,
      },
    });
  }

  async function postUpdate() {
    if (!seed || !updateDraft.trim()) return;
    setPostingUpdate(true);
    const { error } = await supabase.from('fundraiser_updates').insert({ fundraiser_id: seed.id, body: updateDraft.trim() });
    setPostingUpdate(false);
    if (error) { showToast(error.message); return; }
    setUpdateDraft('');
    load(seed.id);
  }

  async function deleteUpdate(updateId: string) {
    const { error } = await supabase.from('fundraiser_updates').delete().eq('id', updateId);
    if (error) showToast(error.message); else setUpdates(u => u.filter(x => x.id !== updateId));
  }

  function onReviewCount(rid: string, delta: number) {
    setReviews(rs => rs.map(r => r.id === rid ? { ...r, helpful_count: Math.max(0, r.helpful_count + delta) } : r));
  }

  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}><ActivityIndicator color={C.gold} size="large" /></View>
      </DesktopShell>
    );
  }

  if (!seed) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={styles.muted}>This Seed couldn't be found.</Text>
          <TouchableOpacity style={{ padding: 12 }} onPress={() => router.back()}>
            <Text style={styles.link}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </DesktopShell>
    );
  }

  const videoUrl = seed.video_url || seed.bunny_video_url || seed.media_url || null;
  const coverUrl = seed.cover_image_url || seed.image_url || null;
  const pct = seed.goal_amount ? Math.min(Math.round((seed.raised_amount / seed.goal_amount) * 100), 100) : 0;
  const left = daysLeft(seed.end_date);
  const org = seed.organizations;
  const isLive = seed.status === 'active' || seed.status === 'published' || seed.status === 'approved' || seed.status === 'live';

  const shownReviews = (filter === 'speaker'
    ? reviews.filter(r => r.via_speaker_id)
    : filter === 'helpful'
    ? [...reviews].sort((a, b) => b.helpful_count - a.helpful_count)
    : reviews
  ).slice(0, reviewLimit);

  // ── Blocks ─────────────────────────────────────────────────────────────

  const donateBox = (
    <View style={styles.donateBox}>
      <View style={{ gap: 2 }}>
        <Text style={styles.raised}>{money(seed.raised_amount)}</Text>
        <Text style={styles.muted}>raised of {money(seed.goal_amount)} goal{left !== null ? ` · ${left} day${left === 1 ? '' : 's'} left` : ''}</Text>
      </View>
      <ProgressBar pct={pct} height={10} />
      <View style={styles.statRow}>
        <Text style={styles.stat}><Text style={styles.statNum}>{(seed.donor_count ?? 0).toLocaleString()}</Text> donors</Text>
        <Text style={styles.stat}><Text style={styles.statNum}>{reviews.length}</Text> reviews</Text>
        <Text style={styles.stat}><Text style={styles.statNum}>{endorsed.length}</Text> endorsements</Text>
      </View>
      {isLive ? (
        <PrimaryButton label="Donate now" onPress={goToDonate} />
      ) : (
        <View style={styles.notice}><Text style={styles.muted}>This Seed isn't accepting donations yet.</Text></View>
      )}
      <PrimaryButton label={myEndorsement?.status === 'endorsed' ? 'Share with your followers' : 'Share'} tone="ghost" onPress={handleShare} />
      {donations.length > 0 && (
        <View style={styles.recent}>
          <Text style={styles.label}>Recent donations</Text>
          {donations.slice(0, 5).map(d => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.heartDot}><Icon name="heart" size={14} color={C.emerald} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{d.is_anonymous ? 'Anonymous' : (d.donor_name || 'Anonymous')}</Text>
                <Text style={styles.muted}>{money(d.amount)} · {timeAgo(d.created_at)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const organizerCard = (
    <TouchableOpacity
      style={styles.organizer}
      disabled={!org}
      onPress={() => org && router.push({ pathname: '/org-profile', params: { id: org.id } } as any)}
      accessibilityRole="link"
    >
      <Avatar name={org?.org_name} url={org?.logo_url} size={48} tone="emerald" square />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={styles.rowTitle}>{org?.org_name ?? 'Siqa organization'}</Text>
          {org?.is_verified ? <Tag label="Verified" /> : null}
        </View>
        <Text style={styles.muted} numberOfLines={1}>
          is organizing this seed{[org?.city, org?.state].filter(Boolean).length ? ` · ${[org?.city, org?.state].filter(Boolean).join(', ')}` : ''}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color={C.text2} />
    </TouchableOpacity>
  );

  const speakerBanner = mySpeaker && !canManage ? (
    myEndorsement?.status === 'requested' ? (
      <View style={styles.speakerBanner}>
        <Icon name="mail-unread-outline" size={20} color={C.goldDim} />
        <Text style={[styles.body, { flex: 1, minWidth: 180 }]}>{org?.org_name || 'The organizer'} asked you to endorse this Seed.</Text>
        <PrimaryButton label="Respond" onPress={() => setEndorseOpen(true)} style={{ minHeight: 44 }} />
      </View>
    ) : mySpeaker.verified && !myEndorsement ? (
      <TouchableOpacity style={styles.speakerBanner} onPress={() => setEndorseOpen(true)}>
        <Icon name="star-outline" size={20} color={C.goldDim} />
        <Text style={[styles.body, { flex: 1 }]}>You're a verified speaker. Vouch for this Seed?</Text>
        <Text style={styles.link}>Endorse</Text>
      </TouchableOpacity>
    ) : null
  ) : null;

  const endorsementsCard = (
    <Card>
      <CardTitle
        icon="star"
        right={canManage ? (
          <TouchableOpacity onPress={() => setRequestOpen(true)} style={styles.textBtn}>
            <Text style={styles.link}>Request endorsements</Text>
          </TouchableOpacity>
        ) : myEndorsement?.status === 'endorsed' ? (
          <TouchableOpacity onPress={() => setEndorseOpen(true)} style={styles.textBtn}>
            <Text style={styles.link}>Edit yours</Text>
          </TouchableOpacity>
        ) : undefined}
      >
        {endorsed.length ? `Endorsed by ${endorsed.length} speaker${endorsed.length === 1 ? '' : 's'}` : 'Speaker endorsements'}
      </CardTitle>
      {canManage && pendingCount > 0 ? (
        <Text style={styles.muted}>{pendingCount} request{pendingCount === 1 ? '' : 's'} waiting for a response.</Text>
      ) : null}
      {endorsed.length === 0 ? (
        <Text style={styles.muted}>
          {canManage ? 'Ask verified speakers who know your work to vouch for this Seed. Their words show here.' : 'No speaker has endorsed this Seed yet.'}
        </Text>
      ) : (
        <View style={styles.endorseGrid}>
          {endorsed.map(e => (
            <View key={e.id} style={styles.endorseCell}><EndorsementCard e={e} /></View>
          ))}
        </View>
      )}
    </Card>
  );

  const storyCard = (seed.story || seed.description) ? (
    <Card>
      <CardTitle>The story</CardTitle>
      <Text style={styles.story}>{seed.story || seed.description}</Text>
    </Card>
  ) : null;

  const updatesCard = (updates.length > 0 || canManage) ? (
    <Card>
      <CardTitle>Updates{updates.length ? ` (${updates.length})` : ''}</CardTitle>
      {canManage && (
        <View style={{ gap: 10 }}>
          <TextInput
            value={updateDraft}
            onChangeText={setUpdateDraft}
            placeholder="Share progress with donors — what's happened, what's next."
            placeholderTextColor={C.text3}
            multiline
            maxLength={2000}
            style={styles.input}
          />
          <PrimaryButton label="Post update" tone="emerald" onPress={postUpdate} busy={postingUpdate} disabled={!updateDraft.trim()} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}
      {updates.map((u, i) => (
        <View key={u.id} style={[styles.update, i === updates.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 }]}>
          <Text style={styles.muted}>{timeAgo(u.created_at)} · {org?.org_name || 'Organizer'}</Text>
          <Text style={styles.body}>{u.body}</Text>
          {canManage && (
            <TouchableOpacity onPress={() => deleteUpdate(u.id)} style={styles.textBtn}><Text style={styles.danger}>Delete</Text></TouchableOpacity>
          )}
        </View>
      ))}
    </Card>
  ) : null;

  const reviewsCard = seed.allow_reviews === false && reviews.length === 0 ? null : (
    <Card>
      <CardTitle icon="chatbubble-ellipses-outline">Why people gave{reviews.length ? ` (${reviews.length})` : ''}</CardTitle>
      {reviews.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Via speakers" active={filter === 'speaker'} onPress={() => setFilter('speaker')} />
          <Chip label="Most helpful" active={filter === 'helpful'} onPress={() => setFilter('helpful')} />
        </View>
      )}
      {reviews.length === 0 ? (
        <Text style={styles.muted}>After donating, donors can share why they gave. Be the first.</Text>
      ) : shownReviews.length === 0 ? (
        <Text style={styles.muted}>No reviews from speaker referrals yet.</Text>
      ) : (
        <View style={{ gap: 16 }}>
          {shownReviews.map(r => (
            <ReviewCard key={r.id} r={r} voted={voted[r.id]} onVote={rv => toggleVote(rv, onReviewCount)} />
          ))}
        </View>
      )}
      {reviewLimit < (filter === 'speaker' ? reviews.filter(r => r.via_speaker_id).length : reviews.length) && (
        <PrimaryButton label="Show more reviews" tone="ghost" onPress={() => setReviewLimit(n => n + 10)} />
      )}
    </Card>
  );

  const guarantee = (
    <View style={styles.guarantee}>
      <Icon name="shield-checkmark-outline" size={18} color={C.emerald} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>Siqa giving guarantee</Text>
        <Text style={styles.muted}>Organizers and endorsing speakers are vetted by Siqa. Every review comes from a completed donation.</Text>
      </View>
    </View>
  );

  return (
    <DesktopShell>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.iconBtn} onPress={handleShare} accessibilityLabel="Share">
            <Icon name="share-outline" size={19} color={C.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: wide ? 56 : 24 }}>
          <View style={styles.page} onLayout={onLayout}>
            <View style={styles.titleBlock}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {seed.cause_category ? <Tag label={seed.cause_category} /> : null}
                {seed.zakat_eligible ? <Tag label="Zakat eligible" tone="gold" /> : null}
                {seed.sadaqah_jariyah ? <Tag label="Sadaqah jariyah" tone="gold" /> : null}
                {seed.is_emergency ? <Tag label="Emergency" tone="gold" /> : null}
                {!isLive ? <Tag label={seed.status === 'draft' ? 'Draft — not public yet' : 'Pending review'} tone="gold" /> : null}
              </View>
              <Text style={styles.title}>{seed.title}</Text>
              {seed.subtitle ? <Text style={styles.subtitle}>{seed.subtitle}</Text> : null}
            </View>

            <View style={styles.columns}>
              <View style={styles.main}>
                <TouchableOpacity activeOpacity={0.95} style={styles.hero} onPress={() => videoUrl && setPlaying(p => !p)} accessibilityLabel={videoUrl ? (playing ? 'Pause video' : 'Play video') : undefined}>
                  {videoUrl ? (
                    <Video
                      source={{ uri: videoUrl }}
                      posterSource={coverUrl ? { uri: coverUrl } : undefined}
                      usePoster={!!coverUrl && !playing}
                      style={StyleSheet.absoluteFill}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={playing}
                      isLooping
                      useNativeControls={false}
                    />
                  ) : coverUrl ? (
                    <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <View style={styles.heroFallback}><Glyph name={categoryIcon(seed.cause_category)} style={{ fontSize: 56 }} color={C.gold} /></View>
                  )}
                  {videoUrl && !playing && (
                    <View style={styles.heroScrim}>
                      <View style={styles.playCircle}><Icon name="play" size={26} color={C.black} /></View>
                    </View>
                  )}
                </TouchableOpacity>

                {organizerCard}
                {!wide && donateBox}
                {speakerBanner}
                {endorsementsCard}
                {storyCard}
                {updatesCard}
                {reviewsCard}
                {!wide && guarantee}
              </View>

              {wide && (
                <View style={styles.aside}>
                  {donateBox}
                  {guarantee}
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Phones: donate stays one tap away. A sibling of the ScrollView
            (not position:fixed), which is what broke earlier versions on web. */}
        {!wide && isLive && (
          <View style={styles.bottomBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{money(seed.raised_amount)} <Text style={styles.muted}>of {money(seed.goal_amount)}</Text></Text>
              <View style={{ marginTop: 6 }}><ProgressBar pct={pct} height={6} /></View>
            </View>
            <PrimaryButton label="Donate" onPress={goToDonate} style={{ minWidth: 120 }} />
          </View>
        )}

        {canManage && (
          <RequestEndorsementsSheet
            visible={requestOpen}
            onClose={() => setRequestOpen(false)}
            fundraiserId={seed.id}
            existing={endorsements}
            onSent={() => load(seed.id)}
          />
        )}
        {mySpeaker && (
          <EndorseSeedSheet
            visible={endorseOpen}
            onClose={() => setEndorseOpen(false)}
            fundraiserId={seed.id}
            seedTitle={seed.title}
            orgName={org?.org_name}
            speakerId={mySpeaker.id}
            existing={myEndorsement}
            onDone={() => load(seed.id)}
          />
        )}
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors, wide: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg2 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 8 },
    topBar: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
      paddingTop: Platform.OS === 'web' ? 10 : 54, paddingBottom: 8, backgroundColor: C.bg,
      borderBottomWidth: 1, borderBottomColor: C.border2,
    },
    iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

    page: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: wide ? 24 : 12, paddingTop: wide ? 24 : 14, gap: 16 },
    titleBlock: { gap: 10 },
    title: { color: C.text, fontSize: wide ? 34 : 25, fontWeight: '800', lineHeight: wide ? 40 : 31, letterSpacing: -0.5, maxWidth: 820 },
    subtitle: { color: C.text2, fontSize: 16, lineHeight: 23, maxWidth: 820 },

    columns: { flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 16, alignItems: 'flex-start' },
    main: { flex: wide ? 1 : undefined, width: wide ? undefined : '100%', minWidth: 0, gap: 16 },
    aside: { width: 360, gap: 16 },

    hero: { width: '100%', aspectRatio: wide ? 16 / 9 : 4 / 3, borderRadius: 18, backgroundColor: C.surface2, overflow: 'hidden' },
    heroFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.emeraldSoft },
    heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
    playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },

    organizer: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border2 },
    speakerBanner: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldSoft },

    donateBox: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border2, padding: 20, gap: 14, width: '100%' },
    raised: { color: C.text, fontSize: 30, fontWeight: '800' },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    stat: { color: C.text2, fontSize: 14 },
    statNum: { color: C.text, fontWeight: '700' },
    recent: { gap: 12, borderTopWidth: 1, borderTopColor: C.border2, paddingTop: 14 },
    heartDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.emeraldBg, alignItems: 'center', justifyContent: 'center' },
    notice: { padding: 12, borderRadius: 12, backgroundColor: C.surface2 },
    guarantee: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border2 },

    endorseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    endorseCell: { flexGrow: 1, flexBasis: 260, minWidth: 0 },

    story: { color: C.text, fontSize: 16, lineHeight: 26 },
    update: { gap: 6, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border2 },
    input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, color: C.text, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },

    bottomBar: {
      flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 30 : 12, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border2,
    },

    label: { color: C.text, fontSize: 14, fontWeight: '700' },
    rowTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
    body: { color: C.text, fontSize: 15, lineHeight: 22 },
    muted: { color: C.text2, fontSize: 14, lineHeight: 20 },
    link: { color: C.emerald, fontSize: 14, fontWeight: '700' },
    danger: { color: C.danger, fontSize: 13, fontWeight: '600' },
    textBtn: { minHeight: 36, justifyContent: 'center' },
  });
}
