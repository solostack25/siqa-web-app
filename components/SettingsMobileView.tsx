import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme, type AppColors } from '../lib/theme';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { Icon, type SiqaIconName } from './Icon';
import { LocationPicker } from './LocationPicker';
import type { SavedLocation } from '../lib/location';
import { IS_MARKETPLACE_SITE } from '../lib/site';

// Phone layout for app/settings.tsx: big title, search, account row, theme
// preview tiles, then borderless groups of rows with soft icon tiles.

type Row = {
  key: string;
  label: string;
  icon: SiqaIconName;
  tone: 'gold' | 'sea' | 'rose' | 'ink';
  value?: string;
  badge?: number | null;
  onPress: () => void;
};

const TONES = {
  gold: { light: ['#F7F1E4', '#7E6330'], dark: ['rgba(196,162,102,0.16)', '#D9BE86'] },
  sea: { light: ['#E6EFF0', '#2F5E63'], dark: ['rgba(110,170,176,0.16)', '#9FCCD1'] },
  rose: { light: ['#F6E9E6', '#8A3F2E'], dark: ['rgba(217,117,95,0.16)', '#E9A797'] },
  ink: { light: ['#EFEFEC', '#2B2B2B'], dark: ['rgba(255,255,255,0.08)', '#E8E8E8'] },
} as const;

