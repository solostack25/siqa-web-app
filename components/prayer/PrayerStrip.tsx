// Home: "Next prayer: Asr in 1h 12m" → opens the full day's times.
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '../Icon';
import { font, radius, space, type, useDS } from '../../lib/ds';
import { formatCountdown, formatTime, nextPrayer, prayerName, useNow, usePrayerSettings } from '../../lib/prayer';

export function PrayerStrip({ pad = space[4] }: { pad?: number }) {
  const { c, shadow } = useDS();
  const [s, ready] = usePrayerSettings();
  const now = useNow(30000);
  if (!ready) return null;

  const next = s.location ? nextPrayer(now, s) : null;
  const go = () => router.push('/prayer' as any);

  return (
    <View style={{ paddingHorizontal: pad, marginBottom: space[5] }}>
      <Pressable
        onPress={go}
        accessibilityRole="button"
        accessibilityLabel={next ? `Next prayer ${prayerName(next.prayer, next.day)} at ${formatTime(next.at)}. Open prayer times` : 'Set your location for prayer times'}
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: space[3],
          backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line,
          paddingHorizontal: space[4], paddingVertical: space[3], opacity: pressed ? 0.8 : 1,
        }, shadow('hairline')]}
      >
        <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.goldTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="moon-outline" size={18} color={c.goldInk} />
        </View>
        {next ? (
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { color: c.ink2 }]}>Next prayer</Text>
            <Text style={[type.headline, { color: c.ink }]} numberOfLines={1}>
              {prayerName(next.prayer, next.day)} <Text style={[font(500), { color: c.ink2 }]}>at {formatTime(next.at)}</Text>
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={[type.headline, { color: c.ink }]}>Prayer times</Text>
            <Text style={[type.caption, { color: c.ink2 }]}>Set your location to see today’s times</Text>
          </View>
        )}
        {next ? <Text style={[type.subhead, font(700, 'display'), { color: c.goldInk }]}>in {formatCountdown(+next.at - +now)}</Text> : null}
        <Icon name="chevron-forward" size={17} color={c.ink3} />
      </Pressable>
    </View>
  );
}
