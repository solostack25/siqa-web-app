import { useCallback, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme } from '../constants/theme';

type QueueVideo = {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  video_url?: string | null;
  is_published: boolean | null;
  status?: string | null;
  created_at?: string | null;
  speakers?: { display_name: string | null } | null;
};

type SpeakerRow = {
  id: string;
  display_name: string | null;
  is_verified: boolean | null;
  created_at?: string | null;
};

type OrgRow = {
  id: string;
  name: string | null;
  is_verified: boolean | null;
  created_at?: string | null;
};

type ReportRow = {
  id: string;
  reason: string | null;
  status: string | null;
  created_at?: string | null;
  video_id?: string | null;
  profile_id?: string | null;
};

type SpeakerApplication = {
  id: string;
  profile_id: string;
  full_name: string;
  display_name: string;
  denomination: string | null;
  state: string | null;
  topics: string[];
  bio: string | null;
  why_siqa: string | null;
  website: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  claimed_speaker_id: string | null;
  status: string;
  created_at: string;
};

const ADMIN_ROLES = ['admin', 'owner', 'moderator', 'super_admin'];

export default function AdminScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [videos, setVideos] = useState<QueueVideo[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [applications, setApplications] = useState<SpeakerApplication[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadAdmin();
    }, []),
  );

  async function loadAdmin() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAllowed(false);
        return;
      }

      const profile = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = String((profile.data as any)?.role || '').toLowerCase();
      const canModerate = ADMIN_ROLES.includes(role);
      setAllowed(canModerate);
      if (!canModerate) return;

      const [videosRes, speakersRes, orgsRes, appsRes] = await Promise.all([
        supabase
          .from('videos')
          .select('id, title, thumbnail_url, video_url, is_published, status, created_at, speakers(display_name)')
          .or('is_published.eq.false,status.eq.pending,status.eq.submitted,status.eq.draft')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('speakers')
          .select('id, display_name, is_verified, created_at')
          .or('is_verified.eq.false,is_verified.is.null')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('speaker_applications')
          .select('id, profile_id, full_name, display_name, denomination, state, topics, bio, why_siqa, website, instagram_url, youtube_url, claimed_speaker_id, status, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('organizations')
          .select('id, name, is_verified, created_at')
          .or('is_verified.eq.false,is_verified.is.null')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (videosRes.data) setVideos(videosRes.data as any);
      if (speakersRes.data) setSpeakers(speakersRes.data as any);
      if (orgsRes.data) setOrgs(orgsRes.data as any);
      if (appsRes.data) setApplications(appsRes.data as any);

      const reportsRes = await supabase
        .from('content_reports')
        .select('id, reason, status, created_at, video_id, profile_id')
        .or('status.is.null,status.eq.open,status.eq.pending')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!reportsRes.error && reportsRes.data) setReports(reportsRes.data as any);
    } catch (error: any) {
      Alert.alert('Admin load failed', error?.message || 'Could not load moderation queues.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function approveVideo(videoId: string) {
    setBusyId(videoId);
    const result = await supabase
      .from('videos')
      .update({ is_published: true, status: 'published', published_at: new Date().toISOString() })
      .eq('id', videoId);
    setBusyId(null);
    if (result.error) return Alert.alert('Could not approve Gem', result.error.message);
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
  }

  async function rejectVideo(videoId: string) {
    Alert.alert('Reject Gem?', 'This will keep the Gem unpublished.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setBusyId(videoId);
          const result = await supabase
            .from('videos')
            .update({ is_published: false, status: 'rejected' })
            .eq('id', videoId);
          setBusyId(null);
          if (result.error) return Alert.alert('Could not reject Gem', result.error.message);
          setVideos((prev) => prev.filter((v) => v.id !== videoId));
        },
      },
    ]);
  }

  async function approveApplication(app: SpeakerApplication) {
    Alert.alert(
      'Approve Speaker?',
      `Approve ${app.display_name} as a verified speaker on Siqa?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setBusyId(app.id);
            try {
              // 1. Create or update speakers row
              let speakerId = app.claimed_speaker_id;
              if (speakerId) {
                // Claim existing seeded profile
                await supabase
                  .from('speakers')
                  .update({
                    profile_id: app.profile_id,
                    display_name: app.display_name,
                    denomination: app.denomination,
                    state: app.state,
                    topics: app.topics,
                    bio: app.bio,
                    is_verified: true,
                    approval_status: 'approved',
                  })
                  .eq('id', speakerId);
              } else {
                // Create new speaker row
                const { data: newSpeaker } = await supabase
                  .from('speakers')
                  .insert({
                    profile_id: app.profile_id,
                    display_name: app.display_name,
                    denomination: app.denomination,
                    state: app.state,
                    topics: app.topics,
                    bio: app.bio,
                    is_verified: true,
                    approval_status: 'approved',
                  })
                  .select('id')
                  .single();
                speakerId = newSpeaker?.id;
              }

              // 2. Update profile role to speaker
              await supabase
                .from('profiles')
                .update({ role: 'speaker' })
                .eq('id', app.profile_id);

              // 3. Mark application as approved
              await supabase
                .from('speaker_applications')
                .update({ status: 'approved', reviewed_at: new Date().toISOString() })
                .eq('id', app.id);

              setApplications(prev => prev.filter(a => a.id !== app.id));
              Alert.alert('✅ Approved', `${app.display_name} is now a verified speaker.`);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not approve application');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  async function rejectApplication(app: SpeakerApplication) {
    Alert.alert(
      'Reject Application?',
      `Reject ${app.display_name}'s speaker application?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setBusyId(app.id);
            await supabase
              .from('speaker_applications')
              .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
              .eq('id', app.id);
            setBusyId(null);
            setApplications(prev => prev.filter(a => a.id !== app.id));
          },
        },
      ]
    );
  }

  async function verifySpeaker(id: string) {
    setBusyId(id);
    const result = await supabase.from('speakers').update({ is_verified: true }).eq('id', id);
    setBusyId(null);
    if (result.error) return Alert.alert('Could not verify speaker', result.error.message);
    setSpeakers((prev) => prev.filter((s) => s.id !== id));
  }

  async function verifyOrg(id: string) {
    setBusyId(id);
    const result = await supabase.from('organizations').update({ is_verified: true }).eq('id', id);
    setBusyId(null);
    if (result.error) return Alert.alert('Could not verify organization', result.error.message);
    setOrgs((prev) => prev.filter((o) => o.id !== id));
  }

  async function closeReport(id: string) {
    setBusyId(id);
    const result = await supabase.from('content_reports').update({ status: 'closed' }).eq('id', id);
    setBusyId(null);
    if (result.error) return Alert.alert('Could not close report', result.error.message);
    setReports((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Admin access required</Text>
        <Text style={styles.sub}>This area is only for Siqa moderators and admins.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAdmin(); }} tintColor={C.gold} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.arabic}>صِقا</Text>
          <Text style={styles.headerTitle}>Moderation</Text>
        </View>
      </View>

      <QueueSection title="Pending Gems" count={videos.length} C={C}>
        {videos.length === 0 ? <Empty text="No Gems waiting for review." C={C} /> : videos.map((v) => (
          <View key={v.id} style={styles.queueCard}>
            <View style={styles.videoRow}>
              <View style={styles.thumb}>
                {v.thumbnail_url ? <Image source={{ uri: v.thumbnail_url }} style={StyleSheet.absoluteFill} /> : <Text style={styles.thumbText}>▶</Text>}
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={2}>{v.title || 'Untitled Gem'}</Text>
                <Text style={styles.cardMeta}>{v.speakers?.display_name || 'Unknown speaker'} · {v.status || 'pending'}</Text>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => rejectVideo(v.id)} disabled={busyId === v.id}>
                <Text style={styles.ghostBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primarySmallBtn} onPress={() => approveVideo(v.id)} disabled={busyId === v.id}>
                <Text style={styles.primarySmallText}>{busyId === v.id ? 'Saving...' : 'Approve'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </QueueSection>

      <QueueSection title="Speaker Applications" count={applications.length} C={C}>
        {applications.length === 0 ? <Empty text="No pending applications." C={C} /> : applications.map((app) => (
          <View key={app.id} style={styles.queueCard}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{app.display_name}</Text>
              <Text style={styles.cardMeta}>{app.full_name} · {[app.denomination, app.state].filter(Boolean).join(', ')}</Text>
              {app.topics?.length > 0 && <Text style={styles.cardMeta}>Topics: {app.topics.slice(0,3).join(', ')}</Text>}
              {app.claimed_speaker_id && <Text style={[styles.cardMeta, { color: C.gold }]}>Claiming existing profile</Text>}
              {app.why_siqa && <Text style={styles.cardMeta} numberOfLines={2}>{app.why_siqa}</Text>}
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => rejectApplication(app)} disabled={busyId === app.id}>
                <Text style={styles.ghostBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primarySmallBtn} onPress={() => approveApplication(app)} disabled={busyId === app.id}>
                <Text style={styles.primarySmallText}>{busyId === app.id ? 'Saving...' : 'Approve'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </QueueSection>

      <QueueSection title="Speaker Verification" count={speakers.length} C={C}>
        {speakers.length === 0 ? <Empty text="No speakers waiting for verification." C={C} /> : speakers.map((s) => (
          <SimpleRow key={s.id} title={s.display_name || 'Unnamed speaker'} sub="Speaker profile" action="Verify" busy={busyId === s.id} onPress={() => verifySpeaker(s.id)} C={C} />
        ))}
      </QueueSection>

      <QueueSection title="Organization Verification" count={orgs.length} C={C}>
        {orgs.length === 0 ? <Empty text="No organizations waiting for verification." C={C} /> : orgs.map((o) => (
          <SimpleRow key={o.id} title={o.name || 'Unnamed organization'} sub="Organization profile" action="Verify" busy={busyId === o.id} onPress={() => verifyOrg(o.id)} C={C} />
        ))}
      </QueueSection>

      <QueueSection title="Reports" count={reports.length} C={C}>
        {reports.length === 0 ? <Empty text="No open reports." C={C} /> : reports.map((r) => (
          <SimpleRow key={r.id} title={r.reason || 'Reported content'} sub={`Video: ${r.video_id || 'unknown'}`} action="Close" busy={busyId === r.id} onPress={() => closeReport(r.id)} C={C} />
        ))}
      </QueueSection>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

function QueueSection({ title, count, children, C }: { title: string; count: number; children: ReactNode; C: AppColors }) {
  const styles = makeStyles(C);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.countPill}>{count}</Text>
      </View>
      {children}
    </View>
  );
}

function Empty({ text, C }: { text: string; C: AppColors }) {
  const styles = makeStyles(C);
  return <Text style={styles.empty}>{text}</Text>;
}

function SimpleRow({ title, sub, action, busy, onPress, C }: { title: string; sub: string; action: string; busy: boolean; onPress: () => void; C: AppColors }) {
  const styles = makeStyles(C);
  return (
    <View style={styles.simpleRow}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{sub}</Text>
      </View>
      <TouchableOpacity style={styles.primarySmallBtn} onPress={onPress} disabled={busy}>
        <Text style={styles.primarySmallText}>{busy ? 'Saving...' : action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: Theme.spacing.xl, paddingTop: 58 },
    centered: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
    lockIcon: { fontSize: 42, marginBottom: 12 },
    title: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 8, textAlign: 'center' },
    sub: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
    primaryBtn: { backgroundColor: C.gold, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14 },
    primaryBtnText: { color: C.black, fontSize: 14, fontWeight: '800' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    back: { color: C.gold, fontSize: 16, fontWeight: '700' },
    arabic: { color: C.gold, fontSize: 28, textAlign: 'right' },
    headerTitle: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'right' },
    section: { marginBottom: 24 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
    countPill: { color: C.gold, borderColor: C.border, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontWeight: '800' },
    empty: { color: C.text3, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2, borderRadius: 16, padding: 18, textAlign: 'center' },
    queueCard: { backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2, borderRadius: 18, padding: 12, marginBottom: 10 },
    videoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    thumb: { width: 72, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
    thumbText: { color: C.gold, fontSize: 24 },
    cardInfo: { flex: 1 },
    cardTitle: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
    cardMeta: { color: C.text3, fontSize: 12 },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    ghostBtn: { flex: 1, borderColor: C.border, borderWidth: 0.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    ghostBtnText: { color: C.text2, fontWeight: '800' },
    primarySmallBtn: { backgroundColor: C.gold, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    primarySmallText: { color: C.black, fontWeight: '900', fontSize: 12 },
    simpleRow: { backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  });
}