export function SettingsMobileView(p: {
  name: string;
  email: string | null;
  avatarUrl?: string | null;
  isSpeaker: boolean;
  speakerId: string | null;
  organization: { id: string; org_name: string } | null;
  canCreateSeeds: boolean;
  isAdmin: boolean;
  seller: { id: string; shop_name: string } | null;
  hasBusiness: boolean;
  savedLoc: SavedLocation | null;
  onLocationChange: (l: SavedLocation) => void;
  editName: string;
  setEditName: (v: string) => void;
  savingName: boolean;
  onSaveName: () => void;
  onSignOut: () => void;
  deleteOpen: boolean;
  setDeleteOpen: (v: boolean) => void;
  deleteText: string;
  setDeleteText: (v: string) => void;
  deleting: boolean;
  deleteError: string | null;
  onConfirmDelete: () => void;
}) {
  const { mode, setMode, colors: C, isDark } = useTheme();
  const s = makeStyles(C);
  const [query, setQuery] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  const tone = (t: Row['tone']) => (isDark ? TONES[t].dark : TONES[t].light);
  const locLabel = p.savedLoc && p.savedLoc.mode !== 'anywhere'
    ? `${p.savedLoc.label}${p.savedLoc.radius ? ` · ${p.savedLoc.radius} mi` : ''}`
    : 'Anywhere';

  const groups = useMemo(() => {
    const g: { title: string; rows: Row[] }[] = [];
    const creator: Row[] = [];
    if (!IS_MARKETPLACE_SITE) {
      if (p.isSpeaker) {
        creator.push({ key: 'studio', label: 'Speaker Studio', icon: 'bar-chart-outline', tone: 'gold', onPress: () => router.push('/studio' as any) });
        creator.push({ key: 'public', label: 'Public profile', icon: 'person-outline', tone: 'gold', onPress: () => router.push(`/speaker/${p.speakerId}` as any) });
      }
      if (p.organization) {
        creator.push({ key: 'org', label: 'Organization', icon: 'business-outline', tone: 'gold', value: p.organization.org_name,
          onPress: () => router.push({ pathname: '/org-profile', params: { id: p.organization!.id } } as any) });
      }
      if (p.canCreateSeeds) {
        creator.push({ key: 'seed', label: 'Create a Seed', icon: 'leaf-outline', tone: 'gold', onPress: () => router.push('/seed-create' as any) });
      }
    }
    creator.push({ key: 'biz', label: p.hasBusiness ? 'Business listing' : 'List your business', icon: 'storefront-outline', tone: 'gold',
      onPress: () => router.push((p.hasBusiness ? '/local/inbox' : '/local/edit') as any) });
    g.push({ title: p.isSpeaker || p.organization ? 'Creator' : 'Your listings', rows: creator });

    g.push({ title: 'Shopping', rows: [
      { key: 'orders', label: 'My orders', icon: 'bag-handle-outline', tone: 'rose', onPress: () => router.push('/orders' as any) },
      p.seller
        ? { key: 'seller', label: 'Seller dashboard', icon: 'pricetag-outline', tone: 'rose', value: p.seller.shop_name, onPress: () => router.push('/seller-dashboard' as any) }
        : { key: 'sell', label: 'Sell on Siqa', icon: 'pricetag-outline', tone: 'rose', onPress: () => router.push('/sell' as any) },
    ]});

    if (p.isAdmin) {
      g.push({ title: 'Admin', rows: [
        { key: 'admin', label: 'Moderation & claims', icon: 'shield-checkmark-outline', tone: 'ink', onPress: () => router.push('/admin' as any) },
      ]});
    }

    const more: Row[] = [];
    if (!IS_MARKETPLACE_SITE && !p.isSpeaker) more.push({ key: 'speak', label: 'Become a speaker', icon: 'mic-outline', tone: 'ink', onPress: () => router.push('/apply-speaker' as any) });
    if (!IS_MARKETPLACE_SITE && !p.organization) more.push({ key: 'orgreg', label: 'Register an organization', icon: 'add-circle-outline', tone: 'ink', onPress: () => router.push('/org-register' as any) });
    if (more.length) g.push({ title: 'Do more on Siqa', rows: more });
    return g;
  }, [p.isSpeaker, p.speakerId, p.organization, p.canCreateSeeds, p.hasBusiness, p.seller, p.isAdmin]);

  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);
  const showAccount = match('account name email profile');
  const showTheme = match('appearance theme dark light');
  const showLoc = match('location near local');

  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <TouchableOpacity
        style={s.back}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/dashboard' as any))}
        accessibilityLabel="Back"
      >
        <Icon name="chevron-back" size={26} color={C.text} />
      </TouchableOpacity>

      <Text style={s.title} accessibilityRole="header">Settings</Text>

      <View style={s.search}>
        <Icon name="search" size={18} color={C.text3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search settings"
          placeholderTextColor={C.text3}
          style={s.searchInput}
          accessibilityLabel="Search settings"
          autoCorrect={false}
        />
      </View>

      {showAccount && (
        <View>
          <TouchableOpacity style={s.account} onPress={() => setAccountOpen(o => !o)} accessibilityState={{ expanded: accountOpen }}>
            <View style={s.avatar}><Text style={s.avatarText}>{(p.name || 'U').charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={s.accountName} numberOfLines={1}>{p.name}</Text>
              <Text style={s.accountSub} numberOfLines={1}>Name and email</Text>
            </View>
            <Icon name={accountOpen ? 'chevron-up' : 'chevron-forward'} size={18} color={C.text3} />
          </TouchableOpacity>
          {accountOpen && (
            <View style={s.panel}>
              <Text style={s.fieldLabel}>Display name</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={p.editName}
                  onChangeText={p.setEditName}
                  style={[s.input, { flex: 1 }]}
                  placeholder="Your name"
                  placeholderTextColor={C.text3}
                  accessibilityLabel="Display name"
                  maxLength={80}
                />
                <TouchableOpacity
                  style={[s.saveBtn, (!p.editName.trim() || p.editName.trim() === p.name) && { opacity: 0.4 }]}
                  onPress={p.onSaveName}
                  disabled={p.savingName || !p.editName.trim() || p.editName.trim() === p.name}
                >
                  {p.savingName ? <ActivityIndicator color={C.bg} size="small" /> : <Text style={s.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
              <Text style={s.fieldLabel}>Email</Text>
              <Text style={s.readonly}>{p.email}</Text>
            </View>
          )}
        </View>
      )}

      {showTheme && (
        <View style={{ gap: 12 }}>
          <Text style={s.groupTitle}>Appearance</Text>
          <View style={s.themes} accessibilityRole="radiogroup">
            {([['light', 'Light'], ['dark', 'Dark'], ['system', 'Match phone']] as const).map(([m, label]) => {
              const on = mode === m;
              return (
                <TouchableOpacity key={m} style={s.themeOpt} onPress={() => setMode(m)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}>
                  <View style={[s.preview, on ? { borderColor: C.text, borderWidth: 2 } : null]}>
                    {m === 'system' ? (
                      <View style={{ flex: 1, flexDirection: 'row' }}>
                        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
                        <View style={{ flex: 1, backgroundColor: '#141414' }} />
                      </View>
                    ) : (
                      <View style={{ flex: 1, padding: 10, gap: 5, backgroundColor: m === 'dark' ? '#141414' : '#FFFFFF' }}>
                        <View style={{ width: '60%', height: 6, borderRadius: 3, backgroundColor: m === 'dark' ? '#F2F2F0' : '#111111' }} />
                        <View style={{ width: '85%', height: 4, borderRadius: 2, backgroundColor: m === 'dark' ? '#3A3A3A' : '#E4E4E1' }} />
                        <View style={{ width: '70%', height: 4, borderRadius: 2, backgroundColor: m === 'dark' ? '#3A3A3A' : '#E4E4E1' }} />
                        <View style={{ width: 30, height: 10, borderRadius: 5, backgroundColor: C.gold, marginTop: 'auto' }} />
                      </View>
                    )}
                  </View>
                  <Text style={[s.themeLabel, on && { color: C.text, fontWeight: '600' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {showLoc && (
        <View style={{ gap: 4 }}>
          <Text style={s.groupTitle}>Preferences</Text>
          <TouchableOpacity style={s.row} onPress={() => setLocOpen(o => !o)} accessibilityState={{ expanded: locOpen }}>
            <View style={[s.rowIcon, { backgroundColor: tone('sea')[0] }]}><Icon name="location-outline" size={19} color={tone('sea')[1]} /></View>
            <Text style={s.rowLabel}>Location</Text>
            <Text style={s.rowValue} numberOfLines={1}>{locLabel}</Text>
            <Icon name={locOpen ? 'chevron-up' : 'chevron-forward'} size={16} color={C.text3} />
          </TouchableOpacity>
          {locOpen && (
            <View style={[s.panel, { marginTop: 4 }]}>
              <Text style={s.help}>Used to show businesses and services near you in Shop › Local & services.</Text>
              <LocationPicker value={p.savedLoc} onChange={p.onLocationChange} inline />
            </View>
          )}
        </View>
      )}

      {groups.map(g => {
        const rows = g.rows.filter(r => match(r.label) || match(g.title));
        if (!rows.length) return null;
        return (
          <View key={g.title} style={{ gap: 4 }}>
            <Text style={s.groupTitle}>{g.title}</Text>
            {rows.map(r => (
              <TouchableOpacity key={r.key} style={s.row} onPress={r.onPress} accessibilityLabel={r.value ? `${r.label}, ${r.value}` : r.label}>
                <View style={[s.rowIcon, { backgroundColor: tone(r.tone)[0] }]}><Icon name={r.icon} size={19} color={tone(r.tone)[1]} /></View>
                <Text style={s.rowLabel} numberOfLines={1}>{r.label}</Text>
                {r.value ? <Text style={s.rowValue} numberOfLines={1}>{r.value}</Text> : null}
                <Icon name="chevron-forward" size={16} color={C.text3} />
              </TouchableOpacity>
            ))}
          </View>
        );
      })}

      {!q && (
        <View style={s.footer}>
          <TouchableOpacity style={s.footBtn} onPress={p.onSignOut}>
            <Text style={s.footText}>Sign out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.footBtn} onPress={() => p.setDeleteOpen(!p.deleteOpen)} accessibilityState={{ expanded: p.deleteOpen }}>
            <Text style={[s.footText, { color: C.danger }]}>Delete account</Text>
          </TouchableOpacity>
          {p.deleteOpen && (
            <View style={[s.panel, { gap: 10 }]}>
              <Text style={s.help}>
                This permanently deletes your Siqa account and data. Type DELETE to confirm.
              </Text>
              <TextInput
                value={p.deleteText}
                onChangeText={p.setDeleteText}
                placeholder="DELETE"
                placeholderTextColor={C.text3}
                autoCapitalize="characters"
                style={s.input}
                accessibilityLabel="Type DELETE to confirm"
              />
              {p.deleteError ? <Text style={{ color: C.danger, fontSize: 13 }}>{p.deleteError}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.saveBtn, { flex: 1, backgroundColor: C.bg2 }]} onPress={() => p.setDeleteOpen(false)}>
                  <Text style={[s.saveText, { color: C.text }]}>Keep my account</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, { flex: 1, backgroundColor: C.danger }, p.deleteText.trim().toUpperCase() !== 'DELETE' && { opacity: 0.4 }]}
                  onPress={p.onConfirmDelete}
                  disabled={p.deleting || p.deleteText.trim().toUpperCase() !== 'DELETE'}
                >
                  {p.deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[s.saveText, { color: '#fff' }]}>Delete account</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
          {version ? <Text style={s.version}>Siqa {version}{Platform.OS === 'web' ? ' · web' : ''}</Text> : null}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    page: { paddingHorizontal: 20, paddingTop: HEADER_TOP_PADDING - 12, paddingBottom: 48, gap: 26 },
    back: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center', marginBottom: -18 },
    title: { color: C.text, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 12, backgroundColor: C.bg2, paddingHorizontal: 14, marginTop: -12 },
    searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}) },
    account: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: C.goldDim, fontSize: 22, fontWeight: '700' },
    accountName: { color: C.text, fontSize: 17, fontWeight: '600' },
    accountSub: { color: C.text2, fontSize: 13 },
    panel: { backgroundColor: C.bg2, borderRadius: 16, padding: 14, gap: 8, marginTop: 12 },
    fieldLabel: { color: C.text2, fontSize: 12, fontWeight: '600' },
    input: { height: 44, borderRadius: 10, backgroundColor: C.bg, color: C.text, fontSize: 15, paddingHorizontal: 12, ...(Platform.OS === 'web' ? { outlineColor: C.gold } as any : {}) },
    readonly: { color: C.text, fontSize: 15, paddingVertical: 4 },
    saveBtn: { height: 44, minWidth: 72, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
    saveText: { color: C.bg, fontSize: 14, fontWeight: '700' },
    help: { color: C.text2, fontSize: 13, lineHeight: 18 },
    groupTitle: { color: C.text2, fontSize: 13, fontWeight: '600', marginBottom: 4 },
    themes: { flexDirection: 'row', gap: 10 },
    themeOpt: { flex: 1, alignItems: 'center', gap: 8 },
    preview: { width: '100%', height: 92, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    themeLabel: { color: C.text2, fontSize: 13 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 },
    rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, color: C.text, fontSize: 16, fontWeight: '500' },
    rowValue: { color: C.text3, fontSize: 14, maxWidth: 150 },
    footer: { gap: 2, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    footBtn: { minHeight: 48, justifyContent: 'center' },
    footText: { color: C.text, fontSize: 16, fontWeight: '500' },
    version: { color: C.text3, fontSize: 12, paddingTop: 8 },
  });
}
