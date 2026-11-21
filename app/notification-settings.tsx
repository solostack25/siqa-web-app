import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { IconButton, ListRow, SectionLabel, Switch } from '../components/ui';
import { radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { PushCard } from '../components/PushCard';

// Email settings. Follow emails (new videos from speakers you follow, new
// items from shops you follow) can be switched off here or from the
// unsubscribe link in each email. Order and account emails always send.

type Prefs = { new_videos: boolean; new_items: boolean };

export default function NotificationSettingsScreen() {
  const { c, shadow } = useDS();
  const isDesktop = useIsDesktopWeb();
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
    setUserId(session.user.id);
    const { data } = await supabase.from('email_preferences').select('new_videos, new_items').eq('user_id', session.user.id).maybeSingle();
    if (data) { setPrefs(data as Prefs); return; }
    // First visit: create the row with everything on.
    const { data: created } = await supabase.from('email_preferences')
      .insert({ user_id: session.user.id }).select('new_videos, new_items').single();
    setPrefs((created as Prefs) ?? { new_videos: true, new_items: true });
  }

  async function set(key: keyof Prefs, value: boolean) {
    if (!userId || !prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSaving(key);
    setError('');
    const { error: e } = await supabase.from('email_preferences')
      .update({ [key]: value, updated_at: new Date().toISOString() }).eq('user_id', userId);
    setSaving(null);
    if (e) { setPrefs(before); setError("Couldn't save that. Please try again."); }
  }

  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: c.bgSunk }} contentContainerStyle={{ paddingTop: HEADER_TOP_PADDING + space[4], paddingBottom: 64, paddingHorizontal: isDesktop ? space[10] : space[5] }}>
        <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            <IconButton icon="arrow-back" label="Back" variant="raised" onPress={() => goBack('/settings')} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[type.title1, { color: c.ink }]} accessibilityRole="header">Notifications</Text>
              <Text style={[type.subhead, { color: c.ink2 }]}>Choose what Siqa notifies you about</Text>
            </View>
          </View>

          {!prefs ? (
            <ActivityIndicator color={c.gold} style={{ marginTop: 40 }} />
          ) : (
            <>
              <PushCard />

              <View style={{ gap: space[2] }}>
                <SectionLabel>From people you follow</SectionLabel>
                <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')]}>
                  <ListRow
                    icon="play-circle-outline"
                    label="New videos"
                    sub="When a speaker you follow posts a new video"
                    right={<Switch value={prefs.new_videos} onValueChange={(v) => set('new_videos', v)} disabled={saving === 'new_videos'} label="Email me about new videos" />}
                  />
                  <ListRow
                    icon="bag-handle-outline"
                    label="New items in shops"
                    sub="When a shop you follow lists something new"
                    last
                    right={<Switch value={prefs.new_items} onValueChange={(v) => set('new_items', v)} disabled={saving === 'new_items'} label="Email me about new shop items" />}
                  />
                </View>
                <Text style={[type.caption, { color: c.ink2 }]}>
                  We bundle these into one email at most once an hour, so you won't get a flood.
                </Text>
              </View>

              <View style={{ gap: space[2] }}>
                <SectionLabel>Always on</SectionLabel>
                <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')]}>
                  <ListRow icon="receipt-outline" label="Orders" sub="Confirmations, shipping and delivery updates" />
                  <ListRow icon="lock-closed-outline" label="Account" sub="Password resets and sign-in links" last />
                </View>
                <Text style={[type.caption, { color: c.ink2 }]}>These are about your purchases and your account, so they can't be turned off.</Text>
              </View>

              {error ? <Text style={[type.callout, { color: c.danger }]}>{error}</Text> : null}
            </>
          )}
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
