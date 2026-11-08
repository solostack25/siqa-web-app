// siqa.us/salah-tracker — private daily checklist, history, optional streaks,
// make-up counter, export and delete.
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopShell, useIsDesktopWeb } from '../components/DesktopShell';
import { Button, IconButton, SectionLabel, Stepper, Switch } from '../components/ui';
import { Icon, type SiqaIconName } from '../components/Icon';
import { font, radius, space, type, useDS } from '../lib/ds';
import { goBack } from '../lib/goBack';
import { HEADER_TOP_PADDING } from '../constants/theme';
import { confirmDialog } from '../lib/dialogs';
import { showToast } from '../components/Toast';
import {
  PRAYERS, addDays, dayKey, formatTime, parseDayKey, prayerDay, prayerName, statusIfPrayedNow, timesFor,
  updatePrayerSettings, useNow, usePrayerSettings, type PrayerKey,
} from '../lib/prayer';
import {
  deleteAllSalah, isDayExcused, missedCount, setDayExcused, setSalah, streakDays, toCsv, useSalahLog,
  type DayLog, type SalahStatus,
} from '../lib/salahLog';

const STATUS: { key: Exclude<SalahStatus, 'excused'>; label: string; icon: SiqaIconName }[] = [
  { key: 'on_time', label: 'On time', icon: 'checkmark' },
  { key: 'late', label: 'Late', icon: 'time-outline' },
  { key: 'missed', label: 'Missed', icon: 'close' },
];

const prevKey = (k: string) => dayKey(addDays(parseDayKey(k), -1));

