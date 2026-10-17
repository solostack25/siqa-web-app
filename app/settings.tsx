import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Icon, type SiqaIconName } from '../components/Icon';

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
};

type Speaker = { id: string; display_name: string };
type Organization = { id: string; org_name: string };

function isAdminRole(role?: string | null) {
  return ['admin', 'owner', 'moderator', 'super_admin'].includes(String(role || '').toLowerCase());
}
function isOrgRole(role?: string | null) {
  return ['org', 'organization', 'nonprofit', 'masjid'].includes(String(role || '').toLowerCase());
}

// Each section collapses until tapped on mobile, matching the reference
// pattern this screen was originally built from. On desktop there's
// now a permanent sidebar "YOU" section covering navigation (My Public
// Profile, Cart, My Orders, Messages, Seller Dashboard, Admin, Sign
// Out) plus a top-bar account dropdown — so on desktop, the sections
// that remain here are only the ones that AREN'T just a link to
// somewhere the sidebar already goes (Account's editable fields,
// Appearance's theme toggle, Organization's Create Seed/Org Profile
// links, More's Notifications/Register Organization), and what's left
// renders always-expanded in a two-column grid instead of a narrow
// accordion stack — using the available width instead of floating in
// the middle of empty space.
function Section({
  icon,
  label,
  sublabel,
  open,
  onToggle,
  alwaysOpen,
  gridWidth,
  children,
}: {
  icon: SiqaIconName;
  label: string;
  sublabel?: string;
  open: boolean;
  onToggle: () => void;
  alwaysOpen?: boolean;
  gridWidth?: number;
  children: React.ReactNode;
}) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const isOpen = alwaysOpen || open;
  return (
    <View style={[styles.card, gridWidth ? { width: gridWidth, marginHorizontal: 0 } : null]}>
      <TouchableOpacity
        style={styles.sectionRow}
        onPress={alwaysOpen ? undefined : onToggle}
        activeOpacity={alwaysOpen ? 1 : 0.7}
      >
        <View style={styles.sectionIconWrap}>
          <Icon name={icon} size={18} color={C.text2} />
        </View>
        <View style={styles.sectionTextWrap}>
          <Text style={styles.sectionLabel}>{label}</Text>
          {sublabel ? <Text style={styles.sectionSublabel}>{sublabel}</Text> : null}
        </View>
        {!alwaysOpen && (
          <View style={isOpen ? styles.chevronOpen : undefined}>
            <Icon name="chevron-down" size={16} color={C.text3} />
          </View>
        )}
      </TouchableOpacity>
      {isOpen && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

export default function SettingsScreen() {
  const { mode, setMode, colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const styles = makeStyles(C);

  const [profile, setProfile] = useState<Profile | null>(null);
  // Delete account (Apple requires this in-app)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [mySeller, setMySeller] = useState<{ id: string; shop_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>('account');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
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

    const { data: speakerData } = await supabase
      .from('speakers')
      .select('id, display_name')
      .eq('profile_id', uid)
      .maybeSingle();
    if (speakerData) setSpeaker(speakerData);

    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, org_name')
      .eq('profile_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orgData) setOrganization(orgData);

    const { data: sellerData } = await supabase
      .from('marketplace_sellers')
      .select('id, shop_name')
      .eq('user_id', uid)
      .maybeSingle();
    if (sellerData) setMySeller(sellerData);

    setLoading(false);
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
    router.replace('/(auth)/sign-in');
  }

  async function confirmDeleteAccount() {
    if (deleteText.trim().toUpperCase() !== 'DELETE' || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in again to delete your account.');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't delete your account.");
      await supabase.auth.signOut().catch(() => {});
      router.replace('/(tabs)' as any);
    } catch (e: any) {
      setDeleteError(e?.message || "Couldn't delete your account.");
    } finally {
      setDeleting(false);
    }
  }

  function toggle(key: string) {
    setOpenSection(cur => (cur === key ? null : key));
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

  if (!profile) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Sign in to view settings.</Text>
        </View>
      </DesktopShell>
    );
  }

  const role = String(profile.role || '').toLowerCase();
  const canCreateSeeds = Boolean(organization) || isOrgRole(role) || isAdminRole(role);

  // Two columns on desktop, each roughly half the available width minus
  // the gap between them; capped so cards don't get absurdly wide on a
  // huge monitor, floored so this doesn't collapse to something
  // unreadable on a smaller desktop window.
  const desktopContentWidth = Math.min(windowWidth - 220, 980);
  const gridGap = Theme.spacing.md;
  const gridWidth = isDesktopWeb ? (desktopContentWidth - Theme.spacing.xl * 2 - gridGap) / 2 : undefined;

  return (
    <DesktopShell>
      <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, isDesktopWeb && { maxWidth: desktopContentWidth }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Icon name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Direct-action row, no expansion — mirrors "Switch account" in
            the reference: an action you take immediately, not a category
            to open. Desktop already has Sign Out in both the sidebar's
            YOU section and the top-bar account dropdown. */}
        {!isDesktopWeb && (
          <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut} activeOpacity={0.7}>
            <Icon name="log-out-outline" size={18} color="#e84545" />
            <Text style={styles.signOutLabel}>Sign Out</Text>
          </TouchableOpacity>
        )}

        <View style={isDesktopWeb ? styles.grid : undefined}>
          <Section
            icon="person-outline"
            label="Account"
            sublabel={profile.full_name || profile.email || undefined}
            open={openSection === 'account'}
            onToggle={() => toggle('account')}
            alwaysOpen={isDesktopWeb}
            gridWidth={gridWidth}
          >
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Display Name</Text>
              <View style={styles.rowRight}>
                {savingName && <ActivityIndicator size="small" color={C.gold} style={{ marginRight: 6 }} />}
                <TextInput
                  style={styles.nameInput}
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
            <View style={styles.divider} />
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue} numberOfLines={1}>{profile.email}</Text>
            </View>
          </Section>

          <Section
            icon="color-palette-outline"
            label="Appearance"
            sublabel={mode.charAt(0).toUpperCase() + mode.slice(1)}
            open={openSection === 'appearance'}
            onToggle={() => toggle('appearance')}
            alwaysOpen={isDesktopWeb}
            gridWidth={gridWidth}
          >
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <View style={styles.rowLabelWithIcon}>
                <Icon name="moon-outline" size={16} color={C.text2} />
                <Text style={styles.rowLabel}>Theme</Text>
              </View>
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
          </Section>

          {/* Speaker: upload videos (Post a Gem) and view the public profile.
              Shown on desktop too — it's the place speakers look for uploads. */}
          {speaker && (
            <Section
              icon="mic-outline"
              label="Speaker"
              sublabel={speaker.display_name}
              open={openSection === 'speaker'}
              onToggle={() => toggle('speaker')}
              alwaysOpen={isDesktopWeb}
              gridWidth={gridWidth}
            >
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/gem-upload' as any)}>
                <Icon name="cloud-upload-outline" size={18} color={C.gold} />
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>Post a Gem</Text>
                  <Text style={styles.menuSubLabel}>Upload a video to your channel</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuItem, { borderBottomWidth: 0 }]}
                onPress={() => router.push(`/speaker/${speaker.id}` as any)}
              >
                <Icon name="person-circle-outline" size={18} color={C.text2} />
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>My Public Profile</Text>
                  <Text style={styles.menuSubLabel}>{speaker.display_name}</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            </Section>
          )}

          {canCreateSeeds && (
            <Section
              icon="business-outline"
              label="Organization"
              sublabel={organization?.org_name}
              open={openSection === 'organization'}
              onToggle={() => toggle('organization')}
              alwaysOpen={isDesktopWeb}
              gridWidth={gridWidth}
            >
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/seed-create' as any)}>
                <Icon name="leaf-outline" size={18} color={C.text2} />
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
                  <Icon name="business-outline" size={18} color={C.text2} />
                  <View style={styles.menuTextWrap}>
                    <Text style={styles.menuLabel}>Organization Profile</Text>
                    <Text style={styles.menuSubLabel}>{organization.org_name}</Text>
                  </View>
                  <Text style={styles.menuArrow}>›</Text>
                </TouchableOpacity>
              )}
            </Section>
          )}

          {/* Marketplace section was just My Orders + Seller Dashboard
              links — both already in the sidebar's YOU section (along
              with Cart, which wasn't even here). Mobile-only now. */}
          {!isDesktopWeb && (
            <Section
              icon="bag-handle-outline"
              label="Marketplace"
              sublabel={mySeller?.shop_name}
              open={openSection === 'marketplace'}
              onToggle={() => toggle('marketplace')}
            >
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/orders' as any)}>
                <Icon name="receipt-outline" size={18} color={C.text2} />
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>My Orders</Text>
                  <Text style={styles.menuSubLabel}>Track purchases and leave reviews</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuItem, { borderBottomWidth: 0 }]}
                onPress={() => router.push((mySeller ? '/seller-dashboard' : '/sell') as any)}
              >
                <Icon name="storefront-outline" size={18} color={C.text2} />
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>{mySeller ? 'Seller Dashboard' : 'Sell on Siqa'}</Text>
                  <Text style={styles.menuSubLabel}>
                    {mySeller ? mySeller.shop_name : 'Turn your craft into a shop'}
                  </Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            </Section>
          )}

          {/* Admin section was just a link to the Moderation Queue —
              already in the sidebar's YOU section. Mobile-only now. */}
          {!isDesktopWeb && isAdminRole(role) && (
            <Section
              icon="shield-checkmark-outline"
              label="Admin"
              open={openSection === 'admin'}
              onToggle={() => toggle('admin')}
            >
              <TouchableOpacity
                style={[styles.menuItem, { borderBottomWidth: 0 }]}
                onPress={() => router.push('/admin' as any)}
              >
                <Icon name="shield-checkmark-outline" size={18} color={C.text2} />
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuLabel}>Moderation Queue</Text>
                  <Text style={styles.menuSubLabel}>Approve Gems, verify speakers, review reports</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            </Section>
          )}

          <Section
            icon="ellipsis-horizontal"
            label="More"
            open={openSection === 'more'}
            onToggle={() => toggle('more')}
            alwaysOpen={isDesktopWeb}
            gridWidth={gridWidth}
          >
            <TouchableOpacity style={styles.menuItem}>
              <Icon name="notifications-outline" size={18} color={C.text2} />
              <Text style={styles.menuLabel}>Notifications</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              onPress={() => router.push('/org-register' as any)}
            >
              <Icon name="business-outline" size={18} color={C.text2} />
              <Text style={styles.menuLabel}>Register Organization</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          </Section>
        </View>

        {/* Delete account — kept at the bottom, behind a typed confirmation. */}
        <View style={[styles.deleteCard, isDesktopWeb && { marginHorizontal: Theme.spacing.xl }]}>
          {!deleteOpen ? (
            <TouchableOpacity style={styles.deleteRow} onPress={() => { setDeleteOpen(true); setDeleteError(null); }}>
              <Icon name="trash-outline" size={18} color="#e84545" />
              <View style={{ flex: 1 }}>
                <Text style={styles.deleteTitle}>Delete account</Text>
                <Text style={styles.deleteSub}>Permanently delete your Siqa account and data</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={styles.deleteTitle}>Delete your account?</Text>
              <Text style={styles.deleteBody}>
                This permanently deletes your login and profile, along with your likes, saves, follows, comments, cart and favorites.
                {speaker ? ' Your speaker channel and its videos will be deleted too.' : ''}
                {' '}Past orders and donations are kept for the shops' and charities' records, without your name on them.
                {' '}If you have a shop, it will be closed. This can't be undone.
              </Text>
              <Text style={styles.deleteSub}>Type DELETE to confirm.</Text>
              <TextInput
                value={deleteText}
                onChangeText={setDeleteText}
                placeholder="DELETE"
                placeholderTextColor={C.text3}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
                style={styles.deleteInput}
              />
              {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={styles.deleteCancelBtn}
                  onPress={() => { setDeleteOpen(false); setDeleteText(''); setDeleteError(null); }}
                  disabled={deleting}
                >
                  <Text style={styles.deleteCancelText}>Keep my account</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteBtn, (deleteText.trim().toUpperCase() !== 'DELETE' || deleting) && { opacity: 0.45 }]}
                  onPress={confirmDeleteAccount}
                  disabled={deleteText.trim().toUpperCase() !== 'DELETE' || deleting}
                >
                  {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.deleteBtnText}>Delete account</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <Text style={styles.footer}>Siqa — Islamic media & community</Text>

        <View style={{ height: 80 }} />
      </ScrollView>
    </DesktopShell>
  );
}

