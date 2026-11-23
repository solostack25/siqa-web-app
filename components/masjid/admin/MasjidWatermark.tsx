// The masjid's watermark: its logo in the Siqa signature (imam · masjid · Siqa) on every live and video from the masjid.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { uploadStudioImage } from '../../../lib/studioLink';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button } from '../../ui';
import { Card, CardTitle } from './kit';
import { showToast } from '../../Toast';

export function useMasjidWatermark(orgId: string) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const reload = useCallback(async () => {
    const { data } = await supabase.from('organizations').select('watermark_url').eq('id', orgId).maybeSingle();
    setUrl((data as { watermark_url: string | null } | null)?.watermark_url ?? null);
  }, [orgId]);
  useEffect(() => { reload(); }, [reload]);
  return { url, reload };
}

export function MasjidWatermarkCard({ orgId, canManage, nudge = false }: { orgId: string; canManage: boolean; nudge?: boolean }) {
  const { c } = useDS();
  const { url, reload } = useMasjidWatermark(orgId);
  const [busy, setBusy] = useState(false);
  if (url === undefined) return null;
  if (nudge && url) return null; // the Overview only asks until it's done

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uploaded = await uploadStudioImage(user!.id, 'watermarks', res.assets[0].uri, res.assets[0].mimeType);
      const { error } = await supabase.rpc('masjid_set_watermark', { p_org: orgId, p_url: uploaded });
      if (error) throw error;
      await reload();
      showToast('Saved. It goes on your next live.');
    } catch (e) { showToast((e as Error).message || 'Could not upload it. Try again.'); }
    setBusy(false);
  };
  const remove = async () => {
    const { error } = await supabase.rpc('masjid_set_watermark', { p_org: orgId, p_url: null });
    if (error) { showToast(error.message); return; }
    reload();
  };

  return (
    <Card style={nudge ? { borderWidth: 2, borderColor: c.gold } : undefined}>
      <CardTitle>{nudge ? 'Finish setting up: add your watermark' : 'Your watermark'}</CardTitle>
      <Text style={[type.body, { color: c.ink2 }]}>
        Your masjid's logo goes on every live and video from your masjid, next to the imam's and Siqa's. A logo with a see-through background (PNG) looks best.
      </Text>
      {url ? (
        <View style={{ alignSelf: 'flex-start', padding: space[3], borderRadius: radius.lg, backgroundColor: '#0a0f1c' }}>
          <Image source={{ uri: url }} resizeMode="contain" style={{ width: 160, height: 64 }} accessibilityLabel="Your watermark" />
        </View>
      ) : null}
      {canManage ? (
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Button label={url ? 'Change' : 'Upload your logo'} icon="image-outline" size="md" onPress={pick} loading={busy} />
          {url ? <Button label="Remove" variant="ghost" size="md" onPress={remove} /> : null}
        </View>
      ) : <Text style={[type.caption, font(600), { color: c.ink3 }]}>Only the masjid's owner or admins can change it.</Text>}
    </Card>
  );
}
