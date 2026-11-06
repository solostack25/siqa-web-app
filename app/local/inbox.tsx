import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { categoryLabel, isFeatured } from '../../lib/businessCategories';

type MyListing = { id: string; name: string; category: string; status: string; featured_until: string | null };
type Inquiry = { id: string; listing_id: string; sender_name: string | null; reply_to: string | null; message: string; read_at: string | null; created_at: string };

/** Business owner's listings and the messages people sent them. */
export default function LocalInboxScreen() {
  const { listing: initial } = useLocalSearchParams<{ listing?: string }>();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C, isDesktopWeb);

  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [listings, setListings] = useState<MyListing[]>([]);
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSignedIn(false); setLoading(false); return; }
    const { data } = await supabase.from('business_listings')
      .select('id, name, category, status, featured_until')
      .eq('owner_id', session.user.id).order('created_at', { ascending: true });
    const mine = (data as MyListing[]) ?? [];
    setListings(mine);
    const sel = selected && mine.some(m => m.id === selected) ? selected : mine[0]?.id ?? null;
    setSelected(sel);
    if (mine.length) {
      const { data: inq } = await supabase.from('business_inquiries')
        .select('id, listing_id, sender_name, reply_to, message, read_at, created_at')
        .in('listing_id', mine.map(m => m.id))
        .order('created_at', { ascending: false })
        .limit(500);
      setInquiries((inq as Inquiry[]) ?? []);
    }
    setLoading(false);
  }, [selected]);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function markRead(q: Inquiry) {
    if (q.read_at) return;
    const now = new Date().toISOString();
    setInquiries(prev => prev.map(x => (x.id === q.id ? { ...x, read_at: now } : x)));
    await supabase.from('business_inquiries').update({ read_at: now }).eq('id', q.id);
  }

  function reply(q: Inquiry) {
    markRead(q);
    const to = q.reply_to?.trim();
    if (!to) return;
    if (to.includes('@')) {
      const l = listings.find(x => x.id === q.listing_id);
      Linking.openURL(`mailto:${to}?subject=${encodeURIComponent(`Re: your message to ${l?.name ?? 'us'} on Siqa`)}`);
    } else {
      Linking.openURL(`tel:${to.replace(/[^\d+]/g, '')}`);
    }
  }

  const shown = inquiries.filter(q => q.listing_id === selected);
  const unreadBy = (id: string) => inquiries.filter(q => q.listing_id === id && !q.read_at).length;
  const current = listings.find(l => l.id === selected);

  const body = (() => {
    if (loading) return <View style={styles.center}><ActivityIndicator color={C.gold} /></View>;
    if (!signedIn) return (
      <View style={styles.card}>
        <Text style={styles.h2}>Sign in to see your listings</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(auth)/sign-in' as any)}><Text style={styles.primaryBtnText}>Sign in</Text></TouchableOpacity>
      </View>
    );
    if (!listings.length) return (
      <View style={styles.card}>
        <Text style={styles.h2}>You haven't listed a business yet</Text>
        <Text style={styles.small}>People can message you on Siqa, call you, or visit your website.</Text>
        <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'flex-start' }]} onPress={() => router.push('/local/edit' as any)}>
          <Text style={styles.primaryBtnText}>List your business</Text>
        </TouchableOpacity>
      </View>
    );
    return (
      <>
        {listings.length > 1 && (
          <View style={styles.row}>
            {listings.map(l => {
              const n = unreadBy(l.id);
              return (
                <TouchableOpacity key={l.id} style={[styles.chip, selected === l.id && styles.chipOn]} onPress={() => setSelected(l.id)}>
                  <Text style={[styles.chipText, selected === l.id && styles.chipTextOn]}>{l.name}{n ? ` · ${n}` : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {current && (
          <View style={styles.listingBar}>
            <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
              <Text style={styles.listingName}>{current.name}</Text>
              <Text style={styles.small}>
                {categoryLabel(current.category)} · {current.status === 'published' ? 'Live in the directory' : current.status === 'draft' ? 'Draft (only you can see it)' : 'Hidden by Siqa'}
                {isFeatured(current) ? ` · Featured until ${new Date(current.featured_until!).toLocaleDateString()}` : ''}
              </Text>
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push(`/local/${current.id}` as any)}><Text style={styles.ghostBtnText}>View</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push({ pathname: '/local/edit', params: { id: current.id } } as any)}><Text style={styles.primaryBtnText}>Edit</Text></TouchableOpacity>
            </View>
          </View>
        )}
        <Text style={styles.h2}>Messages</Text>
        {shown.length === 0 ? (
          <View style={styles.card}><Text style={styles.small}>No messages yet. When someone contacts you from your listing, it shows up here and in your notifications.</Text></View>
        ) : shown.map(q => (
          <View key={q.id} style={[styles.msg, !q.read_at && styles.msgUnread]}>
            <View style={styles.msgHead}>
              <Text style={styles.msgFrom}>{q.sender_name || 'A Siqa member'}</Text>
              <Text style={styles.small}>{new Date(q.created_at).toLocaleString()}</Text>
            </View>
            <Text style={styles.msgBody} selectable>{q.message}</Text>
            <View style={styles.row}>
              {q.reply_to ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => reply(q)}>
                  <Icon name={q.reply_to.includes('@') ? 'mail-outline' : 'call-outline'} size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Reply to {q.reply_to}</Text>
                </TouchableOpacity>
              ) : <Text style={styles.small}>No reply contact given.</Text>}
              {!q.read_at && (
                <TouchableOpacity style={styles.ghostBtn} onPress={() => markRead(q)}><Text style={styles.ghostBtnText}>Mark as read</Text></TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </>
    );
  })();

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 64 }}>
          <View style={styles.page}>
            <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/local' as any))} style={styles.back}>
              <Icon name="chevron-back" size={20} color={C.text} />
              <Text style={styles.backText}>Local & services</Text>
            </TouchableOpacity>
            <Text style={styles.h1}>Your business listing{listings.length > 1 ? 's' : ''}</Text>
            {body}
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create({
    page: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 16, paddingHorizontal: desktop ? 24 : 16, paddingTop: desktop ? 24 : HEADER_TOP_PADDING },
    center: { paddingVertical: 60, alignItems: 'center' },
    back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 40 },
    backText: { fontSize: 14, fontWeight: '600', color: C.text },
    h1: { fontSize: desktop ? 28 : 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
    h2: { fontSize: 18, fontWeight: '700', color: C.text },
    small: { fontSize: 13, lineHeight: 18, color: C.text2 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    card: { gap: 12, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
    chipOn: { backgroundColor: C.text, borderColor: C.text },
    chipText: { fontSize: 13, color: C.text },
    chipTextOn: { color: C.bg, fontWeight: '700' },
    listingBar: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16,
      borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface,
    },
    listingName: { fontSize: 16, fontWeight: '700', color: C.text },
    msg: { gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    msgUnread: { borderColor: C.gold, backgroundColor: C.goldBg },
    msgHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
    msgFrom: { fontSize: 15, fontWeight: '700', color: C.text },
    msgBody: { fontSize: 15, lineHeight: 22, color: C.text },
    primaryBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    ghostBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
    ghostBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  });
}
