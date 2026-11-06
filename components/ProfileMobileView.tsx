import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Image, Modal, Pressable,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme, type AppColors } from '../lib/theme';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { Icon, type SiqaIconName } from './Icon';
import { EndorsementInbox } from './SeedSocial';

// The phone version of the "You" screen (app/(tabs)/dashboard.tsx).
// Layout: big name + avatar, one line of stats, two soft buttons, an admin
// nudge, a row of tool icons, then tabs over an edge-to-edge 3-column grid.

export type PMVideo = { id: string; title: string; thumbnail_url: string | null; view_count: number | null };
export type PMSeed = {
  id: string; title: string; goal_amount: number | null; raised_amount: number | null;
  donor_count: number | null; status: string | null; cover_image_url?: string | null; image_url?: string | null;
};
export type PMDonation = { id: string; amount: number; campaign_title: string | null; created_at: string; status: string };

type Tab = 'gems' | 'saved' | 'seeds' | 'giving';

function money(cents: number | null | undefined) {
  const d = (cents ?? 0) / 100;
  if (d >= 1_000_000) return '$' + (d / 1_000_000).toFixed(1) + 'M';
  if (d >= 1000) return '$' + (d / 1000).toFixed(d >= 10000 ? 0 : 1) + 'k';
  return '$' + d.toFixed(0);
}
function count(n: number | null | undefined) {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K';
  return String(v);
}
function ago(ts: string) {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProfileMobileView(p: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  roleLabels: string[];
  speakerId: string | null;
  organization: { id: string; org_name: string } | null;
  canCreateSeeds: boolean;
  isAdmin: boolean;
  adminPending: number | null;
  hasBusiness: boolean;
  followers: number | null;
  gemCount: number | null;
  raisedCents: number | null;
  gems: PMVideo[];
  saved: PMVideo[];
  seeds: PMSeed[];
  donations: PMDonation[];
  refreshing: boolean;
  onRefresh: () => void;
  onChangeCover: (gemId: string) => void;
  onDeleteGem: (gemId: string) => void;
  uploadingThumbFor: string | null;
}) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 640) - 4) / 3);

  const isSpeaker = Boolean(p.speakerId);
  const tabs: { key: Tab; label: string }[] = [
    ...(isSpeaker ? [{ key: 'gems' as Tab, label: 'Gems' }] : []),
    { key: 'saved', label: 'Saved' },
    ...(p.canCreateSeeds ? [{ key: 'seeds' as Tab, label: 'Seeds' }] : []),
    { key: 'giving', label: 'Giving' },
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].key);
  const [menuFor, setMenuFor] = useState<PMVideo | null>(null);

  const tools: { label: string; icon: SiqaIconName; go: () => void }[] = [
    ...(isSpeaker ? [{ label: 'Studio', icon: 'bar-chart-outline' as SiqaIconName, go: () => router.push('/studio' as any) }] : []),
    ...(p.canCreateSeeds ? [{ label: 'New Seed', icon: 'leaf-outline' as SiqaIconName, go: () => router.push('/seed-create' as any) }] : []),
    { label: 'Business', icon: 'storefront-outline', go: () => router.push((p.hasBusiness ? '/local/inbox' : '/local/edit') as any) },
    { label: 'Orders', icon: 'bag-handle-outline', go: () => router.push('/orders' as any) },
    ...(!isSpeaker ? [{ label: 'Speak', icon: 'mic-outline' as SiqaIconName, go: () => router.push('/apply-speaker' as any) }] : []),
  ];

  const create = isSpeaker
    ? () => router.push('/gem-upload' as any)
    : p.canCreateSeeds ? () => router.push('/seed-create' as any) : null;

  const publicPage = isSpeaker
    ? () => router.push(`/speaker/${p.speakerId}` as any)
    : p.organization ? () => router.push({ pathname: '/org-profile', params: { id: p.organization!.id } } as any) : null;

  const stats = isSpeaker
    ? [[count(p.followers), 'followers'], [String(p.gemCount ?? 0), p.gemCount === 1 ? 'Gem' : 'Gems'], [money(p.raisedCents), 'raised']]
    : [[String(p.saved.length), 'saved'], [String(p.donations.length), p.donations.length === 1 ? 'gift' : 'gifts']];

  const openGem = (v: PMVideo) => router.push({ pathname: '/(tabs)/gems', params: { videoId: v.id } } as any);

  const gemTile = (v: PMVideo, own: boolean) => (
    <TouchableOpacity
      key={v.id}
      activeOpacity={0.85}
      style={[s.tile, { width: tile, height: Math.round(tile * 16 / 9) }]}
      onPress={() => openGem(v)}
      onLongPress={own ? () => setMenuFor(v) : undefined}
      accessibilityLabel={v.title}
    >
      {v.thumbnail_url ? <Image source={{ uri: v.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {own && !v.thumbnail_url ? <Text style={s.tileTag}>Add cover</Text> : null}
      {own && p.uploadingThumbFor === v.id ? (
        <View style={s.tileBusy}><ActivityIndicator color="#fff" /></View>
      ) : null}
      {own && (
        <TouchableOpacity style={s.tileMore} onPress={() => setMenuFor(v)} accessibilityLabel={`Options for ${v.title}`} hitSlop={6}>
          <Icon name="ellipsis-horizontal" size={16} color="#fff" />
        </TouchableOpacity>
      )}
      <View style={s.tileViews}>
        <Icon name="play" size={11} color="#fff" />
        <Text style={s.tileViewsText}>{count(v.view_count)}</Text>
      </View>
    </TouchableOpacity>
  );

  const empty = (title: string, sub: string, action?: { label: string; go: () => void }) => (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptySub}>{sub}</Text>
      {action && (
        <TouchableOpacity style={s.softBtn} onPress={action.go}><Text style={s.softBtnText}>{action.label}</Text></TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} tintColor={C.gold} />}
      >
        {/* Top actions */}
        <View style={s.topBar}>
          {create && (
            <TouchableOpacity style={s.iconBtn} onPress={create} accessibilityLabel={isSpeaker ? 'Post a Gem' : 'Create a Seed'}>
              <Icon name="add-circle-outline" size={26} color={C.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings' as any)} accessibilityLabel="Settings">
            <Icon name="settings-outline" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* Identity */}
        <View style={s.identity}>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text style={s.name} numberOfLines={2}>{p.name}</Text>
            {p.roleLabels.length > 0 ? (
              <View style={s.roleRow}>
                <View style={[s.dot, { backgroundColor: C.gold }]} />
                <Text style={s.roleText} numberOfLines={1}>{p.roleLabels.join(' · ')}</Text>
              </View>
            ) : p.email ? <Text style={s.roleText} numberOfLines={1}>{p.email}</Text> : null}
          </View>
          <View style={s.avatar}>
            {p.avatarUrl
              ? <Image source={{ uri: p.avatarUrl }} style={StyleSheet.absoluteFill} />
              : <Text style={s.avatarText}>{(p.name || 'U').charAt(0).toUpperCase()}</Text>}
          </View>
        </View>

        <View style={s.stats}>
          {stats.map(([v, l]) => (
            <Text key={l} style={s.stat}><Text style={s.statNum}>{v}</Text> {l}</Text>
          ))}
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity style={s.softBtnFlex} onPress={() => router.push('/settings' as any)}>
            <Text style={s.softBtnText}>Edit profile</Text>
          </TouchableOpacity>
          {publicPage && (
            <TouchableOpacity style={s.softBtnFlex} onPress={publicPage}>
              <Text style={s.softBtnText}>View public page</Text>
            </TouchableOpacity>
          )}
        </View>

        {p.isAdmin && (
          <TouchableOpacity style={s.nudge} onPress={() => router.push('/admin' as any)}>
            <View style={[s.nudgeIcon, { backgroundColor: C.gold }]}><Icon name="shield-checkmark-outline" size={18} color="#fff" /></View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={s.nudgeTitle}>
                {p.adminPending == null ? 'Admin' : p.adminPending === 0 ? 'Nothing waiting for review' : `${p.adminPending} ${p.adminPending === 1 ? 'item needs' : 'items need'} review`}
              </Text>
              <Text style={s.nudgeSub}>Gems, claims, applications and reports</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={C.goldDim} />
          </TouchableOpacity>
        )}

        <View style={s.tools}>
          {tools.map(t => (
            <TouchableOpacity key={t.label} style={s.tool} onPress={t.go} accessibilityLabel={t.label}>
              <View style={s.toolIcon}><Icon name={t.icon} size={24} color={C.text} /></View>
              <Text style={s.toolLabel} numberOfLines={1}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {p.speakerId && <EndorsementInbox speakerId={p.speakerId} style={{ marginHorizontal: 20, marginTop: 8 }} />}

        {/* Tabs */}
        <View style={s.tabs} accessibilityRole="tablist">
          {tabs.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, tab === t.key && { borderBottomColor: C.text }]}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'gems' && (
          <View style={s.grid}>
            <TouchableOpacity
              style={[s.tile, s.newTile, { width: tile, height: Math.round(tile * 16 / 9) }]}
              onPress={() => router.push('/gem-upload' as any)}
              accessibilityLabel="Post a new Gem"
            >
              <View style={s.newCircle}><Icon name="add" size={22} color={C.bg} /></View>
              <Text style={s.newText}>New Gem</Text>
            </TouchableOpacity>
            {p.gems.map(v => gemTile(v, true))}
          </View>
        )}

        {tab === 'saved' && (
          p.saved.length === 0
            ? empty('No saved Gems', 'Tap the bookmark on any Gem to keep it here.', { label: 'Browse Gems', go: () => router.push('/(tabs)/gems' as any) })
            : <View style={s.grid}>{p.saved.map(v => gemTile(v, false))}</View>
        )}

        {tab === 'seeds' && (
          p.seeds.length === 0
            ? empty('No Seeds yet', 'Seeds are fundraisers for your masjid or nonprofit.', { label: 'Create a Seed', go: () => router.push('/seed-create' as any) })
            : (
              <View style={s.list}>
                {p.seeds.map(seed => {
                  const pct = seed.goal_amount ? Math.min(1, (seed.raised_amount ?? 0) / seed.goal_amount) : 0;
                  const cover = seed.cover_image_url || seed.image_url;
                  return (
                    <TouchableOpacity key={seed.id} style={s.row} onPress={() => router.push({ pathname: '/seed/[id]', params: { id: seed.id } } as any)}>
                      <View style={s.seedThumb}>
                        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : <Icon name="leaf-outline" size={22} color={C.goldDim} />}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{seed.title}</Text>
                        <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(pct * 100)}%` }]} /></View>
                        <Text style={s.rowMeta}>
                          {money(seed.raised_amount)} of {money(seed.goal_amount)} · {seed.donor_count ?? 0} donors
                          {seed.status && seed.status !== 'active' ? ` · ${seed.status}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
        )}

        {tab === 'giving' && (
          p.donations.length === 0
            ? empty('No donations yet', 'Gifts you make to Seeds show up here.', { label: 'Find a Seed', go: () => router.push('/(tabs)/seeds' as any) })
            : (
              <View style={s.list}>
                {p.donations.map(d => (
                  <View key={d.id} style={s.row}>
                    <View style={[s.seedThumb, { backgroundColor: C.goldBg }]}><Icon name="heart-outline" size={20} color={C.goldDim} /></View>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{d.campaign_title || 'Donation'}</Text>
                      <Text style={s.rowMeta}>{ago(d.created_at)}{d.status !== 'completed' ? ` · ${d.status}` : ''}</Text>
                    </View>
                    <Text style={s.amount}>{money(d.amount)}</Text>
                  </View>
                ))}
              </View>
            )
        )}
      </ScrollView>

      {/* Gem options */}
      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setMenuFor(null)} accessibilityLabel="Close">
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle} numberOfLines={1}>{menuFor?.title}</Text>
            <TouchableOpacity style={s.sheetRow} onPress={() => { const v = menuFor!; setMenuFor(null); openGem(v); }}>
              <Icon name="play-outline" size={20} color={C.text} /><Text style={s.sheetText}>Watch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => { const v = menuFor!; setMenuFor(null); p.onChangeCover(v.id); }}>
              <Icon name="image-outline" size={20} color={C.text} /><Text style={s.sheetText}>{menuFor?.thumbnail_url ? 'Change cover' : 'Add cover'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => { const v = menuFor!; setMenuFor(null); p.onDeleteGem(v.id); }}>
              <Icon name="trash-outline" size={20} color={C.danger} /><Text style={[s.sheetText, { color: C.danger }]}>Delete Gem</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sheetRow, { justifyContent: 'center' }]} onPress={() => setMenuFor(null)}>
              <Text style={[s.sheetText, { fontWeight: '600' }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: HEADER_TOP_PADDING - 10, paddingHorizontal: 10 },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 2 },
    name: { color: C.text, fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
    roleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    roleText: { color: C.text2, fontSize: 13 },
    avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarText: { color: C.goldDim, fontSize: 30, fontWeight: '700' },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingHorizontal: 20, paddingTop: 16 },
    stat: { color: C.text2, fontSize: 14 },
    statNum: { color: C.text, fontWeight: '700' },
    btnRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 16 },
    softBtnFlex: { flex: 1, height: 40, borderRadius: 12, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
    softBtn: { height: 40, paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    softBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
    nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 16, padding: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.goldBg },
    nudgeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    nudgeTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
    nudgeSub: { color: C.goldDim, fontSize: 12 },
    tools: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 20, paddingBottom: 4 },
    tool: { flex: 1, alignItems: 'center', gap: 8 },
    toolIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
    toolLabel: { color: C.text, fontSize: 12, fontWeight: '500' },
    tabs: { flexDirection: 'row', marginTop: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    tab: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabText: { color: C.text3, fontSize: 14, fontWeight: '500' },
    tabTextOn: { color: C.text, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingTop: 2 },
    tile: { backgroundColor: '#3E3C38', overflow: 'hidden' },
    newTile: { backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center', gap: 8 },
    newCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
    newText: { color: C.text, fontSize: 13, fontWeight: '600' },
    tileTag: { position: 'absolute', top: 8, left: 8, color: '#fff', fontSize: 10, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
    tileMore: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    tileBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
    tileViews: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    tileViewsText: { color: '#fff', fontSize: 12, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
    empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 6 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    emptySub: { color: C.text2, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    list: { paddingHorizontal: 20, paddingTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    seedThumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    rowTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
    rowMeta: { color: C.text2, fontSize: 13 },
    bar: { height: 4, borderRadius: 2, backgroundColor: C.bg2, overflow: 'hidden' },
    barFill: { height: 4, borderRadius: 2, backgroundColor: C.emerald },
    amount: { color: C.text, fontSize: 15, fontWeight: '700' },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 30, gap: 2 },
    sheetTitle: { color: C.text2, fontSize: 13, paddingBottom: 6 },
    sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 },
    sheetText: { color: C.text, fontSize: 16 },
  });
}
