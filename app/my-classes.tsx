// My classes: every class you joined, with what's next, a Join button when it's live, and the recordings and notes.
// Recordings and notes open on the class page (they're only for students who joined).
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { IconButton, Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { font, radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { openStudio } from '../lib/studioLink';

type Klass = {
  share: string; title: string; cover: string | null; members_only: boolean; teacher: string | null;
  live: { title: string; watch_token: string } | null;
  next: { title: string; scheduled_at: string } | null;
  recordings: number; latest: { title: string; at: string } | null; handouts: number; joined_at: string;
};

function when(iso: string) {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const tomorrow = d.toDateString() === new Date(Date.now() + 86400000).toDateString();
  const day = today ? 'Today' : tomorrow ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  return `${day} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export default function MyClasses() {
  const { c, shadow } = useDS();
  const isDesktop = useIsDesktopWeb();
  const [rows, setRows] = useState<Klass[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSignedOut(true); setRows([]); return; }
      const { data } = await supabase.rpc('studio_my_classes');
      setRows((data as Klass[]) ?? []);
    })();
  }, []));

  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: c.bgSunk }} contentContainerStyle={{ paddingTop: HEADER_TOP_PADDING + space[4], paddingBottom: 64, paddingHorizontal: isDesktop ? space[10] : space[5] }}>
        <View style={{ width: '100%', maxWidth: 820, alignSelf: 'center', gap: space[5] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            <IconButton icon="arrow-back" label="Back" variant="raised" onPress={() => goBack('/home')} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[{ fontSize: 28, lineHeight: 34 }, font(800), { color: c.ink }]} accessibilityRole="header">My classes</Text>
              <Text style={[type.body, { color: c.ink2 }]}>Classes you joined: what's next, recordings and notes.</Text>
            </View>
          </View>

          {rows === null ? <ActivityIndicator color={c.ink2} style={{ marginTop: space[8] }} /> : null}

          {signedOut ? (
            <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: space[5], gap: space[3] }, shadow('card')]}>
              <Text style={[type.body, { color: c.ink }]}>Sign in to see your classes.</Text>
              <Button label="Sign in" onPress={() => router.push('/sign-in?next=/my-classes' as any)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : rows && rows.length === 0 ? (
            <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: space[5], gap: space[2] }, shadow('card')]}>
              <Text style={[{ fontSize: 19 }, font(700), { color: c.ink }]}>No classes yet</Text>
              <Text style={[type.body, { color: c.ink2 }]}>When a teacher shares a class link with you, open it and tap Join this class. It shows up here with its reminders, recordings and notes.</Text>
            </View>
          ) : null}

          {(rows ?? []).map((k) => (
            <View key={k.share} style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: space[5], gap: space[4] }, shadow('card')]}>
              <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
                {k.cover ? <Image source={{ uri: k.cover }} style={{ width: 72, height: 72, borderRadius: 14 }} /> : (
                  <View style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="book-outline" size={30} color={c.ink2} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 21, lineHeight: 27 }, font(800), { color: c.ink }]}>{k.title}</Text>
                  {k.teacher ? <Text style={[type.body, { color: c.ink2 }]}>With {k.teacher}</Text> : null}
                </View>
              </View>

              {k.live ? (
                <Pressable onPress={() => openStudio(`/watch/${k.live!.watch_token}`)} accessibilityRole="button"
                  style={{ minHeight: 60, borderRadius: radius.pill, backgroundColor: '#C8312B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' }} />
                  <Text style={[{ fontSize: 19 }, font(800), { color: '#fff' }]}>Live now. Join class</Text>
                </Pressable>
              ) : k.next ? (
                <View style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSoft }}>
                  <Text style={[type.caption, font(700), { color: c.ink2 }]}>NEXT CLASS</Text>
                  <Text style={[{ fontSize: 18 }, font(700), { color: c.ink }]}>{when(k.next.scheduled_at)}</Text>
                  <Text style={[type.body, { color: c.ink2 }]}>{k.next.title}. We’ll email you before it starts.</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                <Button label={k.recordings ? `Recordings (${k.recordings})` : 'Recordings'} icon="play-circle-outline" variant="soft" size="md"
                  onPress={() => openStudio(`/s/${k.share}`)} />
                {k.handouts ? <Button label={`Notes (${k.handouts})`} icon="document-text-outline" variant="soft" size="md" onPress={() => openStudio(`/s/${k.share}`)} /> : null}
              </View>
              {k.latest ? <Text style={[type.caption, { color: c.ink3 }]}>Latest: {k.latest.title}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
