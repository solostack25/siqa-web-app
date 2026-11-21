/**
 * Full-page player for a nonprofit's profile video (public.org_videos).
 *
 * Works like a speaker's /watch/[videoId] page — pinned player, title, org
 * header, description, "More from <org>" — but it reads public.org_videos,
 * not public.videos, so org videos still never enter Gems, home, browse or
 * the speaker watch page's Related list. "More from" only lists this org's
 * own videos.
 */
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { useTheme, type AppColors } from '../../../lib/theme';
import { brandStyles, font } from '../../../lib/ds';
import { DesktopShell, useIsDesktopWeb } from '../../../components/DesktopShell';
import { focusedOnly } from '../../../components/FocusedOnly';
import { Avatar } from '../../../components/SeedSocial';
import { YouTubeEmbed } from '../../../components/YouTubeEmbed';
import { SeedVideo } from '../../../components/SeedVideo';
import { Icon } from '../../../components/Icon';
import { Button, Chip } from '../../../components/ui';
import { shareOrgVideo } from '../../../lib/share';
import { goBack } from '../../../lib/goBack';
import { Theme } from '../../../constants/theme';

const LIVE_SEED = ['active', 'published', 'approved', 'live'];
const VIEW_DELAY_MS = 10_000;

type OrgVideoDetail = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  platform: 'bunny' | 'youtube';
  video_url: string | null;
  platform_video_id: string | null;
  thumbnail_url: string | null;
  fundraiser_id: string | null;
  is_published: boolean;
  view_count: number;
  created_at: string;
  organizations: {
    id: string;
    org_name: string;
    logo_url: string | null;
    is_verified: boolean | null;
    city: string | null;
    state: string | null;
  } | null;
  fundraisers: { id: string; title: string; status: string } | null;
};

type MoreVideo = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  platform: string;
  platform_video_id: string | null;
  view_count: number;
  created_at: string;
};

