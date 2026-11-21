import React, { useEffect, useState } from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell } from '../../components/DesktopShell';
import { IconButton } from '../../components/ui';
import { font, space, type } from '../../lib/ds';
import { goBack } from '../../lib/goBack';
import { STUDIO_URL } from '../../lib/studioLink';
import { copyOrShare } from '../../lib/studioLink';
import { Icon } from '../../components/Icon';

// Watching a live khutbah or session on siqa.us. The player, questions and chat come from Siqa Studio's watch page,
// shown inside this screen (iframe on the web, web view in the apps).

type Info = { title: string; status: string; host_name: string | null };
type Brand = { speaker_id: string | null; speaker_name: string | null; masjid_name: string | null };

export default function LiveScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const src = `${STUDIO_URL}/watch/${token}?embed=1`;

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = async () => {
      const [{ data: i }, { data: b }] = await Promise.all([
        supabase.rpc('studio_watch_info', { p_watch: token }),
        supabase.rpc('studio_watch_brand', { p_watch: token }),
      ]);
      if (!alive) return;
      setInfo(((i as Info[]) || [])[0] || null);
      setBrand(((b as Brand[]) || [])[0] || null);
    };
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);

  const live = info?.status === 'live';
  const name = brand?.speaker_name || info?.host_name || '';

  const player = Platform.OS === 'web'
    ? React.createElement('iframe', {
        src, title: info?.title || 'Siqa Live',
        style: { width: '100%', height: '100%', border: 0, background: '#0a0f1c' },
        allow: 'autoplay; fullscreen; picture-in-picture; clipboard-write; web-share',
        allowFullScreen: true,
      })
    : (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WebView } = require('react-native-webview');
        return <WebView source={{ uri: src }} allowsInlineMediaPlayback allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} style={{ flex: 1, backgroundColor: '#0a0f1c' }} />;
      })();

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: '#0a0f1c' }}>
        <View style={{ paddingTop: HEADER_TOP_PADDING + space[2], paddingHorizontal: space[4], paddingBottom: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <IconButton icon="arrow-back" label="Back" variant="raised" onPress={() => goBack('/home')} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              {live ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#d9755f' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#fff' }} />
                  <Text style={[type.caption, font(700), { color: '#fff' }]}>LIVE</Text>
                </View>
              ) : null}
              <Text style={[type.headline, { color: '#edf1f7', flexShrink: 1 }]} numberOfLines={1}>{info?.title || 'Siqa Live'}</Text>
            </View>
            {name ? (
              <Pressable onPress={() => brand?.speaker_id && router.push(`/speaker/${brand.speaker_id}` as any)} accessibilityRole="link">
                <Text style={[type.subhead, { color: '#9facc4' }]} numberOfLines={1}>{name}{brand?.masjid_name ? ` · ${brand.masjid_name}` : ''}</Text>
              </Pressable>
            ) : null}
          </View>
          <IconButton icon="share-outline" label="Share" variant="raised"
            onPress={() => copyOrShare(`https://www.siqa.us/live/${token}`, info?.title || 'Siqa Live')} />
        </View>
        <View style={{ flex: 1 }}>{token ? player : <Icon name="radio-outline" size={24} color="#9facc4" />}</View>
      </View>
    </DesktopShell>
  );
}
