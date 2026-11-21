import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { Button, TextField, Stepper } from '../../ui';
import { Card, CardTitle, Choice, PageHeader, parseClock, type SectionProps } from './kit';
import { useMasjidSettings } from './useMasjidData';
import { METHODS, type MethodKey, type PrayerKey } from '../../../lib/prayer';
import { SALAH, SALAH_LABEL, US_TIMEZONES, addDayKey, dayKeyIn, fmtClock, fmtTime, masjidDay, type IqamahRule, type MasjidSettings } from '../../../lib/masjid';
import { geocodePlace } from '../../../lib/location';
import { showToast } from '../../Toast';

export function PrayerTimesSection({ masjid, wide }: SectionProps) {
  const { c } = useDS();
  const { settings, save } = useMasjidSettings(masjid.id);
  const [draft, setDraft] = useState<MasjidSettings | null>(null);
  const [address, setAddress] = useState('');
  const [jummah, setJummah] = useState('');
  const [fixedText, setFixedText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDraft(settings);
    setAddress(settings.address ?? '');
    setJummah((settings.jummah_times ?? []).map((t) => fmtClock(t)).join(', '));
    const ft: Record<string, string> = {};
    SALAH.forEach((k) => { const r = settings.iqamah?.[k]; if (r?.mode === 'fixed') ft[k] = fmtClock(r.time); });
    setFixedText(ft);
  }, [settings]);

  const preview = useMemo(() => {
    if (!draft) return [];
    const today = dayKeyIn(new Date(), draft.timezone);
    return [0, 1, 2].map((i) => masjidDay(draft, addDayKey(today, i))).filter(Boolean) as NonNullable<ReturnType<typeof masjidDay>>[];
  }, [draft]);

  if (!draft) return <PageHeader title="Prayer times" />;
  const set = (patch: Partial<MasjidSettings>) => setDraft({ ...draft, ...patch });
  const setRule = (k: PrayerKey, r: IqamahRule) => set({ iqamah: { ...draft.iqamah, [k]: r } });

  const locate = async () => {
    if (!address.trim()) return;
    setLocating(true);
    const hit = await geocodePlace(address).catch(() => null);
    setLocating(false);
    if (!hit) { showToast("Couldn't find that address. Try street, city and state."); return; }
    set({ address: address.trim(), lat: hit.lat, lon: hit.lon });
    showToast('Location found');
  };

  const onSave = async () => {
    const times = jummah.split(',').map((t) => t.trim()).filter(Boolean).map(parseClock);
    if (times.some((t) => !t)) { showToast('Check the Jumu\'ah times, like "1:30 PM, 2:30 PM".'); return; }
    const iq = { ...draft.iqamah };
    for (const k of SALAH) {
      if (iq[k]?.mode === 'fixed') {
        const t = parseClock(fixedText[k] ?? '');
        if (!t) { showToast(`Check the ${SALAH_LABEL[k]} iqamah time.`); return; }
        iq[k] = { mode: 'fixed', time: t };
      }
    }
    setBusy(true);
    const err = await save({ ...draft, iqamah: iq, jummah_times: times as string[], address: address.trim() || draft.address });
    setBusy(false);
    showToast(err ? err.message : 'Saved. Screens update within a minute.');
  };

  const tz = draft.timezone;
  return (
    <>
      <PageHeader title="Prayer times" sub="Athan times are calculated from your location. You set when iqamah is." right={<Button label="Save" size="md" onPress={onSave} loading={busy} />} />

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[5], alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1.2 : undefined, gap: space[5], alignSelf: 'stretch' }}>
          <Card>
            <CardTitle>Location</CardTitle>
            <TextField label="Masjid address" value={address} onChangeText={setAddress} placeholder="Street, city, state" onSubmitEditing={locate} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
              <Button label="Find on map" size="sm" variant="secondary" onPress={locate} loading={locating} />
              <Text style={[type.caption, { color: draft.lat != null ? c.seed : c.ink2 }]}>
                {draft.lat != null ? `Set: ${draft.lat.toFixed(4)}, ${draft.lon!.toFixed(4)}` : 'Not set yet'}
              </Text>
            </View>
            <Text style={[type.caption, font(600), { color: c.ink2, marginTop: space[2] }]}>Timezone</Text>
            <Choice label="Timezone" options={US_TIMEZONES.map((t) => ({ value: t.id, label: t.label }))} value={tz} onChange={(v) => set({ timezone: v })} />
          </Card>

          <Card>
            <CardTitle>Calculation</CardTitle>
            <Choice label="Method" value={draft.calc_method}
              options={(Object.keys(METHODS) as MethodKey[]).slice(0, 9).map((k) => ({ value: k, label: METHODS[k].label }))}
              onChange={(v) => set({ calc_method: v })} />
            <Text style={[type.caption, font(600), { color: c.ink2, marginTop: space[2] }]}>Asr</Text>
            <Choice label="Asr" value={draft.madhab} options={[{ value: 'shafi', label: 'Standard (Shafi, Maliki, Hanbali)' }, { value: 'hanafi', label: 'Hanafi' }]} onChange={(v) => set({ madhab: v })} />
          </Card>

          <Card>
            <CardTitle>Iqamah</CardTitle>
            <Text style={[type.caption, { color: c.ink2 }]}>Minutes after the athan, or a fixed time.</Text>
            {SALAH.map((k, i) => {
              const r = draft.iqamah?.[k] ?? { mode: 'offset', minutes: 15 };
              return (
                <View key={k} style={{ gap: space[2], paddingVertical: space[3], borderBottomWidth: i === SALAH.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
                    <Text style={[type.body, font(700), { color: c.ink, width: 80 }]}>{SALAH_LABEL[k]}</Text>
                    <Choice label={`${SALAH_LABEL[k]} iqamah rule`} value={r.mode}
                      options={[{ value: 'offset', label: 'After athan' }, { value: 'fixed', label: 'Fixed time' }]}
                      onChange={(m) => setRule(k, m === 'offset' ? { mode: 'offset', minutes: (r as any).minutes ?? 15 } : { mode: 'fixed', time: (r as any).time ?? '13:30' })} />
                  </View>
                  {r.mode === 'offset' ? (
                    <Stepper label={`${SALAH_LABEL[k]} minutes after athan`} value={r.minutes} min={0} max={90} onChange={(n) => setRule(k, { mode: 'offset', minutes: n })} />
                  ) : (
                    <TextField label="Iqamah time" value={fixedText[k] ?? ''} onChangeText={(t) => setFixedText({ ...fixedText, [k]: t })} placeholder="1:30 PM" containerStyle={{ maxWidth: 200 }} />
                  )}
                </View>
              );
            })}
            <TextField label="Jumu'ah times" value={jummah} onChangeText={setJummah} placeholder="1:30 PM, 2:30 PM" help="Separate more than one khutbah with commas." />
          </Card>

          <Card>
            <CardTitle>On your screens</CardTitle>
            <Text style={[type.caption, font(600), { color: c.ink2 }]}>Countdown starts this many minutes before each iqamah</Text>
            <Choice label="Countdown" value={draft.countdown_minutes} options={[0, 10, 15, 20, 30, 45].map((n) => ({ value: n, label: n ? `${n} min` : 'Off' }))} onChange={(n) => set({ countdown_minutes: n })} />
            <Text style={[type.caption, font(600), { color: c.ink2, marginTop: space[2] }]}>Hijri date adjustment</Text>
            <Choice label="Hijri adjustment" value={draft.hijri_offset} options={[-2, -1, 0, 1, 2].map((n) => ({ value: n, label: n > 0 ? `+${n}` : String(n) }))} onChange={(n) => set({ hijri_offset: n })} />
            <TextField label="Ticker (scrolls along the bottom)" value={draft.ticker ?? ''} onChangeText={(t) => set({ ticker: t })} placeholder="Please park in marked spaces only" />
          </Card>
        </View>

        <Card style={{ flex: wide ? 1 : undefined, alignSelf: 'stretch' }}>
          <CardTitle>Preview</CardTitle>
          {preview.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>Set the location to see times.</Text> : null}
          {preview.map((d) => (
            <View key={d.key} style={{ gap: 2, marginBottom: space[3] }}>
              <Text style={[type.caption, font(700), { color: c.ink2 }]}>{new Date(d.key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase()}</Text>
              <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text style={[type.micro, { color: c.ink3, flex: 1 }]}>SALAH</Text>
                <Text style={[type.micro, { color: c.ink3, width: 80 }]}>ATHAN</Text>
                <Text style={[type.micro, { color: c.ink3, width: 110 }]}>IQAMAH</Text>
              </View>
              {d.rows.map((r) => (
                <View key={r.key} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <Text style={[type.callout, font(600), { color: c.ink, flex: 1 }]}>{r.name}</Text>
                  <Text style={[type.callout, { color: c.ink2, width: 80 }]}>{fmtTime(r.athan, tz, false)}</Text>
                  <Text style={[type.callout, font(700), { color: c.ink, width: 110 }]}>{r.jummah ? r.jummah.map((t) => fmtClock(t, false)).join(' · ') : fmtTime(r.iqamah, tz, false)}</Text>
                </View>
              ))}
            </View>
          ))}
        </Card>
      </View>
    </>
  );
}
