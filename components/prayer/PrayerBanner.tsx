// Sticky in-app banner: counts down for the last N minutes before a prayer
// (N = the user's lead time, default 30), then "It's time for Asr" with
// Mark as prayed for 15 minutes. Dismissing hides it for that prayer only.
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../Icon';
import { font, radius, space, type, useDS } from '../../lib/ds';
import {
  currentPrayer, dayKey, formatCountdown, isRamadan, nextPrayer, prayerName, statusIfPrayedNow, useNow, usePrayerSettings,
} from '../../lib/prayer';
import { setSalah, useSalahLog } from '../../lib/salahLog';
import { showToast } from '../Toast';
import { useIsDesktopWeb } from '../DesktopShell';

const AFTER_MINUTES = 15;
// Full-screen and flow screens where a banner would get in the way.
const HIDE_ON = ['/welcome', '/sign-in', '/sign-up', '/login', '/forgot-password', '/reset-password', '/gems', '/watch', '/checkout', '/prayer', '/salah-tracker'];

const dismissed = new Set<string>();

export function PrayerBanner() {
  const { c, shadow } = useDS();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const pathname = usePathname();
  const [s, ready] = usePrayerSettings();
  const { log } = useSalahLog();
  const now = useNow(1000);
  const [, force] = useState(0);

  if (!ready || !s.location || s.leadMinutes === 0) return null;
  if (HIDE_ON.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  // Before: countdown to the next prayer.
  const next = nextPrayer(now, s);
  const leadMs = s.leadMinutes * 60000;
  let mode: 'before' | 'now' | null = null;
  let inst = null as null | { prayer: any; at: Date; day: Date };
  if (next && +next.at - +now <= leadMs && s.alerts[next.prayer] !== 'off') { mode = 'before'; inst = next; }
  // After: it's time, until marked or 15 minutes pass.
  const cur = currentPrayer(now, s);
  if (!mode && cur && +now - +cur.at <= AFTER_MINUTES * 60000 && s.alerts[cur.prayer] !== 'off') {
    const logged = log[dayKey(cur.day)]?.[cur.prayer as keyof typeof log[string]];
    if (!logged) { mode = 'now'; inst = cur; }
  }
  if (!mode || !inst) return null;
  const id = `${mode}:${dayKey(inst.day)}:${inst.prayer}`;
  if (dismissed.has(id)) return null;

  const name = prayerName(inst.prayer, inst.day);
  const ramadan = isRamadan(inst.day);
  const title = mode === 'before'
    ? (ramadan && inst.prayer === 'fajr' ? 'Suhoor ends in' : ramadan && inst.prayer === 'maghrib' ? 'Iftar in' : `${name} in`)
    : `It’s time for ${name}`;

  const mark = async () => {
    const st = statusIfPrayedNow(inst!.day, inst!.prayer, new Date(), s);
    await setSalah(dayKey(inst!.day), inst!.prayer, { status: st, jamaah: false, prayed_at: new Date().toISOString() });
    showToast(`${name} marked as prayed`);
  };
  const close = () => { dismissed.add(id); force(x => x + 1); };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
        top: isDesktop ? space[4] : insets.top + 6,
        left: isDesktop ? undefined : space[3], right: space[3],
        width: isDesktop ? 380 : undefined, zIndex: 1000,
      }}
    >
      <View
        accessibilityRole="alert"
        style={[{
          flexDirection: 'row', alignItems: 'center', gap: space[3],
          backgroundColor: c.night, borderRadius: radius.lg, paddingLeft: space[4], paddingRight: space[2], paddingVertical: space[3],
        }, shadow('raised')]}
      >
        <Icon name={mode === 'before' ? 'time-outline' : 'moon'} size={20} color={c.brandGold} />
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/prayer' as any)} accessibilityRole="button" accessibilityLabel={`${title}. Open prayer times`}>
          <Text style={[type.subhead, font(600), { color: '#edf1f7' }]} numberOfLines={1}>{title}</Text>
          {mode === 'before'
            ? <Text style={[type.title2, { color: c.brandGold, fontVariant: ['tabular-nums'] }]}>{formatCountdown(+inst.at - +now, true)}</Text>
            : <Text style={[type.caption, { color: '#9facc4' }]}>Tap the check when you’ve prayed</Text>}
        </Pressable>
        {mode === 'now' ? (
          <Pressable onPress={mark} accessibilityRole="button" accessibilityLabel={`Mark ${name} as prayed`}
            style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.brandGold, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}>
            <Icon name="checkmark" size={16} color="#0a0f1c" />
            <Text style={[type.buttonSm, { color: '#0a0f1c' }]}>Prayed</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ padding: 6 }}>
          <Icon name="close" size={18} color="#9facc4" />
        </Pressable>
      </View>
    </View>
  );
}
