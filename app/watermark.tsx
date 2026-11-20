import { View, Text, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Button, IconButton, ListRow, SectionLabel, SegmentedControl, Switch } from '../components/ui';
import { font, radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { uploadStudioImage } from '../lib/studioLink';

// A speaker's watermark: their logo shown on their lives and videos, next to the Siqa mark (bottom right).

type Pos = 'top-left' | 'top-right' | 'bottom-left';
type Sp = { id: string; watermark_url: string | null; watermark_position: Pos; watermark_on: boolean };

export default function WatermarkScreen() {
  const { c: C, shadow } = useDS();
  const isDesktop = useIsDesktopWeb();
  const [userId, setUserId] = useState('');
  const [sp, setSp] = useState<Sp | null | undefined>(undefined);
  const [busy, setBusy] = useState<'' | 'upload' | 'save'>('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace('/(auth)/sign-in' as any); return; }
      setUserId(session.user.id);
      const { data } = await supabase.from('speakers').select('id, watermark_url, watermark_position, watermark_on').eq('profile_id', session.user.id).maybeSingle();
      setSp((data as Sp) ?? null);
    })();
  }, []));

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0] || !sp) return;
    setBusy('upload'); setErr(''); setSaved(false);
    try {
      const url = await uploadStudioImage(userId, 'watermarks', res.assets[0].uri, res.assets[0].mimeType);
      setSp({ ...sp, watermark_url: url, watermark_on: true });
    } catch (e) { setErr((e as Error).message || 'Could not upload your logo.'); }
    setBusy('');
  }

  async function save() {
    if (!sp) return;
    setBusy('save'); setErr(''); setSaved(false);
    const { error } = await supabase.from('speakers')
      .update({ watermark_url: sp.watermark_url, watermark_position: sp.watermark_position, watermark_on: sp.watermark_on })
      .eq('id', sp.id);
    setBusy('');
    if (error) setErr("Couldn't save that. Please try again."); else setSaved(true);
  }

  const corner = (p: Pos) => ({
    position: 'absolute' as const,
    ...(p === 'top-left' ? { left: 12, top: 12 } : p === 'top-right' ? { right: 12, top: 12 } : { left: 12, bottom: 12 }),
  });

  return (
    <DesktopShell>
      <ScrollView style={{ flex: 1, backgroundColor: C.bgSunk }} contentContainerStyle={{ paddingTop: HEADER_TOP_PADDING + space[4], paddingBottom: 64, paddingHorizontal: isDesktop ? space[10] : space[5] }}>
        <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            <IconButton icon="arrow-back" label="Back" variant="raised" onPress={() => goBack('/studio')} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[type.title1, { color: C.ink }]} accessibilityRole="header">Your watermark</Text>
              <Text style={[type.subhead, { color: C.ink2 }]}>Shown on your lives and videos, next to the Siqa mark</Text>
            </View>
          </View>

          {sp === undefined ? <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} /> : sp === null ? (
            <Text style={[type.body, { color: C.ink2 }]}>Watermarks are for Siqa speakers.</Text>
          ) : (
            <>
              <View style={{ aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: '#141c30', overflow: 'hidden' }} accessibilityLabel="Preview of your watermark on a video">
                {sp.watermark_url && sp.watermark_on ? (
                  <Image source={{ uri: sp.watermark_url }} style={[corner(sp.watermark_position), { width: 96, height: 40 }]} resizeMode="contain" />
                ) : null}
                <View style={{ position: 'absolute', right: 12, bottom: 12, width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(10,15,28,0.8)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[font(700), { color: C.brandGold, fontSize: 17 }]}>ص</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Button label={sp.watermark_url ? 'Change logo' : 'Upload logo'} icon="image-outline" variant="secondary" size="md" grow onPress={pick} loading={busy === 'upload'} />
                {sp.watermark_url ? <Button label="Remove" variant="danger" size="md" onPress={() => setSp({ ...sp, watermark_url: null })} /> : null}
              </View>
              <Text style={[type.caption, { color: C.ink2 }]}>A PNG with a transparent background looks best.</Text>

              <View style={{ gap: space[2] }}>
                <SectionLabel>Corner</SectionLabel>
                <SegmentedControl<Pos>
                  label="Corner"
                  options={[{ value: 'top-left', label: 'Top left' }, { value: 'top-right', label: 'Top right' }, { value: 'bottom-left', label: 'Bottom left' }]}
                  value={sp.watermark_position}
                  onChange={(v) => setSp({ ...sp, watermark_position: v })}
                />
                <Text style={[type.caption, { color: C.ink2 }]}>Bottom right is kept for the Siqa mark.</Text>
              </View>

              <View style={[{ backgroundColor: C.surface, borderRadius: radius.xl, paddingHorizontal: space[4] }, shadow('card')]}>
                <ListRow label="Show my watermark" sub="On new lives and videos. You can still turn it off per video." last
                  right={<Switch value={sp.watermark_on} onValueChange={(v) => setSp({ ...sp, watermark_on: v })} label="Show my watermark" />} />
              </View>

              {err ? <Text style={[type.callout, { color: C.danger }]}>{err}</Text> : null}
              {saved ? <Text style={[type.callout, { color: C.seed }]}>Saved.</Text> : null}
              <Button label="Save watermark" onPress={save} loading={busy === 'save'} />
            </>
          )}
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
