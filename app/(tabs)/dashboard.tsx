import {
  View,
  Text,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme } from '../../constants/theme';

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
};

type Speaker = {
  id: string;
  display_name: string;
  total_raised: number | null;
  follower_count: number | null;
  events_count: number | null;
  is_verified: boolean;
};

type VideoItem = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
};

type Donation = {
  id: string;
  amount: number;
  campaign_title: string | null;
  created_at: string;
  status: string;
};

type Organization = {
  id: string;
  org_name: string;
  is_verified: boolean | null;
  approval_status: string | null;
  stripe_onboarded: boolean | null;
};

type SeedItem = {
  id: string;
  title: string;
  goal_amount: number | null;
  raised_amount: number | null;
  donor_count: number | null;
  status: string | null;
  cause_category: string | null;
  cover_image_url?: string | null;
  image_url?: string | null;
};

function isAdminRole(role?: string | null) {
  return ['admin', 'owner', 'moderator', 'super_admin'].includes(String(role || '').toLowerCase());
}

function isOrgRole(role?: string | null) {
  return ['org', 'organization', 'nonprofit', 'masjid'].includes(String(role || '').toLowerCase());
}

function formatMoney(cents: number | null) {
  if (!cents) return '$0';
  const d = cents / 100;
  if (d >= 1000000) return '$' + (d / 1000000).toFixed(1) + 'M';
  if (d >= 1000) return '$' + (d / 1000).toFixed(0) + 'k';
  return '$' + d.toFixed(0);
}

