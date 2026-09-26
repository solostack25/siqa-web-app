import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';

type ThreadRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  updated_at: string;
  marketplace_products: { id: string; title: string; images: string[] | null } | null;
  marketplace_sellers: { id: string; shop_name: string; user_id: string } | null;
};

type ThreadListItem = ThreadRow & {
  lastMessage: string | null;
  lastMessageAt: string | null;
  iAmSeller: boolean;
};

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function MessagesInboxScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setSignedIn(false);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    const userId = session.user.id;

    const { data: mySeller } = await supabase
      .from('marketplace_sellers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    // Threads where I'm the buyer, OR — if I sell — threads where I'm
    // the seller. RLS already scopes this to my own threads either way;
    // this just also covers the seller side when it applies to me.
    let query = supabase
      .from('marketplace_threads')
      .select('id, buyer_id, seller_id, updated_at, marketplace_products(id, title, images), marketplace_sellers(id, shop_name, user_id)')
      .order('updated_at', { ascending: false });

    query = mySeller
      ? query.or(`buyer_id.eq.${userId},seller_id.eq.${mySeller.id}`)
      : query.eq('buyer_id', userId);

    const { data: threadRows } = await query;
    if (!threadRows) { setThreads([]); setLoading(false); return; }

    // Last message preview per thread — one query per thread is fine at
    // this scale; a message-count trigger/view would be the next step
    // if inbox size ever became a real list.
    const withPreviews = await Promise.all(
      (threadRows as any[]).map(async (t) => {
        const { data: lastMsg } = await supabase
          .from('marketplace_messages')
          .select('body, created_at')
          .eq('thread_id', t.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return {
          ...t,
          lastMessage: lastMsg?.body ?? null,
          lastMessageAt: lastMsg?.created_at ?? t.updated_at,
          iAmSeller: mySeller ? t.seller_id === mySeller.id : false,
        } as ThreadListItem;
      })
    );

    withPreviews.sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());
    setThreads(withPreviews);
    setLoading(false);
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

  return (
    <DesktopShell>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Messages</Text>
          <View style={{ width: 38 }} />
        </View>

        {!signedIn ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Sign in to view your messages.</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/sign-in' as any)} style={{ marginTop: 10 }}>
              <Text style={{ color: C.gold, fontWeight: '700' }}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : threads.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySub}>Message a seller from a product page to start a conversation.</Text>
          </View>
        ) : (
          <FlatList
            data={threads}
            keyExtractor={t => t.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const product = item.marketplace_products;
              const shop = item.marketplace_sellers;
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } } as any)}
                >
                  <View style={styles.rowImage}>
                    {product?.images?.[0] ? (
                      <Image source={{ uri: product.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 18, opacity: 0.4 }}>📦</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{product?.title ?? 'Product'}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.iAmSeller ? 'Buyer inquiry' : shop?.shop_name ?? 'Seller'}
                    </Text>
                    {item.lastMessage ? (
                      <Text style={styles.rowPreview} numberOfLines={1}>{item.lastMessage}</Text>
                    ) : null}
                  </View>
                  {item.lastMessageAt && <Text style={styles.rowTime}>{timeAgo(item.lastMessageAt)}</Text>}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 8, paddingHorizontal: 40 },
    emptyEmoji: { fontSize: 40, marginBottom: 4 },
    emptyText: { color: C.text2, fontSize: 14, fontWeight: '600', textAlign: 'center' },
    emptySub: { color: C.text3, fontSize: 12, textAlign: 'center', marginTop: 2 },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: C.text },

    list: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 20 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
      borderBottomWidth: 0.5, borderBottomColor: C.border2,
    },
    rowImage: {
      width: 52, height: 52, borderRadius: Theme.radius.md, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    rowTitle: { fontSize: 14, fontWeight: '700', color: C.text },
    rowSub: { fontSize: 11, color: C.gold, marginTop: 1, fontWeight: '600' },
    rowPreview: { fontSize: 12, color: C.text3, marginTop: 2 },
    rowTime: { fontSize: 11, color: C.text3 },
  });
}
