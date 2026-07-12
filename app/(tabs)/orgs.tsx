import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme } from '../../constants/theme';

type Org = {
  id: string;
  org_name: string;
  org_type: string | null;
  city: string | null;
  state: string | null;
  mission: string | null;
  tagline: string | null;
  is_verified: boolean;
  trust_score: number | null;
  ein: string | null;
};

const FILTERS = ['All', '🕌 Masjid', '🤝 Nonprofit', '❤️ Charity', '🎓 School'];

function orgEmoji(type: string | null) {
  const map: Record<string, string> = {
    masjid: '🕌', nonprofit: '🤝', charity: '❤️', school: '🎓', relief: '🌍', community: '👥',
  };
  return map[type?.toLowerCase() ?? ''] ?? '🏢';
}

function trustColor(score: number | null, C: AppColors) {
  if (!score) return C.text3;
  if (score >= 90) return C.emeraldLight;
  if (score >= 75) return C.gold;
  return C.text3;
}

export default function OrgsScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [filtered, setFiltered] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [query, activeFilter, orgs]);

  async function loadOrgs() {
    const { data } = await supabase
      .from('organizations')
      .select('id, org_name, org_type, city, state, mission, tagline, is_verified, trust_score, ein')
      .eq('approval_status', 'approved')
      .order('trust_score', { ascending: false });

    if (data) {
      setOrgs(data);
      setFiltered(data);
    }
    setLoading(false);
  }

  function applyFilters() {
    let list = [...orgs];
    if (activeFilter !== 'All') {
      const type = activeFilter.split(' ').pop()!.toLowerCase();
      list = list.filter(o => o.org_type?.toLowerCase() === type);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(o =>
        o.org_name.toLowerCase().includes(q) ||
        o.city?.toLowerCase().includes(q) ||
        o.mission?.toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }

  function renderOrg({ item }: { item: Org }) {
    const initials = item.org_name.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('').toUpperCase() || item.org_name.substring(0, 2).toUpperCase();
    const location = [item.city, item.state].filter(Boolean).join(', ') || 'USA';
    const emoji = orgEmoji(item.org_type);

    return (
      <TouchableOpacity style={styles.orgCard} activeOpacity={0.8} onPress={() => router.push({ pathname: '/org-profile', params: { id: item.id } })}>
        <View style={styles.orgCardTop}>
          <View style={styles.orgAvatar}>
            <Text style={styles.orgAvatarText}>{initials}</Text>
          </View>
          <View style={styles.orgInfo}>
            <View style={styles.orgNameRow}>
              <Text style={styles.orgName} numberOfLines={1}>{item.org_name}</Text>
              {item.is_verified && (
                <Text style={styles.orgVerified}>✓</Text>
              )}
            </View>
            <Text style={styles.orgMeta}>{location}{item.ein ? ' · EIN on file' : ''}</Text>
          </View>
          <View style={styles.orgTrust}>
            <Text style={[styles.orgTrustVal, { color: trustColor(item.trust_score, C) }]}>
              {item.trust_score ?? '—'}
            </Text>
            <Text style={styles.orgTrustLabel}>Trust</Text>
          </View>
        </View>

        {item.mission || item.tagline ? (
          <Text style={styles.orgMission} numberOfLines={2}>
            {item.tagline || item.mission}
          </Text>
        ) : null}

        <View style={styles.orgFooter}>
          <View style={styles.orgBadges}>
            {item.org_type ? (
              <View style={styles.orgTypeBadge}>
                <Text style={styles.orgTypeBadgeText}>{emoji} {item.org_type}</Text>
              </View>
            ) : null}
            {item.ein ? (
              <View style={styles.org990Badge}>
                <Text style={styles.org990BadgeText}>📄 990 on file</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.orgViewLink}>View profile →</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Organizations</Text>
          <Text style={styles.subtitle}>Verified nonprofits & masjids</Text>
        </View>
        <TouchableOpacity
          style={styles.registerBtn}
          onPress={() => router.push('/org-register' as any)}
        >
          <Text style={styles.registerBtnText}>+ Register</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search organizations..."
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
        data={FILTERS}
        keyExtractor={f => f}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {filtered.length} organization{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderOrg}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏢</Text>
              <Text style={styles.emptyTitle}>No organizations yet</Text>
              <Text style={styles.emptySub}>Be the first to register your nonprofit on Siqa.</Text>
              <TouchableOpacity style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Register Organization</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Theme.spacing.xl,
      paddingTop: 60,
      paddingBottom: Theme.spacing.md,
    },
    title: { fontSize: Theme.fontSize.xxl, fontWeight: '600', color: C.text },
    subtitle: { fontSize: Theme.fontSize.xs, color: C.text3, marginTop: 2 },
    registerBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: Theme.radius.full,
      backgroundColor: C.emeraldBg,
      borderWidth: 0.5,
      borderColor: C.emerald,
    },
    registerBtnText: { fontSize: 12, color: C.emeraldLight, fontWeight: '600' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      marginHorizontal: Theme.spacing.lg,
      marginBottom: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.md,
      borderWidth: 0.5,
      borderColor: C.border2,
      gap: Theme.spacing.sm,
    },
    searchIcon: { fontSize: 16 },
    searchInput: { flex: 1, paddingVertical: Theme.spacing.md, color: C.text, fontSize: Theme.fontSize.base },
    clearBtn: { color: C.text3, fontSize: 14, padding: 4 },
    filters: {
      paddingHorizontal: Theme.spacing.lg,
      paddingBottom: Theme.spacing.md,
      gap: Theme.spacing.sm,
    },
    filterPill: {
      paddingHorizontal: Theme.spacing.md,
      paddingVertical: 6,
      height: 32,
      borderRadius: Theme.radius.full,
      backgroundColor: C.surface,
      borderWidth: 0.5,
      borderColor: C.border2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterPillActive: { backgroundColor: C.gold, borderColor: C.gold },
    filterText: { fontSize: Theme.fontSize.sm, color: C.text2, fontWeight: '500' },
    filterTextActive: { color: C.black, fontWeight: '700' },
    countRow: {
      paddingHorizontal: Theme.spacing.xl,
      paddingBottom: Theme.spacing.sm,
    },
    countText: { fontSize: Theme.fontSize.sm, color: C.text3 },
    list: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 100 },
    orgCard: {
      backgroundColor: C.surface,
      borderRadius: Theme.radius.xl,
      borderWidth: 0.5,
      borderColor: C.border2,
      padding: Theme.spacing.lg,
      marginBottom: Theme.spacing.md,
    },
    orgCardTop: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, marginBottom: Theme.spacing.md },
    orgAvatar: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: C.emerald,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    orgAvatarText: { fontSize: 15, fontWeight: '700', color: C.gold },
    orgInfo: { flex: 1, minWidth: 0 },
    orgNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    orgName: { fontSize: 14, fontWeight: '600', color: C.text, flex: 1 },
    orgVerified: { fontSize: 12, color: C.gold },
    orgMeta: { fontSize: 11, color: C.text3, marginTop: 2 },
    orgTrust: { alignItems: 'center', flexShrink: 0 },
    orgTrustVal: { fontSize: 16, fontWeight: '700' },
    orgTrustLabel: { fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
    orgMission: { fontSize: 12, color: C.text2, lineHeight: 18, marginBottom: Theme.spacing.md },
    orgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    orgBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    orgTypeBadge: {
      backgroundColor: C.emeraldBg,
      borderRadius: 100,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    orgTypeBadgeText: { fontSize: 10, color: C.emeraldLight },
    org990Badge: {
      backgroundColor: C.goldBg,
      borderRadius: 100,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    org990BadgeText: { fontSize: 10, color: C.gold },
    orgViewLink: { fontSize: 11, color: C.text3 },
    empty: { alignItems: 'center', paddingTop: 60, gap: Theme.spacing.md },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: Theme.fontSize.lg, fontWeight: '600', color: C.text2 },
    emptySub: { fontSize: Theme.fontSize.md, color: C.text3, textAlign: 'center', paddingHorizontal: Theme.spacing.xl },
    emptyBtn: {
      backgroundColor: C.emerald,
      borderRadius: Theme.radius.md,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    emptyBtnText: { color: '#fff', fontSize: Theme.fontSize.base, fontWeight: '700' },
  });
}