function formatCount(n: number | null) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return n.toString();
}

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function GuestScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <Text style={styles.logo}>صِقا</Text>
        <Text style={styles.logoSub}>SIQA</Text>
      </View>
      <View style={styles.guestWrap}>
        <Text style={styles.guestArabic}>أهلاً</Text>
        <Text style={styles.guestTitle}>Join Siqa</Text>
        <Text style={styles.guestSub}>
          Follow speakers, like clips, and donate to causes.
        </Text>
        <View style={styles.perks}>
          {[
            { icon: '🎬', text: 'Save clips to watch later' },
            { icon: '💚', text: 'Donate to live fundraisers' },
            { icon: '📡', text: 'Watch exclusive live streams' },
          ].map((p, i) => (
            <View key={i} style={styles.perk}>
              <Text style={styles.perkIcon}>{p.icon}</Text>
              <Text style={styles.perkText}>{p.text}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={styles.signUpBtn}
          onPress={() => router.push('/(auth)/sign-up' as any)}
        >
          <Text style={styles.signUpBtnText}>Create Free Account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.push('/(auth)/sign-in' as any)}
        >
          <Text style={styles.signInBtnText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

export default function DashboardScreen() {
  const { mode, setMode, colors: C } = useTheme();
  const styles = makeStyles(C);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [gems, setGems] = useState<VideoItem[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [savedGems, setSavedGems] = useState<VideoItem[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgSeeds, setOrgSeeds] = useState<SeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'gems' | 'seeds' | 'saved' | 'donations'>('gems');
  const [liveFollowerCount, setLiveFollowerCount] = useState<number | null>(null);
  const [liveVideoCount, setLiveVideoCount] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [])
  );

  async function loadDashboard() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setProfile(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const uid = session.user.id;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', uid)
      .single();

    if (profileData) {
      setProfile({ ...profileData, email: session.user.email ?? null });
      setEditName(profileData.full_name ?? '');
    }

    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, org_name, is_verified, approval_status, stripe_onboarded')
      .eq('profile_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orgData) {
      setOrganization(orgData as Organization);
      let seedsRes = await supabase
        .from('fundraisers')
        .select('id, title, goal_amount, raised_amount, donor_count, status, cause_category, cover_image_url, image_url')
        .eq('org_id', orgData.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (seedsRes.error && /cover_image_url|image_url/i.test(seedsRes.error.message)) {
        seedsRes = await supabase
          .from('fundraisers')
          .select('id, title, goal_amount, raised_amount, donor_count, status, cause_category')
          .eq('org_id', orgData.id)
          .order('created_at', { ascending: false })
          .limit(8);
      }
      if (seedsRes.data) setOrgSeeds(seedsRes.data as SeedItem[]);
    } else {
      setOrganization(null);
      setOrgSeeds([]);
    }

    const { data: speakerData } = await supabase
      .from('speakers')
      .select('id, display_name, total_raised, follower_count, events_count, is_verified')
      .eq('profile_id', uid)
      .maybeSingle();

    if (speakerData) {
      setSpeaker(speakerData);

      const [gemsRes, followerRes, videoCountRes] = await Promise.all([
        supabase.from('videos')
          .select('id, title, thumbnail_url, view_count, like_count')
          .eq('speaker_id', speakerData.id)
          .eq('is_published', true)
          .order('published_at', { ascending: false })
          .limit(6),
        supabase.from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('speaker_id', speakerData.id),
        supabase.from('videos')
          .select('*', { count: 'exact', head: true })
          .eq('speaker_id', speakerData.id)
          .eq('is_published', true),
      ]);

      if (gemsRes.data) setGems(gemsRes.data);
      setLiveFollowerCount(followerRes.count);
      setLiveVideoCount(videoCountRes.count);
    }

    const { data: savedData } = await supabase
      .from('video_saves')
      .select('videos(id, title, thumbnail_url, view_count, like_count)')
      .eq('profile_id', uid)
      .order('created_at', { ascending: false })
      .limit(6);
    if (savedData) setSavedGems(savedData.map((s: any) => s.videos).filter(Boolean));

    const { data: donationsData } = await supabase
      .from('donations')
      .select('id, amount, campaign_title, created_at, status')
      .eq('donor_profile_id', uid)
      .order('created_at', { ascending: false })
      .limit(10);
    if (donationsData) setDonations(donationsData);

    setLoading(false);
    setRefreshing(false);
  }

  async function saveDisplayName() {
    if (!profile || !editName.trim() || editName.trim() === profile.full_name) return;
    setSavingName(true);
    await supabase.from('profiles').update({ full_name: editName.trim() }).eq('id', profile.id);
    setProfile(p => p ? { ...p, full_name: editName.trim() } : p);
    setSavingName(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setSpeaker(null);
    setGems([]);
    setDonations([]);
    setSavedGems([]);
    setOrganization(null);
    setOrgSeeds([]);
    setLiveFollowerCount(null);
    setLiveVideoCount(null);
    setEditName('');
    router.replace('/(auth)/sign-in');
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (!profile) return <GuestScreen />;

  const initial = (profile.full_name || 'U').charAt(0).toUpperCase();
  const role = String(profile.role || '').toLowerCase();
  const canCreateSeeds = Boolean(organization) || isOrgRole(role) || isAdminRole(role);

  async function deleteGem(id: string) {
    Alert.alert(
      'Delete Gem?',
      'This will permanently delete this video. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('videos').delete().eq('id', id);
            if (error) {
              Alert.alert('Error', 'Could not delete this Gem. Please try again.');
              return;
            }
            setGems(prev => prev.filter(g => g.id !== id));
          },
        },
      ]
    );
  }
  const tabs = speaker
    ? [
        { key: 'gems', label: 'My Gems' },
        ...(canCreateSeeds ? [{ key: 'seeds', label: 'Seeds' }] : []),
        { key: 'saved', label: 'Saved' },
        { key: 'donations', label: 'Donations' },
      ]
    : [
        ...(canCreateSeeds ? [{ key: 'seeds', label: 'Seeds' }] : []),
        { key: 'saved', label: 'Saved Gems' },
        { key: 'donations', label: 'Donations' },
      ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadDashboard(); }}
          tintColor={C.gold}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.logo}>صِقا</Text>
        <Text style={styles.logoSub}>SIQA</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{initial}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile.full_name || 'Welcome'}</Text>
          <Text style={styles.profileEmail}>{profile.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {profile.role?.toUpperCase() || 'MEMBER'}
            </Text>
          </View>
        </View>
      </View>

      {speaker && (
        <>
          <View style={styles.statsGrid}>
            {[
              { val: formatCount(liveFollowerCount), label: 'Followers' },
              { val: formatMoney(speaker.total_raised), label: 'Total Raised' },
              { val: (liveVideoCount ?? 0).toString(), label: 'Gems' },
            ].map((s, i) => (
              <View key={i} style={styles.statCard}>
                <Text style={styles.statVal}>{s.val}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.uploadGemBtn} onPress={() => router.push('/gem-upload')}>
            <Text style={styles.uploadGemBtnText}>+ Post a Gem</Text>
          </TouchableOpacity>
        </>
      )}

      {canCreateSeeds && (
        <View style={styles.orgActionsCard}>
          <View style={styles.orgActionsCopy}>
            <Text style={styles.orgActionsTitle}>{organization?.org_name || 'Organization Tools'}</Text>
            <Text style={styles.orgActionsSub}>
              {organization?.is_verified ? 'Verified nonprofit account' : 'Create drafts now. Publish after verification.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.createSeedBtn} onPress={() => router.push('/seed-create' as any)}>
            <Text style={styles.createSeedBtnText}>Create Seed</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tabs}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key as any)}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tabContent}>

        {activeTab === 'gems' && speaker && (
          gems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎬</Text>
              <Text style={styles.emptyTitle}>No gems yet</Text>
              <Text style={styles.emptySub}>Post your first clip to get started.</Text>
            </View>
          ) : (
            <View style={styles.gemsGrid}>
              {gems.map(v => (
                <TouchableOpacity
                  key={v.id}
                  style={styles.gemCard}
                  activeOpacity={0.86}
                  onPress={() => router.push({ pathname: '/(tabs)/gems', params: { videoId: v.id } } as any)}
                >
                  <View style={styles.gemThumb}>
                    {v.thumbnail_url ? (
                      <Image
                        source={{ uri: v.thumbnail_url }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : null}
                    <View style={styles.gemPlayIcon}>
                      <Text style={styles.gemPlayText}>▶</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.gemDeleteBtn}
                      onPress={(e) => { e.stopPropagation(); deleteGem(v.id); }}
                    >
                      <Text style={styles.gemDeleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.gemInfo}>
                    <Text style={styles.gemTitle} numberOfLines={2}>{v.title}</Text>
                    <View style={styles.gemMeta}>
                      <Text style={styles.gemMetaText}>▶ {formatCount(v.view_count)}</Text>
                      <Text style={styles.gemMetaText}>♡ {formatCount(v.like_count)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}
        {activeTab === 'saved' && (
          savedGems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔖</Text>
              <Text style={styles.emptyTitle}>No saved gems</Text>
              <Text style={styles.emptySub}>Tap the bookmark on any clip to save it.</Text>
            </View>
          ) : (
            <View style={styles.gemsGrid}>
              {savedGems.map(v => (
                <TouchableOpacity
                  key={v.id}
                  style={styles.gemCard}
                  activeOpacity={0.86}
                  onPress={() => router.push({ pathname: '/(tabs)/gems', params: { videoId: v.id } } as any)}
                >
                  <View style={styles.gemThumb}>
                    {v.thumbnail_url ? (
                      <Image
                        source={{ uri: v.thumbnail_url }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : null}
                    <View style={styles.gemPlayIcon}>
                      <Text style={styles.gemPlayText}>▶</Text>
                    </View>
                  </View>
                  <View style={styles.gemInfo}>
                    <Text style={styles.gemTitle} numberOfLines={2}>{v.title}</Text>
                    <Text style={styles.gemMetaText}>▶ {formatCount(v.view_count)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {activeTab === 'donations' && (
          donations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>💚</Text>
              <Text style={styles.emptyTitle}>No donations yet</Text>
              <Text style={styles.emptySub}>Your donation history will appear here.</Text>
              <TouchableOpacity
                style={styles.browseSeedsBtn}
                onPress={() => router.push('/(tabs)/seeds' as any)}
              >
                <Text style={styles.browseSeedsBtnText}>Browse Seeds</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.listWrap}>
              {donations.map(d => (
                <View key={d.id} style={styles.donationCard}>
                  <View style={styles.donationLeft}>
                    <Text style={styles.donationAmount}>{formatMoney(d.amount)}</Text>
                    <Text style={styles.donationCampaign} numberOfLines={1}>
                      {d.campaign_title || 'Donation'}
                    </Text>
                    <Text style={styles.donationTime}>{timeAgo(d.created_at)}</Text>
                  </View>
                  <View style={[
                    styles.donationStatus,
                    d.status === 'completed' && styles.donationStatusCompleted,
                  ]}>
                    <Text style={[
                      styles.donationStatusText,
                      d.status === 'completed' && styles.donationStatusTextCompleted,
                    ]}>
                      {d.status === 'completed' ? '✓ Paid' : d.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )
        )}
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsSectionLabel}>ACCOUNT</Text>

        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsRowLabel}>Display Name</Text>
            <View style={styles.settingsRowRight}>
              {savingName && <ActivityIndicator size="small" color={C.gold} style={{ marginRight: 6 }} />}
              <TextInput
                style={styles.settingsNameInput}
                value={editName}
                onChangeText={setEditName}
                onBlur={saveDisplayName}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={saveDisplayName}
                placeholderTextColor={C.text3}
              />
            </View>
          </View>

          <View style={styles.settingsDivider} />

          <View style={styles.settingsRow}>
            <Text style={styles.settingsRowLabel}>Email</Text>
            <Text style={styles.settingsRowValue} numberOfLines={1}>{profile.email}</Text>
          </View>
        </View>

        {speaker && (
          <>
            <Text style={styles.settingsSectionLabel}>SPEAKER</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={[styles.settingsRow, { borderBottomWidth: 0 }]}
                onPress={() => router.push(`/speaker/${speaker.id}` as any)}
              >
                <Text style={styles.settingsRowLabel}>My Public Profile</Text>
                <Text style={styles.settingsRowLink}>{speaker.display_name} ›</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {canCreateSeeds && (
          <>
            <Text style={styles.settingsSectionLabel}>ORGANIZATION</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/seed-create' as any)}
              >
                <Text style={styles.menuIcon}>🌱</Text>
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>Create Seed</Text>
                  <Text style={styles.menuSubLabel}>Post a donation appeal for your nonprofit or masjid</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
              {organization && (
                <TouchableOpacity
                  style={[styles.menuItem, { borderBottomWidth: 0 }]}
                  onPress={() => router.push({ pathname: '/org-profile', params: { id: organization.id } } as any)}
                >
                  <Text style={styles.menuIcon}>🏢</Text>
                  <View style={styles.menuTextWrap}>
                    <Text style={styles.menuLabel}>Organization Profile</Text>
                    <Text style={styles.menuSubLabel}>{organization.org_name}</Text>
                  </View>
                  <Text style={styles.menuArrow}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <Text style={styles.settingsSectionLabel}>APPEARANCE</Text>
        <View style={styles.settingsCard}>
          <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.settingsRowLabel}>🌙 Theme</Text>
            <View style={styles.themeSeg}>
              {(['light', 'dark', 'system'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.themeBtn, mode === m && styles.themeBtnActive]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.themeBtnText, mode === m && styles.themeBtnTextActive]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {['admin', 'owner', 'moderator', 'super_admin'].includes(String(profile.role || '').toLowerCase()) && (
          <>
            <Text style={styles.settingsSectionLabel}>ADMIN</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={[styles.menuItem, { borderBottomWidth: 0 }]}
                onPress={() => router.push('/admin' as any)}
              >
                <Text style={styles.menuIcon}>🛡️</Text>
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>Moderation Queue</Text>
                  <Text style={styles.menuSubLabel}>Approve Gems, verify speakers, review reports</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.settingsSectionLabel}>MORE</Text>
        <View style={styles.settingsCard}>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={styles.menuLabel}>Notifications</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/org-register' as any)}
          >
            <Text style={styles.menuIcon}>🏢</Text>
            <Text style={styles.menuLabel}>Register Organization</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => router.push({ pathname: '/(tabs)/discover', params: { apply: '1' } } as any)}>
            <Text style={styles.menuIcon}>🎤</Text>
            <Text style={styles.menuLabel}>Become a Speaker</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingBottom: 20 },
    header: { paddingHorizontal: Theme.spacing.xl, paddingTop: 60, paddingBottom: Theme.spacing.md },
    logo: { fontSize: 28, color: C.gold },
    logoSub: { fontSize: 9, color: C.text3, letterSpacing: 3, marginTop: -4 },

    // Guest
    guestWrap: { paddingHorizontal: Theme.spacing.xl, paddingTop: Theme.spacing.xl, alignItems: 'center' },
    guestArabic: { fontSize: 48, color: C.gold, marginBottom: 4 },
    guestTitle: { fontSize: Theme.fontSize.xxl, fontWeight: '700', color: C.text, marginBottom: Theme.spacing.sm },
    guestSub: { fontSize: Theme.fontSize.md, color: C.text2, textAlign: 'center', lineHeight: 20, marginBottom: Theme.spacing.xxl },
    perks: { width: '100%', gap: Theme.spacing.sm, marginBottom: Theme.spacing.xxl },
    perk: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      padding: Theme.spacing.md, borderWidth: 0.5, borderColor: C.border2,
    },
    perkIcon: { fontSize: 22 },
    perkText: { fontSize: Theme.fontSize.md, color: C.text2 },
    signUpBtn: {
      width: '100%', backgroundColor: C.gold, borderRadius: Theme.radius.md,
      padding: Theme.spacing.lg, alignItems: 'center', marginBottom: Theme.spacing.md,
    },
    signUpBtnText: { color: C.black, fontSize: Theme.fontSize.base, fontWeight: '700' },
    signInBtn: {
      width: '100%', borderRadius: Theme.radius.md, padding: Theme.spacing.md,
      alignItems: 'center', borderWidth: 1, borderColor: C.border2,
    },
    signInBtnText: { color: C.text2, fontSize: Theme.fontSize.base },

    // Profile
    profileCard: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.lg,
      marginHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.lg,
      backgroundColor: C.surface, borderRadius: Theme.radius.xl,
      padding: Theme.spacing.lg, borderWidth: 0.5, borderColor: C.border2,
    },
    profileAvatar: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: C.goldBg, borderWidth: 2, borderColor: C.goldDim,
      alignItems: 'center', justifyContent: 'center',
    },
    profileAvatarText: { color: C.gold, fontSize: 22, fontWeight: '700' },
    profileInfo: { flex: 1 },
    profileName: { color: C.text, fontSize: Theme.fontSize.lg, fontWeight: '600', marginBottom: 2 },
    profileEmail: { color: C.text3, fontSize: Theme.fontSize.xs, marginBottom: 5 },
    roleBadge: {
      backgroundColor: C.goldBg, borderRadius: 4, paddingHorizontal: 7,
      paddingVertical: 2, alignSelf: 'flex-start', borderWidth: 0.5, borderColor: C.goldDim,
    },
    roleBadgeText: { color: C.gold, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

    // Stats
    statsGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
      marginHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.lg,
    },
    statCard: {
      flex: 1, minWidth: '45%', backgroundColor: C.surface,
      borderRadius: Theme.radius.lg, borderWidth: 0.5, borderColor: C.border2,
      padding: Theme.spacing.md, alignItems: 'center',
    },
    statVal: { fontSize: 22, fontWeight: '600', color: C.gold },
    statLabel: { fontSize: 10, color: C.text3, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

    uploadGemBtn: {
      marginHorizontal: Theme.spacing.xl,
      marginBottom: Theme.spacing.lg,
      backgroundColor: C.gold,
      borderRadius: Theme.radius.lg,
      padding: Theme.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadGemBtnText: {
      color: C.black,
      fontWeight: '800',
      fontSize: 15,
    },

    // Organization tools
    orgActionsCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.lg,
      backgroundColor: C.surface, borderRadius: Theme.radius.xl,
      padding: Theme.spacing.lg, borderWidth: 0.5, borderColor: C.border2,
    },
    orgActionsCopy: { flex: 1 },
    orgActionsTitle: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 2 },
    orgActionsSub: { color: C.text3, fontSize: 11, lineHeight: 16 },
    createSeedBtn: { backgroundColor: C.gold, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 10 },
    createSeedBtnText: { color: C.black, fontSize: 12, fontWeight: '900' },

    // Tabs
    tabs: {
      flexDirection: 'row', marginHorizontal: Theme.spacing.xl,
      marginBottom: Theme.spacing.lg,
      borderBottomWidth: 0.5, borderBottomColor: C.border2,
    },
    tab: {
      flex: 1, paddingVertical: 10, alignItems: 'center',
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: C.gold },
    tabText: { fontSize: 12, fontWeight: '500', color: C.text3 },
    tabTextActive: { color: C.gold },

    tabContent: { paddingHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.xl },

    // Gems grid
    gemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    gemCard: {
      width: '48%', backgroundColor: C.surface,
      borderRadius: Theme.radius.lg, borderWidth: 0.5,
      borderColor: C.border2, overflow: 'hidden',
    },
    gemThumb: {
      aspectRatio: 9 / 16, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', position: 'relative',
    },
    gemPlayIcon: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(201,168,76,0.9)',
      alignItems: 'center', justifyContent: 'center',
    },
    gemPlayText: { color: '#000', fontSize: 12, marginLeft: 2 },
    gemDeleteBtn: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    gemDeleteBtnText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    gemInfo: { padding: 8 },
    gemTitle: { fontSize: 11, fontWeight: '500', color: C.text, lineHeight: 14, marginBottom: 4 },
    gemMeta: { flexDirection: 'row', gap: 8 },
    gemMetaText: { fontSize: 10, color: C.text3 },

    listWrap: { gap: Theme.spacing.md },

    acceptBtn: { flex: 1, backgroundColor: C.emerald, borderRadius: 8, padding: 8, alignItems: 'center' },
    acceptBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    declineBtn: {
      flex: 1, backgroundColor: 'transparent', borderRadius: 8,
      padding: 8, alignItems: 'center', borderWidth: 0.5, borderColor: C.border,
    },
    declineBtnText: { color: C.text2, fontSize: 12 },

    // Seeds
    seedCard: {
      backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      borderWidth: 0.5, borderColor: C.border2, padding: Theme.spacing.md,
    },
    seedTop: { flexDirection: 'row', gap: 12 },
    seedThumb: {
      width: 78, height: 96, borderRadius: 14, backgroundColor: C.surface2,
      overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    },
    seedThumbEmoji: { fontSize: 28 },
    seedInfo: { flex: 1, justifyContent: 'center' },
    seedTitle: { color: C.text, fontSize: 13, fontWeight: '800', lineHeight: 18, marginBottom: 4 },
    seedMeta: { color: C.gold, fontSize: 10, fontWeight: '800', marginBottom: 8 },
    seedProgressTrack: { height: 5, borderRadius: 999, backgroundColor: C.surface2, overflow: 'hidden', marginBottom: 6 },
    seedProgressFill: { height: '100%', borderRadius: 999, backgroundColor: C.emeraldLight },
    seedStats: { color: C.text3, fontSize: 10 },

    // Donations
    donationCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      borderWidth: 0.5, borderColor: C.border2, padding: Theme.spacing.lg,
    },
    donationLeft: { flex: 1 },
    donationAmount: { fontSize: 18, fontWeight: '700', color: C.gold, marginBottom: 2 },
    donationCampaign: { fontSize: 12, color: C.text2, marginBottom: 2 },
    donationTime: { fontSize: 11, color: C.text3 },
    donationStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: C.surface2 },
    donationStatusCompleted: { backgroundColor: 'rgba(27,107,74,0.15)' },
    donationStatusText: { fontSize: 10, fontWeight: '600', color: C.text3 },
    donationStatusTextCompleted: { color: C.emeraldLight },

    // Empty states
    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text2 },
    emptySub: { fontSize: 13, color: C.text3, textAlign: 'center' },
    browseSeedsBtn: {
      marginTop: 8, backgroundColor: C.emerald,
      borderRadius: Theme.radius.md, paddingHorizontal: 20, paddingVertical: 10,
    },
    browseSeedsBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

    // Theme toggle
    themeSeg: {
      flexDirection: 'row', backgroundColor: C.bg,
      borderRadius: 10, padding: 3, gap: 2,
      borderWidth: 0.5, borderColor: C.border,
    },
    themeBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
    themeBtnActive: { backgroundColor: C.gold },
    themeBtnText: { fontSize: 12, fontWeight: '600', color: C.text3 },
    themeBtnTextActive: { color: C.black },

    // Settings
    settingsSection: { marginHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.lg },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      padding: Theme.spacing.lg, borderBottomWidth: 0.5, borderBottomColor: C.border2,
    },
    menuIcon: { fontSize: 20 },
    menuTextWrap: { flex: 1 },
    menuLabel: { color: C.text, fontSize: Theme.fontSize.base },
    menuSubLabel: { color: C.text3, fontSize: 11, marginTop: 2 },
    menuArrow: { color: C.text3, fontSize: 20 },

    settingsSectionLabel: {
      fontSize: 10, fontWeight: '700', color: C.text3,
      letterSpacing: 1.5, textTransform: 'uppercase',
      marginHorizontal: Theme.spacing.xl,
      marginTop: Theme.spacing.lg, marginBottom: 6,
    },
    settingsCard: {
      marginHorizontal: Theme.spacing.xl,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.xl,
      borderWidth: 0.5, borderColor: C.border2,
      overflow: 'hidden',
    },
    settingsRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Theme.spacing.lg,
      paddingVertical: Theme.spacing.md,
      borderBottomWidth: 0.5, borderBottomColor: C.border2,
      minHeight: 48,
    },
    settingsRowLabel: { fontSize: Theme.fontSize.base, color: C.text2, flex: 1 },
    settingsRowRight: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
    settingsNameInput: {
      color: C.text, fontSize: Theme.fontSize.base,
      textAlign: 'right', flex: 1, paddingVertical: 0,
    },
    settingsDivider: { height: 0.5, backgroundColor: C.border2, marginHorizontal: Theme.spacing.lg },
    settingsRowValue: { fontSize: Theme.fontSize.base, color: C.text3, textAlign: 'right', flex: 1 },
    settingsRowLink: { fontSize: Theme.fontSize.base, color: C.gold, fontWeight: '500' },

    // Sign out
    signOutBtn: {
      marginHorizontal: Theme.spacing.xl, marginTop: Theme.spacing.lg,
      padding: Theme.spacing.lg, borderRadius: Theme.radius.lg,
      backgroundColor: 'rgba(232,69,69,0.08)',
      borderWidth: 0.5, borderColor: 'rgba(232,69,69,0.25)',
      alignItems: 'center',
    },
    signOutText: { color: '#e84545', fontSize: Theme.fontSize.base, fontWeight: '600' },
  });
}