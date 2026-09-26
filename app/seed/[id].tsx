import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';

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
  organizations: {
    id: string;
    org_name: string;
    is_verified: boolean | null;
    logo_url: string | null;
    stripe_onboarded?: boolean | null;
  } | null;
};

type Donation = {
  id: string;
  donor_name: string | null;
  amount: number;
  is_anonymous: boolean | null;
  message: string | null;
  created_at: string;
};

function formatMoney(cents: number) {
  return '$' + Math.round((cents || 0) / 100).toLocaleString();
}

function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  const d = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return d > 0 ? d : null;
}

function getCategoryEmoji(cat: string | null) {
  const map: Record<string, string> = {
    water: '💧', education: '📚', medical: '🏥', masjid: '🕌', emergency: '🆘',
  };
  return map[cat?.toLowerCase() ?? ''] ?? '🌿';
}

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 2592000) + 'mo ago';
}

export default function SeedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = isDesktopWeb ? Math.min(windowWidth - 220, 720) : windowWidth;
  const styles = makeStyles(C);

  const [seed, setSeed] = useState<SeedDetail | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (id) load(id);
  }, [id]);

  async function load(seedId: string) {
    const { data } = await supabase
      .from('fundraisers')
      .select(`
        id, title, subtitle, story, description, goal_amount, raised_amount, donor_count,
        end_date, cause_category, cover_image_url, image_url, video_url, bunny_video_url, media_url,
        zakat_eligible, sadaqah_jariyah, is_emergency, org_id,
        organizations ( id, org_name, is_verified, logo_url, stripe_onboarded )
      `)
      .eq('id', seedId)
      .single();

    if (data) setSeed(data as any);

    const { data: donationData } = await supabase
      .from('donations')
      .select('id, donor_name, amount, is_anonymous, message, created_at')
      .eq('fundraiser_id', seedId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20);

    if (donationData) setDonations(donationData);
    setLoading(false);
  }

  async function handleShare() {
    try {
      await Share.share({
        message: seed ? `Support "${seed.title}" on Siqa` : 'Support this Seed on Siqa',
      });
    } catch {
      // ignore — share sheet dismissed or unsupported
    }
  }

  function goToDonate() {
    if (!seed) return;
    router.push({
      pathname: '/donate',
      params: {
        fundraiserId: seed.id,
        orgId: seed.org_id ?? '',
        title: seed.title,
        orgStripeAccountId: seed.organizations?.stripe_onboarded ? (seed.org_id ?? '') : '',
      },
    });
  }

  if (loading) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  if (!seed) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>This Seed couldn't be found.</Text>
          <TouchableOpacity style={styles.backBtnCenter} onPress={() => router.back()}>
            <Text style={styles.backBtnCenterText}>← Go Back</Text>
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
  const emoji = getCategoryEmoji(seed.cause_category);
  const badges = [
    seed.zakat_eligible && 'Zakat Eligible',
    seed.sadaqah_jariyah && 'Sadaqah Jariyah',
    seed.is_emergency && 'Emergency',
  ].filter(Boolean) as string[];

  return (
    <DesktopShell>
      <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <View style={[styles.inner, { maxWidth: contentWidth }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
              <Icon name="arrow-back" size={20} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.roundBtn} onPress={handleShare}>
              <Icon name="share-outline" size={19} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Hero media */}
          <TouchableOpacity
            activeOpacity={0.95}
            style={styles.hero}
            onPress={() => videoUrl && setPlaying(p => !p)}
          >
            {videoUrl ? (
              <Video
                source={{ uri: videoUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode={ResizeMode.COVER}
                shouldPlay={playing}
                isLooping
                useNativeControls={false}
              />
            ) : coverUrl ? (
              <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={styles.heroFallback}>
                <Text style={styles.heroFallbackEmoji}>{emoji}</Text>
              </View>
            )}
            {videoUrl && !playing && (
              <View style={styles.heroScrim}>
                <View style={styles.playCircle}>
                  <Text style={styles.playIcon}>▶</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Title + organizer */}
          <View style={styles.body}>
            {seed.cause_category && (
              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{emoji} {seed.cause_category}</Text>
              </View>
            )}
            <Text style={styles.title}>{seed.title}</Text>
            {seed.subtitle && <Text style={styles.subtitle}>{seed.subtitle}</Text>}

            <TouchableOpacity
              style={styles.orgRow}
              disabled={!org}
              onPress={() => org && router.push({ pathname: '/org-profile', params: { id: org.id } } as any)}
            >
              <View style={styles.orgAvatar}>
                {org?.logo_url ? (
                  <Image source={{ uri: org.logo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Text style={styles.orgAvatarEmoji}>{emoji}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgLabel}>Organized by</Text>
                <View style={styles.orgNameRow}>
                  <Text style={styles.orgName}>{org?.org_name ?? 'Siqa Organization'}</Text>
                  {org?.is_verified && <Icon name="checkmark-circle" size={14} color={C.emeraldLight} />}
                </View>
              </View>
            </TouchableOpacity>

            {/* Progress */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.raisedText}>
                <Text style={styles.raisedAmount}>{formatMoney(seed.raised_amount)}</Text> raised of {formatMoney(seed.goal_amount)} goal
              </Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsText}>{(seed.donor_count ?? 0).toLocaleString()} donors</Text>
              <Text style={styles.statsDot}>·</Text>
              <Text style={styles.statsText}>{pct}% funded</Text>
              {left !== null && (
                <>
                  <Text style={styles.statsDot}>·</Text>
                  <Text style={[styles.statsText, left <= 7 && { color: C.live }]}>{left} days left</Text>
                </>
              )}
            </View>

            {badges.length > 0 && (
              <View style={styles.badgeRow}>
                {badges.map(b => (
                  <View key={b} style={styles.badge}>
                    <Text style={styles.badgeText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.donateBtnInline} onPress={goToDonate}>
              <Text style={styles.donateBtnInlineText}>🌱 Plant a Seed</Text>
            </TouchableOpacity>

            {/* Story */}
            {(seed.story || seed.description) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Story</Text>
                <Text style={styles.storyText}>{seed.story || seed.description}</Text>
              </View>
            )}

            {/* Recent donations */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Donations {donations.length > 0 ? `(${(seed.donor_count ?? donations.length).toLocaleString()})` : ''}
              </Text>
              {donations.length === 0 ? (
                <Text style={styles.emptyDonations}>Be the first to plant a seed for this cause.</Text>
              ) : (
                <View style={{ gap: 14 }}>
                  {donations.map(d => (
                    <View key={d.id} style={styles.donorRow}>
                      <View style={styles.donorAvatar}>
                        <Text style={styles.donorAvatarText}>
                          {(d.is_anonymous ? 'A' : (d.donor_name || 'A')).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.donorTopRow}>
                          <Text style={styles.donorName}>
                            {d.is_anonymous ? 'Anonymous' : (d.donor_name || 'Anonymous')}
                          </Text>
                          <Text style={styles.donorAmount}>{formatMoney(d.amount)}</Text>
                        </View>
                        {d.message ? <Text style={styles.donorMessage}>{d.message}</Text> : null}
                        <Text style={styles.donorTime}>{timeAgo(d.created_at)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* This was a "sticky" footer via position:fixed/absolute in
                earlier versions — three attempts, none actually reliable
                against Expo Router's web screen wrapper (see commit
                history). Rather than try a fourth positioning trick,
                this is now just a normal element at the true end of the
                scrollable content: guaranteed correct, no overlay risk,
                at the cost of not following you while you scroll. */}
            <TouchableOpacity style={styles.donateBtnBottom} onPress={goToDonate}>
              <Text style={styles.donateBtnBottomText}>🌱 Plant a Seed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 12 },
    emptyText: { color: C.text3, fontSize: 14 },
    backBtnCenter: { paddingHorizontal: 16, paddingVertical: 10 },
    backBtnCenterText: { color: C.gold, fontWeight: '600' },
    scroll: { paddingBottom: 40 },
    inner: { width: '100%', alignSelf: 'center' },

    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },

    hero: {
      marginHorizontal: Theme.spacing.lg, aspectRatio: 4 / 3, borderRadius: Theme.radius.xl,
      backgroundColor: C.surface2, overflow: 'hidden', position: 'relative',
    },
    heroFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    heroFallbackEmoji: { fontSize: 56 },
    heroScrim: {
      ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)',
      alignItems: 'center', justifyContent: 'center',
    },
    playCircle: {
      width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(201,168,76,0.92)',
      alignItems: 'center', justifyContent: 'center',
    },
    playIcon: { color: '#000', fontSize: 22, marginLeft: 3 },

    body: { paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.xl },
    categoryChip: {
      alignSelf: 'flex-start', backgroundColor: C.goldBg, borderRadius: 999,
      paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
    },
    categoryChipText: { color: C.gold, fontSize: 11, fontWeight: '700' },
    title: { fontSize: 24, fontWeight: '800', color: C.text, lineHeight: 30, marginBottom: 6 },
    subtitle: { fontSize: 14, color: C.text2, lineHeight: 20, marginBottom: 16 },

    orgRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginBottom: 20, paddingVertical: 6,
    },
    orgAvatar: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    orgAvatarEmoji: { fontSize: 18 },
    orgLabel: { fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
    orgNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    orgName: { fontSize: 14, fontWeight: '700', color: C.text },

    progressTrack: { height: 8, borderRadius: 999, backgroundColor: C.surface2, overflow: 'hidden', marginBottom: 10 },
    progressFill: { height: '100%', borderRadius: 999, backgroundColor: C.emeraldLight },
    progressRow: { marginBottom: 4 },
    raisedText: { fontSize: 14, color: C.text2 },
    raisedAmount: { fontSize: 18, fontWeight: '800', color: C.text },
    statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    statsText: { fontSize: 12, color: C.text3, fontWeight: '600' },
    statsDot: { color: C.text3 },

    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
    badge: {
      backgroundColor: C.emeraldBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: 0.5, borderColor: 'rgba(61,190,138,0.2)',
    },
    badgeText: { color: C.emeraldLight, fontSize: 11, fontWeight: '600' },

    donateBtnInline: {
      backgroundColor: C.gold, borderRadius: Theme.radius.md, paddingVertical: 14,
      alignItems: 'center', marginBottom: 28,
    },
    donateBtnInlineText: { color: C.black, fontSize: 16, fontWeight: '800' },

    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 10 },
    storyText: { fontSize: 14, color: C.text2, lineHeight: 22 },

    emptyDonations: { fontSize: 13, color: C.text3, fontStyle: 'italic' },
    donorRow: { flexDirection: 'row', gap: 10 },
    donorAvatar: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: C.goldBg,
      alignItems: 'center', justifyContent: 'center',
    },
    donorAvatarText: { color: C.gold, fontSize: 13, fontWeight: '700' },
    donorTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    donorName: { fontSize: 13, fontWeight: '700', color: C.text },
    donorAmount: { fontSize: 13, fontWeight: '700', color: C.gold },
    donorMessage: { fontSize: 12, color: C.text2, marginTop: 2, lineHeight: 17 },
    donorTime: { fontSize: 10, color: C.text3, marginTop: 3 },

    donateBtnBottom: {
      backgroundColor: C.gold, borderRadius: Theme.radius.md, paddingVertical: 15,
      alignItems: 'center', marginTop: 8,
    },
    donateBtnBottomText: { color: C.black, fontSize: 16, fontWeight: '800' },
  });
}
