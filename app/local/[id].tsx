import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Linking, Platform,
} from 'react-native';
import { directionsUrl } from '../../lib/directions';
import { ORDER_CATEGORIES, ORDER_PLATFORMS, normalizeOrderUrl, orderUrlError, orderLinksOf, openOrderLink, type OrderPlatform } from '../../lib/orderLinks';
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { ClaimNotice, UnclaimedBadge } from '../../components/ClaimNotice';
import { confirmDialog, notifyDialog } from '../../lib/dialogs';
import { shareLink, getAppBaseUrl } from '../../lib/share';
import {
  categoryLabel, initialsOf, isFeatured, placeLine, tintFor, withProtocol, type BusinessListing,
} from '../../lib/businessCategories';
import { brandStyles, font } from '../../lib/ds';

export default function LocalListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C, isDesktopWeb);

  const [loading, setLoading] = useState(true);
  const [l, setL] = useState<BusinessListing | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [orderEdit, setOrderEdit] = useState<Record<string, string> | null>(null);
  const [unread, setUnread] = useState(0);

  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const me = session?.user?.id ?? null;
    setUid(me);
    if (session?.user?.email) setReplyTo(r => r || session.user.email!);
    const [{ data }, prof] = await Promise.all([
      supabase.from('business_listings').select('*').eq('id', id).maybeSingle(),
      me ? supabase.from('profiles').select('full_name, role').eq('id', me).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setL((data as BusinessListing) ?? null);
    const p = (prof as any)?.data;
    setUserName(p?.full_name ?? '');
    setIsAdmin(['admin', 'owner', 'moderator', 'super_admin'].includes(String(p?.role ?? '').toLowerCase()));
    if (data && me && (data as any).owner_id === me) {
      const { count } = await supabase.from('business_inquiries').select('id', { count: 'exact', head: true })
        .eq('listing_id', id).is('read_at', null);
      setUnread(count ?? 0);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/local' as any);
  }

  async function send() {
    if (!l || !uid) return;
    const msg = message.trim();
    if (msg.length < 2) { setError('Write a short message first.'); return; }
    setSending(true); setError(null);
    const { error: err } = await supabase.from('business_inquiries').insert({
      listing_id: l.id, sender_id: uid, sender_name: userName || null, reply_to: replyTo.trim() || null, message: msg,
    });
    setSending(false);
    if (err) { setError(err.message); return; }
    setSent(true);
    setMessage('');
  }

  async function adminSet(patch: Partial<BusinessListing>, confirmText?: string): Promise<boolean> {
    if (!l) return false;
    if (confirmText && !(await confirmDialog('Are you sure?', confirmText))) return false;
    setAdminBusy(true);
    const { error: err } = await supabase.from('business_listings').update(patch).eq('id', l.id);
    setAdminBusy(false);
    if (err) { notifyDialog('Could not update listing', err.message); return false; }
    setL({ ...l, ...patch } as BusinessListing);
    return true;
  }

  const content = (() => {
    if (loading) return <View style={styles.center}><ActivityIndicator color={C.gold} /></View>;
    if (!l) return (
      <View style={styles.center}>
        <Text style={styles.h2}>This listing isn't available</Text>
        <Text style={styles.muted}>It may have been removed or is still a draft.</Text>
      </View>
    );

    const isOwner = Boolean(uid) && l.owner_id === uid;
    const tint = tintFor(l.id);
    const facts = [
      l.hours_text ? { label: 'Hours', value: l.hours_text } : null,
      { label: 'Where', value: [l.is_online ? 'Online' : null, l.service_area, l.address, [[l.city, l.state].filter(Boolean).join(', '), l.zip].filter(Boolean).join(' ')].filter(Boolean).join('\n') || 'Not listed' },
      l.languages?.length ? { label: 'Languages', value: l.languages.join(', ') } : null,
      l.halal_status ? { label: 'Halal', value: l.halal_status } : null,
    ].filter(Boolean) as { label: string; value: string }[];
    const tags = [
      l.women_owned ? 'Women-owned' : null, l.sisters_only ? 'Sisters-only service' : null,
      l.is_online ? 'Online' : null, l.is_home_based ? 'Home-based' : null,
    ].filter(Boolean) as string[];
    const phoneDigits = l.phone?.replace(/[^\d+]/g, '');
    const waDigits = l.whatsapp?.replace(/\D/g, '');

    const directions = directionsUrl(l);
    const orderLinks = ORDER_CATEGORIES.has(l.category) ? orderLinksOf(l) : [];
    const contactButtons = (
      <View style={styles.contactGrid}>
        {directions ? (
          <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(directions)}>
            <Icon name="navigate-outline" size={16} color={C.text} /><Text style={styles.contactText}>Directions</Text>
          </TouchableOpacity>
        ) : null}
        {phoneDigits ? (
          <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${phoneDigits}`)}>
            <Icon name="call-outline" size={16} color={C.text} /><Text style={styles.contactText}>Call</Text>
          </TouchableOpacity>
        ) : null}
        {waDigits ? (
          <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`https://wa.me/${waDigits}`)}>
            <Icon name="logo-whatsapp" size={16} color={C.text} /><Text style={styles.contactText}>WhatsApp</Text>
          </TouchableOpacity>
        ) : null}
        {l.website ? (
          <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(withProtocol(l.website!))}>
            <Icon name="globe-outline" size={16} color={C.text} /><Text style={styles.contactText}>Website</Text>
          </TouchableOpacity>
        ) : null}
        {l.booking_url ? (
          <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(withProtocol(l.booking_url!))}>
            <Icon name="calendar-outline" size={16} color={C.text} /><Text style={styles.contactText}>Book</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );

    return (
      <>
        {/* Owner / admin bars */}
        {isOwner && (
          <View style={styles.ownerBar}>
            <Text style={styles.ownerText}>
              {l.status === 'draft' ? 'This is your listing. It’s a draft, so only you can see it.' : l.status === 'hidden' ? 'This listing was hidden by Siqa moderators.' : 'This is your listing.'}
            </Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push({ pathname: '/local/inbox', params: { listing: l.id } } as any)}>
                <Text style={styles.ghostBtnText}>Messages{unread ? ` · ${unread} new` : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push({ pathname: '/local/edit', params: { id: l.id } } as any)}>
                <Text style={styles.primaryBtnText}>Edit listing</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {isAdmin && (
          <View style={[styles.ownerBar, { backgroundColor: C.goldBg, borderColor: C.goldSoft }]}>
            <Text style={styles.ownerText}>
              Admin · {isFeatured(l) ? `Featured until ${new Date(l.featured_until!).toLocaleDateString()}` : 'Not featured'} · {l.status}
            </Text>
            <View style={styles.row}>
              {isFeatured(l) ? (
                <TouchableOpacity style={styles.ghostBtn} disabled={adminBusy} onPress={() => adminSet({ featured_until: null })}>
                  <Text style={styles.ghostBtnText}>Stop featuring</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.ghostBtn} disabled={adminBusy}
                  onPress={() => adminSet({ featured_until: new Date(Date.now() + 30 * 86400000).toISOString() })}>
                  <Text style={styles.ghostBtnText}>Feature 30 days</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.ghostBtn} disabled={adminBusy}
                onPress={() => l.status === 'hidden'
                  ? adminSet({ status: 'published' })
                  : adminSet({ status: 'hidden' }, 'Hide this listing from the directory?')}>
                <Text style={[styles.ghostBtnText, l.status !== 'hidden' && { color: C.danger }]}>{l.status === 'hidden' ? 'Unhide' : 'Hide'}</Text>
              </TouchableOpacity>
              {ORDER_CATEGORIES.has(l.category) && !orderEdit && (
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setOrderEdit(Object.fromEntries(ORDER_PLATFORMS.map(p => [p.column, (l as any)[p.column] ?? ''])))}>
                  <Text style={styles.ghostBtnText}>Order links</Text>
                </TouchableOpacity>
              )}
            </View>
            {orderEdit && (
              <View style={{ gap: 8, alignSelf: 'stretch' }}>
                {ORDER_PLATFORMS.map(p => {
                  const err = orderUrlError(p.key, orderEdit[p.column] ?? '');
                  return (
                    <View key={p.key} style={{ gap: 4 }}>
                      <Text style={styles.label}>{p.label}</Text>
                      <TextInput
                        value={orderEdit[p.column] ?? ''}
                        onChangeText={t => setOrderEdit(prev => ({ ...(prev ?? {}), [p.column]: t }))}
                        placeholder={p.placeholder}
                        placeholderTextColor={C.text3}
                        autoCapitalize="none"
                        keyboardType="url"
                        style={styles.input}
                        accessibilityLabel={`${p.label} link`}
                      />
                      {err ? <Text style={styles.error}>{err}</Text> : null}
                    </View>
                  );
                })}
                <View style={styles.row}>
                  <TouchableOpacity style={styles.ghostBtn} onPress={() => setOrderEdit(null)}>
                    <Text style={styles.ghostBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    disabled={adminBusy || ORDER_PLATFORMS.some(p => orderUrlError(p.key, orderEdit[p.column] ?? ''))}
                    onPress={async () => {
                      const patch = Object.fromEntries(ORDER_PLATFORMS.map(p => [p.column, normalizeOrderUrl(orderEdit[p.column] ?? '') || null]));
                      if (await adminSet(patch as any)) setOrderEdit(null);
                    }}
                  >
                    <Text style={styles.primaryBtnText}>Save links</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Hero */}
        <View style={[styles.cover, { backgroundColor: tint }]}>
          {l.cover_url ? <Image source={{ uri: l.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        </View>
        <View style={styles.identity}>
          <View style={[styles.logo, { borderColor: C.bg }]}>
            {l.logo_url
              ? <Image source={{ uri: l.logo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <Text style={[styles.logoText, { color: tint }]}>{initialsOf(l.name)}</Text>}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text style={styles.eyebrow}>{categoryLabel(l.category)}</Text>
            <View style={styles.nameRow}>
              <Text style={styles.h1}>{l.name}</Text>
              {!l.is_claimed ? <UnclaimedBadge /> : l.is_verified ? (
                <View style={styles.verified}><Icon name="checkmark" size={13} color="#14523A" /><Text style={styles.verifiedText}>Verified business</Text></View>
              ) : null}
            </View>
            <Text style={styles.muted}>{placeLine(l)}</Text>
            {tags.length > 0 && <View style={styles.row}>{tags.map(t => <Text key={t} style={styles.tag}>{t}</Text>)}</View>}
          </View>
        </View>

        {!l.is_claimed && <ClaimNotice entityType="business" entityId={l.id} name={l.name} compact={!isDesktopWeb} />}

        <View style={styles.columns}>
          <View style={styles.mainCol}>
            {l.tagline ? <Text style={styles.lede}>{l.tagline}</Text> : null}
            {l.description ? <Text style={styles.body}>{l.description}</Text> : null}

            {l.services?.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.h2}>Services</Text>
                  <Text style={styles.small}>Prices set by the business. You arrange and pay them directly.</Text>
                </View>
                {l.services.map((s, i) => (
                  <View key={`${s.name}-${i}`} style={[styles.serviceRow, i === l.services.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.serviceName}>{s.name}</Text>
                      {s.description ? <Text style={styles.small}>{s.description}</Text> : null}
                    </View>
                    {s.price ? <Text style={styles.servicePrice}>{s.price}</Text> : null}
                  </View>
                ))}
              </View>
            )}
            {!l.services?.length && l.price_text ? <Text style={styles.body}><Text style={{ ...font(700) }}>Pricing: </Text>{l.price_text}</Text> : null}

            <View style={styles.facts}>
              {facts.map(f => (
                <View key={f.label} style={styles.fact}>
                  <Text style={styles.factLabel}>{f.label}</Text>
                  <Text style={styles.factValue}>{f.value}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => shareLink({ url: `${getAppBaseUrl()}/local/${l.id}`, title: l.name })}
              style={{ alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' }}
            >
              <Text style={styles.link}>Share this listing</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sideCol}>
            {orderLinks.length > 0 && (
              <View style={styles.contactCard}>
                <Text style={styles.contactTitle}>Order delivery</Text>
                <View style={{ gap: 8 }}>
                  {orderLinks.map(o => (
                    <TouchableOpacity
                      key={o.key}
                      style={styles.orderBtn}
                      onPress={() => openOrderLink(l.id, o.key as OrderPlatform, o.url)}
                      accessibilityLabel={o.key === 'direct' ? `Order online from ${l.name}` : `Order from ${l.name} on ${o.label}`}
                    >
                      <Icon name={o.key === 'direct' ? 'bag-handle-outline' : 'bicycle-outline'} size={17} color={C.text} />
                      <Text style={styles.contactText}>{o.key === 'direct' ? 'Order online' : `Order on ${o.label}`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.small}>Opens the ordering app. Prices and delivery are set by that service.</Text>
              </View>
            )}
            <View style={styles.contactCard}>
              <Text style={styles.contactTitle}>Contact {l.name}</Text>
              {l.is_claimed && l.status === 'published' && !isOwner ? (
                sent ? (
                  <View style={styles.sentBox}>
                    <Text style={styles.sentText}><Text style={{ ...font(800) }}>Message sent.</Text> The business will reply by email or phone{replyTo ? ` (${replyTo})` : ''}.</Text>
                    <TouchableOpacity onPress={() => setSent(false)}><Text style={styles.link}>Send another</Text></TouchableOpacity>
                  </View>
                ) : uid ? (
                  <View style={{ gap: 10 }}>
                    <Text style={styles.label}>What do you need?</Text>
                    <TextInput
                      value={message}
                      onChangeText={setMessage}
                      placeholder="Describe what you're looking for, when, and where"
                      placeholderTextColor={C.text3}
                      multiline
                      style={[styles.input, { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]}
                      accessibilityLabel="Message"
                      maxLength={2000}
                    />
                    <Text style={styles.label}>Reply to</Text>
                    <TextInput
                      value={replyTo}
                      onChangeText={setReplyTo}
                      placeholder="Email or phone"
                      placeholderTextColor={C.text3}
                      style={styles.input}
                      autoCapitalize="none"
                      accessibilityLabel="Reply to"
                    />
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    <TouchableOpacity style={[styles.primaryBtn, { minHeight: 48 }]} onPress={send} disabled={sending}>
                      {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send message</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={[styles.primaryBtn, { minHeight: 48 }]} onPress={() => router.push('/(auth)/sign-in' as any)}>
                    <Text style={styles.primaryBtnText}>Sign in to send a message</Text>
                  </TouchableOpacity>
                )
              ) : !l.is_claimed ? (
                <Text style={styles.small}>Messaging opens once the owner claims this listing. You can still call or visit their website.</Text>
              ) : null}
              {contactButtons}
              <Text style={styles.small}>You arrange everything with the business directly. Siqa doesn't handle payments for directory listings.</Text>
            </View>
          </View>
        </View>
      </>
    );
  })();

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          <View style={styles.page}>
            <TouchableOpacity onPress={back} style={styles.back} accessibilityLabel="Back to Local & services">
              <Icon name="chevron-back" size={20} color={C.text} />
              <Text style={styles.backText}>Local & services</Text>
            </TouchableOpacity>
            {content}
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create(brandStyles({
    page: { width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 18, paddingHorizontal: desktop ? 28 : 16, paddingTop: desktop ? 24 : HEADER_TOP_PADDING },
    center: { paddingVertical: 80, alignItems: 'center', gap: 8 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 40 },
    backText: { fontSize: 14, fontWeight: '600', color: C.text },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    ownerBar: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.goldSoft, backgroundColor: C.goldBg,
    },
    ownerText: { fontSize: 14, color: C.text, fontWeight: '600', flexShrink: 1 },
    cover: { height: desktop ? 240 : 160, borderRadius: desktop ? 20 : 16, overflow: 'hidden' },
    identity: { flexDirection: desktop ? 'row' : 'column', alignItems: 'flex-start', gap: desktop ? 20 : 10, marginTop: desktop ? 12 : 0, paddingHorizontal: desktop ? 20 : 4 },
    logo: {
      width: desktop ? 104 : 84, height: desktop ? 104 : 84, borderRadius: 22, borderWidth: 4, backgroundColor: C.surface,
      shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      // Only the logo overlaps the cover; the name sits below it.
      marginTop: desktop ? -70 : -52,
    },
    logoText: { fontSize: desktop ? 32 : 26, fontWeight: '800' },
    eyebrow: { fontSize: 12, fontWeight: '700', color: C.goldDim, textTransform: 'uppercase', letterSpacing: 0.6 },
    nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    h1: { fontSize: desktop ? 30 : 24, fontWeight: '700', color: C.text, letterSpacing: -0.4, flexShrink: 1 },
    h2: { fontSize: 18, fontWeight: '700', color: C.text },
    verified: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.goldBg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    verifiedText: { fontSize: 12, fontWeight: '700', color: '#14523A' },
    tag: { fontSize: 12, fontWeight: '600', color: C.text2, backgroundColor: C.surface2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
    muted: { fontSize: 14, color: C.text2 },
    small: { fontSize: 12, lineHeight: 17, color: C.text2 },
    lede: { fontSize: 18, lineHeight: 26, color: C.text, fontWeight: '500' },
    body: { fontSize: 15, lineHeight: 23, color: C.text2 },
    link: { fontSize: 14, fontWeight: '600', color: C.goldDim },
    columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' },
    mainCol: { flexGrow: 999, flexShrink: 1, flexBasis: 520, minWidth: 0, gap: 18 },
    sideCol: { flexGrow: 1, flexShrink: 1, flexBasis: 320 },
    card: { borderRadius: 18, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface, overflow: 'hidden' },
    cardHead: { padding: 16, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border2 },
    serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border2 },
    serviceName: { fontSize: 15, fontWeight: '700', color: C.text },
    servicePrice: { fontSize: 15, fontWeight: '700', color: C.text },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    fact: { flexGrow: 1, flexBasis: 200, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface, gap: 6 },
    factLabel: { fontSize: 12, fontWeight: '700', color: C.text2 },
    factValue: { fontSize: 14, lineHeight: 21, color: C.text },
    contactCard: { gap: 12, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    contactTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    label: { fontSize: 13, fontWeight: '700', color: C.text },
    input: {
      minHeight: 46, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12,
      fontSize: 15, color: C.text, backgroundColor: C.bg, ...(Platform.OS === 'web' ? { outlineColor: C.gold } as any : {}),
    },
    error: { fontSize: 13, color: C.danger },
    sentBox: { gap: 8, padding: 14, borderRadius: 12, backgroundColor: C.goldBg },
    sentText: { fontSize: 14, lineHeight: 20, color: C.text },
    contactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    orderBtn: {
      height: 46, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    contactBtn: {
      flexGrow: 1, flexBasis: 120, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    },
    contactText: { fontSize: 14, fontWeight: '600', color: C.text },
    primaryBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    ghostBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
    ghostBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  }));
}