function thumbFor(v: { thumbnail_url: string | null; platform: string; platform_video_id: string | null }) {
  if (v.thumbnail_url) return v.thumbnail_url;
  if (v.platform === 'youtube' && v.platform_video_id) return `https://i.ytimg.com/vi/${v.platform_video_id}/hqdefault.jpg`;
  return null;
}

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} view${n === 1 ? '' : 's'}`;
}

function timeAgo(ts: string | null) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function OrgVideoScreen() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktopWeb = useIsDesktopWeb();
  const width = isDesktopWeb ? windowWidth - 220 : windowWidth;
  const isWide = width > 900;
  const insets = useSafeAreaInsets();

  const [video, setVideo] = useState<OrgVideoDetail | null>(null);
  const [more, setMore] = useState<MoreVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: v } = await supabase
      .from('org_videos')
      .select(
        `id, org_id, title, description, platform, video_url, platform_video_id, thumbnail_url,
         fundraiser_id, is_published, view_count, created_at,
         organizations(id, org_name, logo_url, is_verified, city, state),
         fundraisers(id, title, status)`
      )
      .eq('id', id)
      .maybeSingle();

    // RLS already hides unpublished videos from everyone but the org's managers.
    setVideo((v as any) ?? null);
    setMissing(!v);
    setDescOpen(false);

    if (v) {
      const { data: rest } = await supabase
        .from('org_videos')
        .select('id, title, thumbnail_url, platform, platform_video_id, view_count, created_at')
        .eq('org_id', (v as any).org_id)
        .eq('is_published', true)
        .neq('id', id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(12);
      setMore((rest as MoreVideo[]) ?? []);
    } else {
      setMore([]);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Count a view once the viewer has stayed on the video for a bit.
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => {
      supabase.rpc('org_video_viewed', { p_id: id }).then(() => {});
    }, VIEW_DELAY_MS);
    return () => clearTimeout(t);
  }, [id]);

  const orgFallback = video?.org_id ? `/org-profile?id=${video.org_id}&tab=videos` : '/home';
  const back = () => goBack(orgFallback);
  const openOrg = () => {
    if (!video) return;
    router.push({ pathname: '/org-profile', params: { id: video.org_id, tab: 'videos' } } as any);
  };
  const openVideo = (vid: string) => router.push({ pathname: '/org-video/[id]', params: { id: vid } } as any);
  const share = () => {
    if (video) shareOrgVideo(video.id, video.title, video.organizations?.org_name);
  };

  if (loading && !video) {
    return (
      <DesktopShell>
        <View style={[styles.screen, styles.center]}>
          <ActivityIndicator color={C.gold} />
        </View>
      </DesktopShell>
    );
  }

  if (missing || !video) {
    return (
      <DesktopShell>
        <View style={[styles.screen, styles.center, { padding: 24, gap: 14 }]}>
          <Icon name="videocam-off-outline" size={36} color={C.text3} />
          <Text style={styles.mH2}>This video isn't available</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>It may have been removed or hidden by the organization.</Text>
          <Button size="md" variant="secondary" label="Go back" onPress={() => goBack('/home')} />
        </View>
      </DesktopShell>
    );
  }

  const org = video.organizations;
  const seed = video.fundraisers;
  const seedLive = !!seed && LIVE_SEED.includes(seed.status);
  const orgPlace = [org?.city, org?.state].filter(Boolean).join(', ');

  const playerMedia =
    video.platform === 'youtube' && video.platform_video_id ? (
      <YouTubeEmbed videoId={video.platform_video_id} autoplay />
    ) : video.video_url ? (
      <SeedVideo uri={video.video_url} poster={video.thumbnail_url} fit="contain" />
    ) : null;

  const hiddenNotice = !video.is_published ? (
    <View style={styles.hiddenNotice}>
      <Icon name="eye-off-outline" size={16} color={C.text2} />
      <Text style={styles.muted}>Hidden. Only your organization's managers can see this video.</Text>
    </View>
  ) : null;

  const orgRow = (
    <View style={styles.orgRow}>
      <TouchableOpacity style={styles.orgInfo} onPress={openOrg} accessibilityRole="link" accessibilityLabel={`Open ${org?.org_name ?? 'organization'}`}>
        <Avatar name={org?.org_name ?? 'Organization'} url={org?.logo_url ?? null} size={44} tone="emerald" square />
        <View style={{ flexShrink: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.orgName} numberOfLines={1}>
            {org?.org_name ?? 'Organization'}{org?.is_verified ? ' ✓' : ''}
          </Text>
          {orgPlace ? <Text style={styles.muted} numberOfLines={1}>{orgPlace}</Text> : null}
        </View>
      </TouchableOpacity>
      <Button size="md" variant="secondary" label="View page" onPress={openOrg} />
    </View>
  );

  const seedCta = seed && seedLive ? (
    <View style={styles.seedCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
        <Icon name="leaf-outline" size={18} color={C.emerald} />
        <Text style={styles.seedTitle} numberOfLines={2}>{seed.title}</Text>
      </View>
      <Button
        size="md"
        variant="gold"
        icon="leaf-outline"
        label="Support this Seed"
        onPress={() => router.push({ pathname: '/seed/[id]', params: { id: seed.id } } as any)}
      />
    </View>
  ) : null;

  const description = video.description ? (
    <TouchableOpacity activeOpacity={0.8} style={styles.descCard} onPress={() => setDescOpen(o => !o)} disabled={video.description.length <= 140}>
      <Text style={styles.meta}>{formatViews(video.view_count)} · {timeAgo(video.created_at)}</Text>
      <Text style={styles.descText} numberOfLines={descOpen || isWide ? undefined : 3}>{video.description}</Text>
      {!isWide && video.description.length > 140 ? (
        <Text style={styles.showMore}>{descOpen ? 'Show less' : 'Show more'}</Text>
      ) : null}
    </TouchableOpacity>
  ) : (
    <Text style={[styles.meta, { paddingTop: 4 }]}>{formatViews(video.view_count)} · {timeAgo(video.created_at)}</Text>
  );

  const moreList = more.length > 0 ? (
    <View style={{ gap: 14 }}>
      <Text style={styles.mH2}>More from {org?.org_name ?? 'this organization'}</Text>
      {more.map(m => {
        const t = thumbFor(m);
        return (
          <TouchableOpacity key={m.id} style={styles.moreRow} onPress={() => openVideo(m.id)}>
            <View style={[styles.moreThumb, isWide && { width: 168 }]}>
              {t ? <Image source={{ uri: t }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={styles.moreTitle} numberOfLines={2}>{m.title}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {m.view_count ? `${formatViews(m.view_count)} · ` : ''}{timeAgo(m.created_at)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  ) : null;

  const wideMainWidth = Math.min(width, 1400) - 380 - Theme.spacing.lg * 2;
  const widePlayerWidth = Math.max(320, Math.min(wideMainWidth, Math.round(windowHeight * 0.5 * (16 / 9))));

  return (
    <DesktopShell>
      <View style={styles.screen}>
        {!isWide ? (
          <>
            {/* Phones: player pinned at the top, details scroll under it. */}
            <View style={[styles.playerWrapFixed, { paddingTop: insets.top }]}>
              <View style={styles.playerInner}>
                {playerMedia}
                <TouchableOpacity onPress={back} style={styles.playerBack} accessibilityLabel="Back" hitSlop={8}>
                  <Icon name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
              <View style={[styles.mSection, { gap: 6 }]}>
                <Text style={styles.mTitle}>{video.title}</Text>
                {hiddenNotice}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mPills}>
                <Chip icon="share-outline" label="Share" onPress={share} />
                <Chip icon="business-outline" label="Organization" onPress={openOrg} />
              </ScrollView>
              <View style={styles.mBand} />
              <View style={styles.mSection}>{orgRow}</View>
              {seedCta ? <View style={[styles.mSection, { paddingTop: 0 }]}>{seedCta}</View> : null}
              <View style={styles.mBand} />
              <View style={[styles.mSection, { gap: 10 }]}>
                <Text style={styles.mH2}>About this video</Text>
                {description}
              </View>
              {moreList ? (
                <>
                  <View style={styles.mBand} />
                  <View style={styles.mSection}>{moreList}</View>
                </>
              ) : null}
            </ScrollView>
          </>
        ) : (
          <View style={styles.wideSplit}>
            <View style={styles.wideMain}>
              <View style={styles.widePinned}>
                <TouchableOpacity onPress={back} style={styles.backRow} hitSlop={8}>
                  <Icon name="chevron-back" size={18} color={C.text2} />
                  <Text style={styles.backLabel}>Back</Text>
                </TouchableOpacity>
                <View style={{ alignItems: 'center', marginBottom: Theme.spacing.md }}>
                  <View style={[styles.widePlayer, { width: widePlayerWidth }]}>{playerMedia}</View>
                </View>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.wideMainScroll}>
                <Text style={styles.title}>{video.title}</Text>
                {hiddenNotice}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>{orgRow}</View>
                  <Button size="md" variant="secondary" icon="share-outline" label="Share" onPress={share} />
                </View>
                {seedCta ? <View style={{ marginTop: 14 }}>{seedCta}</View> : null}
                <View style={{ marginTop: 14 }}>{description}</View>
              </ScrollView>
            </View>
            <ScrollView style={styles.sidePane} contentContainerStyle={styles.sideCol}>
              {moreList ?? (
                <View style={{ gap: 10 }}>
                  <Text style={styles.mH2}>{org?.org_name ?? 'This organization'}</Text>
                  <Text style={styles.muted}>No other videos yet.</Text>
                  <Button size="md" variant="secondary" label="Visit their page" onPress={openOrg} />
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </DesktopShell>
  );
}

export default focusedOnly(OrgVideoScreen);

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    screen: { flex: 1, backgroundColor: C.bg },
    center: { alignItems: 'center', justifyContent: 'center' },

    playerWrapFixed: { backgroundColor: C.black, alignItems: 'center' },
    playerInner: { width: '100%', maxWidth: 1000, aspectRatio: 16 / 9, backgroundColor: '#000' },
    playerBack: {
      position: 'absolute', top: 10, left: 10, width: 40, height: 40, borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
    },

    wideSplit: { flex: 1, flexDirection: 'row', maxWidth: 1400, alignSelf: 'center', width: '100%' },
    wideMain: { flex: 1, minWidth: 0 },
    widePinned: { paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.lg },
    wideMainScroll: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 40 },
    widePlayer: { aspectRatio: 16 / 9, backgroundColor: C.black, borderRadius: 12, overflow: 'hidden' },
    sidePane: { width: 380, flexGrow: 0, flexShrink: 0 },
    sideCol: { padding: Theme.spacing.lg, gap: Theme.spacing.md },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: Theme.spacing.sm, alignSelf: 'flex-start', minHeight: 36 },
    backLabel: { color: C.text2, fontSize: 15 },

    mSection: { paddingHorizontal: 16, paddingVertical: 14 },
    mTitle: { color: C.text, fontSize: 19, lineHeight: 25, ...font(700), letterSpacing: -0.2 },
    title: { color: C.text, fontSize: 22, lineHeight: 28, ...font(700), letterSpacing: -0.3 },
    mPills: { gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 16 },
    mBand: { height: 8, backgroundColor: C.bg2 },
    mH2: { color: C.text, fontSize: 15, ...font(700) },

    orgRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    orgInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
    orgName: { color: C.text, fontSize: 15, ...font(700) },

    seedCard: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      backgroundColor: C.emeraldBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    },
    seedTitle: { color: C.text, fontSize: 14, ...font(700), flexShrink: 1 },

    descCard: { backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
    descText: { color: C.text, fontSize: 15, lineHeight: 22 },
    showMore: { color: C.text, fontSize: 13, ...font(700) },
    meta: { color: C.text2, fontSize: 13, ...font(600) },
    muted: { color: C.text2, fontSize: 13, lineHeight: 18, flexShrink: 1 },
    hiddenNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },

    moreRow: { flexDirection: 'row', gap: 12 },
    moreThumb: { width: 156, aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface3 },
    moreTitle: { color: C.text, fontSize: 14, lineHeight: 19, ...font(600) },
  }));
}
