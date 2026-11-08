// siqa.us/prayer — today's times, per-prayer alerts, reminder lead time,
// calculation settings and location.
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { BottomSheet, Button, IconButton, ListRow, OptionRow, SectionLabel, SegmentedControl, TextField } from '../components/ui';
import { Icon, type SiqaIconName } from '../components/Icon';
import { font, radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { locateDevice, locateText } from '../lib/location';
import {
  LEAD_OPTIONS, METHODS, PRAYERS, formatCountdown, formatTime, nextPrayer, prayerName, timesFor,
  updatePrayerSettings, useNow, usePrayerSettings, type AlertMode, type MethodKey, type PrayerKey,
} from '../lib/prayer';
import {
  nativeAlertsAvailable, notificationPermission, requestNotificationPermission, reschedulePrayerNotifications,
} from '../lib/prayerNotifications';

const MODE_ORDER: AlertMode[] = ['athan', 'silent', 'off'];
const MODE_LOOK: Record<AlertMode, { icon: SiqaIconName; label: string }> = {
  athan: { icon: 'volume-high-outline', label: 'Athan' },
  silent: { icon: 'notifications-outline', label: 'Silent' },
  off: { icon: 'notifications-off-outline', label: 'Off' },
};

export default function PrayerScreen() {
  const { c, shadow } = useDS();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [s, ready] = usePrayerSettings();
  const now = useNow(1000);
  const [methodOpen, setMethodOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [locText, setLocText] = useState('');
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>('unsupported');

  useEffect(() => { notificationPermission().then(setPerm); }, []);

  const times = s.location ? timesFor(now, s) : null;
  const next = s.location ? nextPrayer(now, s) : null;

  const cycle = (p: PrayerKey) => {
    const i = MODE_ORDER.indexOf(s.alerts[p]);
    updatePrayerSettings({ alerts: { ...s.alerts, [p]: MODE_ORDER[(i + 1) % 3] } });
  };

  const useMine = async () => {
    setLocBusy(true); setLocErr(null);
    const l = await locateDevice();
    setLocBusy(false);
    if (!l || l.lat == null) { setLocErr('Couldn’t get your location. Type a city or ZIP instead.'); return; }
    await updatePrayerSettings({ location: { lat: l.lat, lon: l.lon!, label: l.label, mode: 'auto' } });
    setLocOpen(false);
  };
  const useTyped = async () => {
    setLocBusy(true); setLocErr(null);
    const l = await locateText(locText);
    setLocBusy(false);
    if (!l || l.lat == null) { setLocErr('Couldn’t find that place. Try “Katy, TX” or a ZIP.'); return; }
    await updatePrayerSettings({ location: { lat: l.lat, lon: l.lon!, label: l.label, mode: 'manual' } });
    setLocOpen(false); setLocText('');
  };

  const enableAlerts = async () => {
    if (perm === 'denied') { Linking.openSettings().catch(() => {}); return; }
    const ok = await requestNotificationPermission();
    setPerm(ok ? 'granted' : 'denied');
    if (ok) reschedulePrayerNotifications();
  };

  const native = Platform.OS !== 'web';
  const alertsLive = native && nativeAlertsAvailable();

  return (
    <DesktopShell>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: isDesktop ? space[8] : Math.max(insets.top, HEADER_TOP_PADDING - 20), paddingBottom: 80 }}
      >
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', gap: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -8 }}>
            <IconButton icon="chevron-back" label="Back" onPress={() => goBack('/home')} />
            <View style={{ flex: 1 }} />
            <Button label="Salah Tracker" icon="checkmark-done-outline" variant="soft" size="sm" onPress={() => router.push('/salah-tracker' as any)} />
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[isDesktop ? type.display : type.title1, { color: c.ink }]} accessibilityRole="header">Prayer times</Text>
            <Pressable onPress={() => setLocOpen(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="location-outline" size={16} color={c.ink2} />
              <Text style={[type.callout, { color: c.ink2 }]}>{s.location ? s.location.label : 'Set your location'}</Text>
              <Text style={[type.callout, font(600), { color: c.goldInk }]}>Change</Text>
            </Pressable>
          </View>

          {!ready ? null : !s.location ? (
            <View style={{ gap: space[3], padding: space[5], borderRadius: radius.xl, backgroundColor: c.surfaceSoft }}>
              <Text style={[type.headline, { color: c.ink }]}>Where are you praying?</Text>
              <Text style={[type.callout, { color: c.ink2 }]}>Times are worked out on your device from your location. It isn’t shared.</Text>
              <Button label="Set location" onPress={() => setLocOpen(true)} />
            </View>
          ) : times ? (
            <>
              {next ? (
                <View style={[{ backgroundColor: c.night, borderRadius: radius.xl, padding: space[5], gap: 4 }, shadow('card')]}>
                  <Text style={[type.subhead, { color: '#9facc4' }]}>Next · {prayerName(next.prayer, next.day)} at {formatTime(next.at)}</Text>
                  <Text style={[type.display, { color: c.brandGold, fontVariant: ['tabular-nums'] }]}>{formatCountdown(+next.at - +now, true)}</Text>
                </View>
              ) : null}

              <View style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: space[4] }}>
                {(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((k, i) => {
                  const isNext = next && k === next.prayer && next.day.getDate() === now.getDate();
                  const at = times[k];
                  const label = k === 'sunrise' ? 'Sunrise' : prayerName(k, now);
                  return (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 58, borderBottomWidth: i === 5 ? 0 : 1, borderBottomColor: c.line }}>
                      <Text style={[type.body, font(isNext ? 700 : 500), { color: k === 'sunrise' ? c.ink2 : c.ink, flex: 1 }]}>{label}</Text>
                      <Text style={[type.body, font(isNext ? 700 : 500), { color: isNext ? c.goldInk : c.ink, fontVariant: ['tabular-nums'] }]}>{formatTime(at)}</Text>
                      {k === 'sunrise' ? <View style={{ width: 92 }} /> : (
                        <Pressable
                          onPress={() => cycle(k)}
                          accessibilityRole="button"
                          accessibilityLabel={`${label} alert: ${MODE_LOOK[s.alerts[k]].label}. Tap to change`}
                          style={({ pressed }) => ({ width: 92, height: 32, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                            backgroundColor: s.alerts[k] === 'off' ? c.surfaceSoft : s.alerts[k] === 'athan' ? c.goldTint : c.surfaceSoft, opacity: pressed ? 0.7 : 1 })}
                        >
                          <Icon name={MODE_LOOK[s.alerts[k]].icon} size={15} color={s.alerts[k] === 'athan' ? c.goldInk : s.alerts[k] === 'off' ? c.ink3 : c.ink} />
                          <Text style={[type.buttonSm, { color: s.alerts[k] === 'athan' ? c.goldInk : s.alerts[k] === 'off' ? c.ink3 : c.ink }]}>{MODE_LOOK[s.alerts[k]].label}</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={[type.caption, { color: c.ink2, marginTop: -space[4] }]}>
                Tap a prayer’s alert to switch between Athan, Silent and Off. Use Silent for prayers you’re at work or school for.
              </Text>
            </>
          ) : null}

          {/* Alerts */}
          <View style={{ gap: space[3] }}>
            <SectionLabel>Reminder before each prayer</SectionLabel>
            <SegmentedControl
              label="Reminder before each prayer"
              value={String(s.leadMinutes)}
              onChange={(v) => updatePrayerSettings({ leadMinutes: Number(v) as any })}
              options={LEAD_OPTIONS.map(m => ({ value: String(m), label: m === 0 ? 'Off' : `${m} min` }))}
            />
            <Text style={[type.caption, { color: c.ink2 }]}>
              A countdown banner shows up in Siqa this many minutes before each prayer{alertsLive ? ', plus a quiet heads-up notification' : ''}.
            </Text>

            {native ? (
              alertsLive ? (
                perm !== 'granted' ? (
                  <View style={{ gap: space[2], padding: space[4], borderRadius: radius.lg, backgroundColor: c.goldTint }}>
                    <Text style={[type.callout, font(600), { color: c.ink }]}>Turn on notifications to hear the athan</Text>
                    <Button label={perm === 'denied' ? 'Turn on in Settings' : 'Turn on notifications'} variant="gold" size="md" onPress={enableAlerts} />
                  </View>
                ) : (
                  <Text style={[type.caption, { color: c.ink2 }]}>
                    If your phone’s silent switch is on, iOS won’t play the athan, even for prayers set to Athan.
                    Open Siqa at least once a week to keep alerts coming.
                  </Text>
                )
              ) : (
                <Text style={[type.caption, { color: c.ink2 }]}>Athan notifications come in the next app update.</Text>
              )
            ) : (
              <View style={{ flexDirection: 'row', gap: space[2], padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSoft }}>
                <Icon name="information-circle-outline" size={18} color={c.ink2} />
                <Text style={[type.caption, { color: c.ink2, flex: 1 }]}>
                  On the web, Siqa can only remind you while it’s open. For athan alerts on your phone, use the Siqa app.
                </Text>
              </View>
            )}
          </View>

          {/* Calculation */}
          <View style={{ gap: space[3] }}>
            <SectionLabel>Calculation</SectionLabel>
            <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, paddingHorizontal: space[4] }}>
              <ListRow icon="calculator-outline" label="Method" value={METHODS[s.method].label} onPress={() => setMethodOpen(true)} last />
            </View>
            <Text style={[type.caption, font(600), { color: c.ink2 }]}>Asr time</Text>
            <SegmentedControl
              label="Asr time"
              value={s.madhab}
              onChange={(v) => updatePrayerSettings({ madhab: v })}
              options={[{ value: 'shafi', label: 'Standard' }, { value: 'hanafi', label: 'Hanafi (later)' }]}
            />
            <Text style={[type.caption, { color: c.ink2 }]}>Times may differ by a few minutes from your masjid’s timetable.</Text>
          </View>
        </View>
      </ScrollView>

      <BottomSheet visible={methodOpen} onClose={() => setMethodOpen(false)} title="Calculation method">
        {(Object.keys(METHODS) as MethodKey[]).map((k, i, arr) => (
          <OptionRow key={k} label={METHODS[k].label} sub={METHODS[k].sub || undefined} selected={s.method === k}
            onPress={() => { updatePrayerSettings({ method: k }); setMethodOpen(false); }} last={i === arr.length - 1} />
        ))}
      </BottomSheet>

      <BottomSheet visible={locOpen} onClose={() => setLocOpen(false)} title="Location for prayer times">
        <View style={{ gap: space[4], paddingBottom: space[4] }}>
          <Button label="Use my current location" icon="navigate-outline" variant="secondary" onPress={useMine} loading={locBusy} />
          <TextField label="Or type a city or ZIP" placeholder="Houston, TX" value={locText} onChangeText={setLocText} onSubmitEditing={useTyped} returnKeyType="search" error={locErr} />
          <Button label="Use this place" onPress={useTyped} disabled={!locText.trim() || locBusy} />
        </View>
      </BottomSheet>
    </DesktopShell>
  );
}