export default function SalahTracker() {
  const { c } = useDS();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [s] = usePrayerSettings();
  const { log, ready, signedIn } = useSalahLog();
  const now = useNow(60000);
  const todayKey = dayKey(prayerDay(now, s));
  const [viewKey, setViewKey] = useState<string | null>(null);
  const key = viewKey ?? todayKey;
  const day = parseDayKey(key);
  const dayLog: DayLog = log[key] ?? {};
  const excused = isDayExcused(dayLog);
  const times = s.location ? timesFor(day, s) : null;
  const isToday = key === todayKey;
  const [monthOffset, setMonthOffset] = useState(0);

  const tone = (st?: SalahStatus) =>
    st === 'on_time' ? c.seed : st === 'late' ? c.gold : st === 'missed' ? c.danger : st === 'excused' ? c.ink3 : null;

  const pick = (p: PrayerKey, st: Exclude<SalahStatus, 'excused'>) => {
    const cur = dayLog[p];
    if (cur?.status === st) { setSalah(key, p, null); return; }
    setSalah(key, p, { status: st, jamaah: cur?.jamaah ?? false, prayed_at: st === 'missed' ? null : new Date().toISOString() });
  };
  const quickCheck = (p: PrayerKey) => {
    if (dayLog[p]) { setSalah(key, p, null); return; }
    const st = isToday ? statusIfPrayedNow(day, p, new Date(), s) : 'on_time';
    setSalah(key, p, { status: st, jamaah: false, prayed_at: new Date().toISOString() });
  };
  const toggleJamaah = (p: PrayerKey) => {
    const cur = dayLog[p];
    if (!cur || cur.status === 'missed' || cur.status === 'excused') return;
    setSalah(key, p, { ...cur, jamaah: !cur.jamaah });
  };

  // Stats over the last 30 prayer days.
  const stats = useMemo(() => {
    let onTime = 0, late = 0, missed = 0, jamaah = 0, counted = 0;
    let k = todayKey;
    for (let i = 0; i < 30; i++) {
      const d = log[k];
      if (d) for (const p of PRAYERS) {
        const e = d[p];
        if (!e || e.status === 'excused') continue;
        counted++;
        if (e.status === 'on_time') onTime++;
        if (e.status === 'late') late++;
        if (e.status === 'missed') missed++;
        if (e.jamaah) jamaah++;
      }
      k = prevKey(k);
    }
    return { onTime, late, missed, jamaah, counted, pct: counted ? Math.round((onTime / counted) * 100) : null };
  }, [log, todayKey]);

  const owed = Math.max(0, missedCount(log) + s.qadaExtra - s.qadaMadeUp);
  const streak = s.streaks ? streakDays(log, todayKey, prevKey) : 0;

  // Month grid.
  const base = parseDayKey(todayKey);
  const month = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1, 12);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = month.getDay();

  const doExport = async () => {
    const csv = toCsv(log);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'siqa-salah-tracker.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      Share.share({ message: csv, title: 'Siqa Salah Tracker' }).catch(() => {});
    }
  };
  const doDelete = async () => {
    const ok = await confirmDialog('Delete your Salah Tracker?', 'This removes every prayer you’ve logged, on every device. It can’t be undone.', 'Delete all');
    if (!ok) return;
    await deleteAllSalah();
    await updatePrayerSettings({ qadaExtra: 0, qadaMadeUp: 0 });
    showToast('Salah Tracker deleted');
  };

  const card = { borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface } as const;

  return (
    <DesktopShell>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: isDesktop ? space[8] : Math.max(insets.top, HEADER_TOP_PADDING - 20), paddingBottom: 80 }}
      >
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', gap: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -8 }}>
            <IconButton icon="chevron-back" label="Back" onPress={() => goBack('/dashboard')} />
            <View style={{ flex: 1 }} />
            <Button label="Prayer times" icon="moon-outline" variant="soft" size="sm" onPress={() => router.push('/prayer' as any)} />
          </View>

          <View style={{ gap: space[2] }}>
            <Text style={[isDesktop ? type.display : type.title1, { color: c.ink }]} accessibilityRole="header">Salah Tracker</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="lock-closed-outline" size={14} color={c.ink2} />
              <Text style={[type.caption, { color: c.ink2, flex: 1 }]}>
                Only you can see this. It’s never shown on your profile or used for ads.
              </Text>
            </View>
            {ready && !signedIn ? (
              <Pressable onPress={() => router.push('/(auth)/sign-in' as any)} style={{ marginTop: space[1] }}>
                <Text style={[type.caption, font(600), { color: c.goldInk }]}>Saved on this device only. Sign in to keep it across devices.</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Day */}
          <View style={[card, { padding: space[4], gap: space[3] }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton icon="chevron-back" label="Previous day" size="sm" onPress={() => setViewKey(prevKey(key))} />
              <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setViewKey(null)} accessibilityRole="button" accessibilityLabel="Go to today">
                <Text style={[type.headline, { color: c.ink }]}>{isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                {!isToday ? <Text style={[type.micro, { color: c.goldInk }]}>Back to today</Text> : null}
              </Pressable>
              <IconButton icon="chevron-forward" label="Next day" size="sm" disabled={isToday} onPress={() => setViewKey(dayKey(addDays(day, 1)) === todayKey ? null : dayKey(addDays(day, 1)))} />
            </View>

            {PRAYERS.map((p, i) => {
              const e = dayLog[p];
              const col = tone(e?.status);
              return (
                <View key={p} style={{ gap: space[2], paddingVertical: space[2], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line, opacity: excused ? 0.5 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                    <Pressable
                      onPress={() => !excused && quickCheck(p)}
                      disabled={excused}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!e && e.status !== 'missed' }}
                      accessibilityLabel={`${prayerName(p, day)}${e ? `: ${e.status.replace('_', ' ')}` : ''}`}
                      style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: col ?? 'transparent', borderWidth: col ? 0 : 1.5, borderColor: c.lineControl }}
                    >
                      {e ? <Icon name={e.status === 'missed' ? 'close' : e.status === 'late' ? 'time-outline' : e.status === 'excused' ? 'remove' : 'checkmark'} size={17} color="#fff" /> : null}
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, font(600), { color: c.ink }]}>{prayerName(p, day)}</Text>
                      {times ? <Text style={[type.caption, { color: c.ink2 }]}>{formatTime(times[p])}</Text> : null}
                    </View>
                    {e && (e.status === 'on_time' || e.status === 'late') ? (
                      <Pressable onPress={() => toggleJamaah(p)} accessibilityRole="switch" accessibilityState={{ checked: e.jamaah }} accessibilityLabel="Prayed with jamaah"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: e.jamaah ? c.seedTint : c.surfaceSoft }}>
                        <Icon name="people-outline" size={14} color={e.jamaah ? c.seed : c.ink3} />
                        <Text style={[type.micro, { color: e.jamaah ? c.seed : c.ink3 }]}>Jamaah</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {!excused ? (
                    <View style={{ flexDirection: 'row', gap: space[2], paddingLeft: 42 }}>
                      {STATUS.map(o => {
                        const on = e?.status === o.key;
                        const t = tone(o.key)!;
                        return (
                          <Pressable key={o.key} onPress={() => pick(p, o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: radius.pill,
                              backgroundColor: on ? t : 'transparent', borderWidth: 1, borderColor: on ? t : c.line }}>
                            <Icon name={o.icon} size={13} color={on ? '#fff' : c.ink2} />
                            <Text style={[type.micro, { color: on ? '#fff' : c.ink2 }]}>{o.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], borderTopWidth: 1, borderTopColor: c.line, paddingTop: space[3] }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.callout, font(600), { color: c.ink }]}>Excused day</Text>
                <Text style={[type.caption, { color: c.ink2 }]}>Doesn’t count as missed or break a streak.</Text>
              </View>
              <Switch label="Excused day" value={excused} onValueChange={(v) => setDayExcused(key, v)} tone="seed" />
            </View>
          </View>

          {/* Stats */}
          <View style={{ gap: space[3] }}>
            <SectionLabel>Last 30 days</SectionLabel>
            <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
              {[
                { label: 'On time', value: stats.pct == null ? '—' : `${stats.pct}%` },
                { label: 'Late', value: String(stats.late) },
                { label: 'Missed', value: String(stats.missed) },
                { label: 'With jamaah', value: String(stats.jamaah) },
                ...(s.streaks ? [{ label: 'Day streak', value: String(streak) }] : []),
              ].map(x => (
                <View key={x.label} style={[card, { flexGrow: 1, flexBasis: 120, padding: space[4], gap: 2 }]}>
                  <Text style={[type.title2, { color: c.ink }]}>{x.value}</Text>
                  <Text style={[type.caption, { color: c.ink2 }]}>{x.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Month */}
          <View style={[card, { padding: space[4], gap: space[3] }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton icon="chevron-back" label="Previous month" size="sm" onPress={() => setMonthOffset(m => m - 1)} />
              <Text style={[type.headline, { color: c.ink, flex: 1, textAlign: 'center' }]}>
                {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </Text>
              <IconButton icon="chevron-forward" label="Next month" size="sm" disabled={monthOffset >= 0} onPress={() => setMonthOffset(m => Math.min(0, m + 1))} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={i} style={[type.micro, { width: `${100 / 7}%` as any, textAlign: 'center', color: c.ink3, marginBottom: 4 }]}>{d}</Text>
              ))}
              {Array.from({ length: lead }).map((_, i) => <View key={`l${i}`} style={{ width: `${100 / 7}%` as any }} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = new Date(month.getFullYear(), month.getMonth(), i + 1, 12);
                const k = dayKey(d);
                const dl = log[k] ?? {};
                const future = k > todayKey;
                return (
                  <Pressable key={k} disabled={future} onPress={() => setViewKey(k === todayKey ? null : k)}
                    accessibilityLabel={d.toDateString()}
                    style={{ width: `${100 / 7}%` as any, alignItems: 'center', paddingVertical: 4, opacity: future ? 0.3 : 1 }}>
                    <View style={{ width: 36, alignItems: 'center', gap: 3, paddingVertical: 4, borderRadius: 8, backgroundColor: k === key ? c.surfaceSoft : 'transparent' }}>
                      <Text style={[type.micro, { color: k === todayKey ? c.goldInk : c.ink2 }]}>{i + 1}</Text>
                      <View style={{ flexDirection: 'row', gap: 1.5 }}>
                        {PRAYERS.map(p => (
                          <View key={p} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone(dl[p]?.status) ?? c.surfaceStrong }} />
                        ))}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3], justifyContent: 'center' }}>
              {[['On time', c.seed], ['Late', c.gold], ['Missed', c.danger], ['Excused', c.ink3], ['Not logged', c.surfaceStrong]].map(([l, col]) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col }} />
                  <Text style={[type.micro, { color: c.ink2 }]}>{l}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Make-up */}
          <View style={[card, { padding: space[4], gap: space[3] }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.headline, { color: c.ink }]}>Prayers to make up</Text>
                <Text style={[type.caption, { color: c.ink2 }]}>Missed prayers you’ve logged, plus any older ones you add.</Text>
              </View>
              <Text style={[type.title1, { color: c.ink }]}>{owed}</Text>
            </View>
            <Button label="I made one up" icon="checkmark" variant="secondary" size="md" disabled={owed === 0}
              onPress={() => updatePrayerSettings({ qadaMadeUp: s.qadaMadeUp + 1 })} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <Text style={[type.callout, { color: c.ink2, flex: 1 }]}>Older prayers owed</Text>
              <Stepper label="older prayers owed" value={s.qadaExtra} onChange={(v) => updatePrayerSettings({ qadaExtra: v })} />
            </View>
          </View>

          {/* Options + privacy */}
          <View style={[card, { padding: space[4], gap: space[4] }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.callout, font(600), { color: c.ink }]}>Show streaks</Text>
                <Text style={[type.caption, { color: c.ink2 }]}>Off by default. Count days with all five prayers logged.</Text>
              </View>
              <Switch label="Show streaks" value={s.streaks} onValueChange={(v) => updatePrayerSettings({ streaks: v })} />
            </View>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button label="Export" icon="download-outline" variant="soft" size="md" grow onPress={doExport} />
              <Button label="Delete all" icon="trash-outline" variant="danger" size="md" grow onPress={doDelete} />
            </View>
          </View>
        </View>
      </ScrollView>
    </DesktopShell>
  );
}
