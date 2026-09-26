import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';

type Thread = {
  id: string;
  buyer_id: string;
  seller_id: string;
  marketplace_products: { id: string; title: string; price_cents: number; images: string[] | null } | null;
  marketplace_sellers: { shop_name: string; user_id: string } | null;
};

type Message = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null };

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const scrollRef = useRef<ScrollView>(null);

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id) load(id);
    }, [id])
  );

  async function load(threadId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
    setUserId(session.user.id);

    const { data: threadData } = await supabase
      .from('marketplace_threads')
      .select('id, buyer_id, seller_id, marketplace_products(id, title, price_cents, images), marketplace_sellers(shop_name, user_id)')
      .eq('id', threadId)
      .single();
    if (threadData) setThread(threadData as any);

    const { data: msgs } = await supabase
      .from('marketplace_messages')
      .select('id, sender_id, body, created_at, read_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (msgs) {
      setMessages(msgs);
      const unreadIds = msgs.filter(m => m.sender_id !== session.user.id && !m.read_at).map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase.from('marketplace_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
      }
    }
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }

  async function handleSend() {
    const text = body.trim();
    if (!text || !id || !userId) return;
    setSending(true);
    setBody('');
    const { data } = await supabase
      .from('marketplace_messages')
      .insert({ thread_id: id, sender_id: userId, body: text })
      .select('id, sender_id, body, created_at, read_at')
      .single();
    if (data) setMessages(prev => [...prev, data]);
    setSending(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }

  if (loading || !thread) {
    return (
      <DesktopShell>
        <View style={styles.centered}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </DesktopShell>
    );
  }

  const isSeller = thread.marketplace_sellers?.user_id === userId;
  const product = thread.marketplace_products;

  return (
    <DesktopShell>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
            <Icon name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isSeller ? 'Buyer inquiry' : thread.marketplace_sellers?.shop_name ?? 'Seller'}
          </Text>
          <View style={{ width: 38 }} />
        </View>

        {product && (
          <TouchableOpacity
            style={styles.productCard}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } } as any)}
          >
            <View style={styles.productImage}>
              {product.images?.[0] ? (
                <Image source={{ uri: product.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.productTitle} numberOfLines={1}>{product.title}</Text>
              <Text style={styles.productPrice}>${(product.price_cents / 100).toFixed(2)}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
        )}

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messagesList}>
          {messages.length === 0 ? (
            <View style={styles.emptyMessages}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>💬</Text>
              <Text style={styles.emptyText}>
                {isSeller ? 'No messages yet for this inquiry.' : 'Send a message to ask about this product.'}
              </Text>
            </View>
          ) : (
            messages.map(m => {
              const isOwn = m.sender_id === userId;
              return (
                <View key={m.id} style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                  <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                    <Text style={isOwn ? styles.bubbleTextOwn : styles.bubbleText}>{m.body}</Text>
                    <Text style={isOwn ? styles.bubbleTimeOwn : styles.bubbleTime}>{formatTime(m.created_at)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          {/* The divider/background spans full width intentionally (a
              footer bar reads fine edge-to-edge), but the actual input
              + button need the same cap as the message list above them
              or they'd sit wider than the conversation itself. */}
          <View style={styles.inputRowInner}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={C.text3}
              value={body}
              onChangeText={setBody}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!body.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!body.trim() || sending}
            >
              <Icon name="send" size={16} color={C.black} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </DesktopShell>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.lg, paddingTop: HEADER_TOP_PADDING, paddingBottom: Theme.spacing.md,
    },
    roundBtn: {
      width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: Theme.fontSize.base, fontWeight: '700', color: C.text },

    productCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: Theme.spacing.lg, marginBottom: Theme.spacing.md,
      backgroundColor: C.surface, borderRadius: Theme.radius.lg, padding: 10,
      borderWidth: 0.5, borderColor: C.border2,
    },
    productImage: { width: 40, height: 40, borderRadius: 8, backgroundColor: C.surface2, overflow: 'hidden' },
    productTitle: { fontSize: 12, fontWeight: '600', color: C.text },
    productPrice: { fontSize: 11, color: C.gold, fontWeight: '700', marginTop: 1 },

    messagesList: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 20, gap: 8, flexGrow: 1, maxWidth: 760, width: '100%', alignSelf: 'center' },
    emptyMessages: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyText: { color: C.text3, fontSize: 13, textAlign: 'center' },

    bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
    bubbleRowOwn: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
    bubbleOther: { backgroundColor: C.surface2, borderBottomLeftRadius: 4 },
    bubbleOwn: { backgroundColor: C.gold, borderBottomRightRadius: 4 },
    bubbleText: { fontSize: 14, color: C.text, lineHeight: 19 },
    bubbleTextOwn: { fontSize: 14, color: C.black, lineHeight: 19 },
    bubbleTime: { fontSize: 10, color: C.text3, marginTop: 3 },
    bubbleTimeOwn: { fontSize: 10, color: 'rgba(0,0,0,0.5)', marginTop: 3 },

    inputRow: {
      paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.sm, paddingBottom: 28,
      borderTopWidth: 0.5, borderTopColor: C.border2, backgroundColor: C.bg,
    },
    inputRowInner: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      maxWidth: 760, width: '100%', alignSelf: 'center',
    },
    input: {
      flex: 1, maxHeight: 100, backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 14,
      borderWidth: 0.5, borderColor: C.border,
    },
    sendBtn: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: C.gold,
      alignItems: 'center', justifyContent: 'center',
    },
  });
}
