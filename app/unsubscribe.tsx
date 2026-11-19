import { View, Text, ScrollView } from 'react-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { radius, space, type, useDS } from '../lib/ds';

// Landing page for the "Unsubscribe" link in follow emails. Works signed
// out: the link carries the person's private unsubscribe token. It asks
// before changing anything, because email scanners open links on their own.

const WHAT: Record<string, { label: string; done: string }> = {
  videos: { label: 'new video emails', done: "You won't get emails about new videos anymore." },
  items: { label: 'new shop item emails', done: "You won't get emails about new shop items anymore." },
  all: { label: 'all emails about people you follow', done: "You won't get emails about the speakers and shops you follow anymore." },
};

export default function UnsubscribeScreen() {
  const { c, shadow } = useDS();
  const params = useLocalSearchParams<{ t?: string; k?: string }>();
  const token = String(params.t ?? '');
  const kind = WHAT[String(params.k ?? 'all')] ? String(params.k ?? 'all') : 'all';
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'error'>(token ? 'ask' : 'error');

  async function confirm() {
    setState('busy');
    const { data, error } = await supabase.functions.invoke('email-unsubscribe', { body: { token, kind } });
    setState(!error && (data as any)?.ok ? 'done' : 'error');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bgSunk }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space[5], paddingTop: HEADER_TOP_PADDING + space[5] }}>
      <View style={[{ width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: c.surface, borderRadius: radius.xl, padding: space[8], gap: space[4], alignItems: 'center' }, shadow('raised')]}>
        <Icon name={state === 'done' ? 'checkmark-circle' : state === 'error' ? 'alert-circle-outline' : 'mail-outline'} size={40} color={state === 'done' ? c.seed : state === 'error' ? c.danger : c.gold} />
        {state === 'done' ? (
          <>
            <Text style={[type.title2, { color: c.ink, textAlign: 'center' }]} accessibilityRole="header">You're unsubscribed</Text>
            <Text style={[type.callout, { color: c.ink2, textAlign: 'center' }]}>{WHAT[kind].done} Order and account emails will still come through.</Text>
            <Button label="Email settings" variant="secondary" size="md" onPress={() => router.replace('/notification-settings' as any)} />
          </>
        ) : state === 'error' ? (
          <>
            <Text style={[type.title2, { color: c.ink, textAlign: 'center' }]} accessibilityRole="header">That link didn't work</Text>
            <Text style={[type.callout, { color: c.ink2, textAlign: 'center' }]}>Sign in and turn emails off in your settings instead.</Text>
            <Button label="Email settings" variant="primary" size="md" onPress={() => router.replace('/notification-settings' as any)} />
          </>
        ) : (
          <>
            <Text style={[type.title2, { color: c.ink, textAlign: 'center' }]} accessibilityRole="header">Unsubscribe?</Text>
            <Text style={[type.callout, { color: c.ink2, textAlign: 'center' }]}>Stop getting {WHAT[kind].label} from Siqa. You can turn them back on anytime in Settings.</Text>
            <Button label="Unsubscribe" variant="primary" loading={state === 'busy'} onPress={confirm} style={{ alignSelf: 'stretch' }} />
            <Button label="Keep getting them" variant="ghost" size="md" onPress={() => router.replace('/' as any)} />
          </>
        )}
      </View>
    </ScrollView>
  );
}