const SUPABASE_URL = 'https://eixlmylbqqrfazjlgxcz.supabase.co';

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
    emptyText: { color: C.text3, fontSize: 14 },
    scroll: { paddingBottom: 20, width: '100%', alignSelf: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.spacing.md, paddingHorizontal: Theme.spacing.xl },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.xl, paddingTop: 24, paddingBottom: Theme.spacing.lg,
    },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backIcon: { color: C.text, fontSize: 22 },
    headerTitle: { fontSize: Theme.fontSize.xxl, fontWeight: '700', color: C.text },

    signOutRow: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      marginHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.lg,
      backgroundColor: C.surface, borderRadius: Theme.radius.xl,
      borderWidth: 0.5, borderColor: 'rgba(232,69,69,0.25)',
      paddingHorizontal: Theme.spacing.lg, paddingVertical: Theme.spacing.md,
    },
    deleteCard: {
      marginHorizontal: Theme.spacing.lg, marginTop: Theme.spacing.lg, padding: Theme.spacing.lg,
      borderRadius: Theme.radius.lg, borderWidth: 0.5, borderColor: 'rgba(232,69,69,0.35)', backgroundColor: C.surface,
    },
    deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    deleteTitle: { color: '#e84545', fontSize: Theme.fontSize.base, fontWeight: '700' },
    deleteSub: { color: C.text3, fontSize: 12, marginTop: 2 },
    deleteBody: { color: C.text2, fontSize: 13, lineHeight: 19 },
    deleteInput: {
      borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      color: C.text, backgroundColor: C.bg, fontSize: 15, letterSpacing: 1,
    },
    deleteError: { color: '#e84545', fontSize: 13, lineHeight: 18 },
    deleteCancelBtn: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingVertical: 11, alignItems: 'center' },
    deleteCancelText: { color: C.text, fontSize: 13, fontWeight: '700' },
    deleteBtn: { flex: 1, borderRadius: 999, backgroundColor: '#e84545', paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
    deleteBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    signOutLabel: { color: '#e84545', fontSize: Theme.fontSize.base, fontWeight: '600' },

    card: {
      marginHorizontal: Theme.spacing.xl, marginBottom: Theme.spacing.md,
      backgroundColor: C.surface, borderRadius: Theme.radius.xl,
      borderWidth: 0.5, borderColor: C.border2, overflow: 'hidden',
    },
    sectionRow: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.lg, paddingVertical: Theme.spacing.md, minHeight: 56,
    },
    sectionIconWrap: { width: 22, alignItems: 'center' },
    sectionTextWrap: { flex: 1 },
    sectionLabel: { fontSize: Theme.fontSize.base, color: C.text, fontWeight: '500' },
    sectionSublabel: { fontSize: 11, color: C.text3, marginTop: 1 },
    chevronOpen: { transform: [{ rotate: '180deg' }] },
    sectionBody: { borderTopWidth: 0.5, borderTopColor: C.border2 },

    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Theme.spacing.lg, paddingVertical: Theme.spacing.md,
      borderBottomWidth: 0.5, borderBottomColor: C.border2, minHeight: 48,
    },
    rowLabel: { fontSize: Theme.fontSize.base, color: C.text2 },
    rowLabelWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    rowRight: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
    rowValue: { fontSize: Theme.fontSize.base, color: C.text3, textAlign: 'right', flex: 1 },
    rowLink: { fontSize: Theme.fontSize.base, color: C.gold, fontWeight: '500' },
    nameInput: { color: C.text, fontSize: Theme.fontSize.base, textAlign: 'right', flex: 1, paddingVertical: 0 },
    divider: { height: 0.5, backgroundColor: C.border2, marginHorizontal: Theme.spacing.lg },

    menuItem: {
      flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md,
      padding: Theme.spacing.lg, borderBottomWidth: 0.5, borderBottomColor: C.border2,
    },
    menuIcon: { fontSize: 20 },
    menuTextWrap: { flex: 1 },
    menuLabel: { color: C.text, fontSize: Theme.fontSize.base },
    menuSubLabel: { color: C.text3, fontSize: 11, marginTop: 2 },
    menuArrow: { color: C.text3, fontSize: 20 },

    themeSeg: {
      flexDirection: 'row', backgroundColor: C.bg,
      borderRadius: 10, padding: 3, gap: 2,
      borderWidth: 0.5, borderColor: C.border,
    },
    themeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
    themeBtnActive: { backgroundColor: C.gold },
    themeBtnText: { fontSize: 12, fontWeight: '600', color: C.text3 },
    themeBtnTextActive: { color: C.black },

    footer: { textAlign: 'center', color: C.text3, fontSize: 11, marginTop: Theme.spacing.lg },
  });
}
