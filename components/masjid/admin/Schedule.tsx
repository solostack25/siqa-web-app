import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button, IconButton, Switch, TextField, BottomSheet } from '../../ui';
import { Card, Choice, DayPicker, PageHeader, parseClock, type SectionProps } from './kit';
import { useMasjidEvents, useMasjidSettings, useSeeds } from './useMasjidData';
import { supabase } from '../../../lib/supabase';
import { EVENT_KIND_LABEL, addDayKey, dayKeyIn, dowOfKey, fmtClock, fmtTime, masjidDay, occurrences, zonedToDate, type EventKind, type MasjidEvent } from '../../../lib/masjid';
import { confirmDialog } from '../../../lib/dialogs';
import { showToast } from '../../Toast';

type Draft = Omit<MasjidEvent, 'id'> & { id?: string; timeText: string };
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function blank(orgId: string, dateKey: string): Draft {
  return {
    org_id: orgId, kind: 'halaqa', title: '', teacher: '', description: '', room: '', start_date: dateKey, start_time: '20:00',
    timeText: '8:00 PM', duration_min: 60, repeat_days: [dowOfKey(dateKey)], end_date: null, show_on_screens: true, countdown_min: 30,
    live_on_siqa: false, registration: 'none', price_text: '', fundraiser_id: null, cancelled_dates: [],
  };
}

export function ScheduleSection({ masjid, wide }: SectionProps) {
  const { c, shadow } = useDS();
  const { settings } = useMasjidSettings(masjid.id);
  const { events, reload } = useMasjidEvents(masjid.id);
  const { seeds } = useSeeds(masjid.id);
  const tz = settings?.timezone ?? 'America/Chicago';
  const todayKey = dayKeyIn(new Date(), tz);
  const [weekOffset, setWeekOffset] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const weekStart = addDayKey(addDayKey(todayKey, -dowOfKey(todayKey)), weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDayKey(weekStart, i));

  const byDay = useMemo(() => {
    const occ = occurrences(events ?? [], weekStart, 7, tz);
    return weekDays.map((key) => {
      const items: { at: Date; label: string; sub?: string; kind: 'salah' | EventKind; event?: MasjidEvent; seed?: boolean; live?: boolean }[] = [];
      const day = settings ? masjidDay(settings, key) : null;
      day?.rows.forEach((r) => items.push({ at: r.iqamah, label: r.name, kind: 'salah' }));
      if (day && day.dow === 5) {
        const [y, m, dd] = key.split('-').map(Number);
        settings!.jummah_times.slice(1).forEach((t, i) => {
          const [h, mi] = t.split(':').map(Number);
          items.push({ at: zonedToDate(y, m, dd, h, mi, tz), label: `Jumu'ah ${i + 2}`, kind: 'salah' });
        });
      }
      occ.filter((o) => o.dayKey === key).forEach((o) => items.push({ at: o.start, label: o.event.title, sub: o.event.teacher || o.event.room || undefined, kind: o.event.kind, event: o.event, seed: !!o.event.fundraiser_id, live: o.event.live_on_siqa }));
      return { key, items: items.sort((a, b) => a.at.getTime() - b.at.getTime()) };
    });
  }, [events, settings, weekStart, tz]);

  const open = (e?: MasjidEvent, dayKey?: string) => {
    if (e) setDraft({ ...e, timeText: fmtClock(e.start_time), teacher: e.teacher ?? '', room: e.room ?? '', price_text: e.price_text ?? '', description: e.description ?? '' });
    else setDraft(blank(masjid.id, dayKey ?? todayKey));
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) { showToast('Give it a title.'); return; }
    const t = parseClock(draft.timeText);
    if (!t) { showToast('Check the start time, like "8:00 PM".'); return; }
    setBusy(true);
    const { id, timeText, ...rest } = draft;
    const row = {
      ...rest, start_time: t, title: rest.title.trim(), teacher: rest.teacher?.trim() || null, room: rest.room?.trim() || null,
      description: rest.description?.trim() || null, price_text: rest.registration === 'paid' ? (rest.price_text?.trim() || null) : null,
      org_id: masjid.id, updated_at: new Date().toISOString(),
    };
    const { data: { user } } = await supabase.auth.getUser();
    const res = id
      ? await supabase.from('masjid_events').update(row).eq('id', id)
      : await supabase.from('masjid_events').insert({ ...row, created_by: user?.id ?? null });
    setBusy(false);
    if (res.error) { showToast(res.error.message); return; }
    setDraft(null);
    reload();
    showToast('Saved. It shows on your screens within a minute.');
  };

  const remove = async () => {
    if (!draft?.id) return;
    if (!(await confirmDialog('Delete this event?', 'It comes off your schedule and screens. This can\'t be undone.', 'Delete'))) return;
    const { error } = await supabase.from('masjid_events').delete().eq('id', draft.id);
    if (error) { showToast(error.message); return; }
    setDraft(null); reload();
  };

  const kindStyle = (k: 'salah' | EventKind) => k === 'salah' ? { bg: c.surfaceSoft, fg: c.ink2, border: 'transparent' }
    : k === 'halaqa' ? { bg: c.primary, fg: c.onPrimary, border: 'transparent' }
    : k === 'khatirah' ? { bg: c.goldTint, fg: c.goldInk, border: c.gold }
    : { bg: c.seedTint, fg: c.seed, border: c.seed };

  const editor = draft ? (
    <View style={{ gap: space[4] }}>
      <Choice label="Type" value={draft.kind} options={(Object.keys(EVENT_KIND_LABEL) as EventKind[]).map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }))} onChange={(k) => setDraft({ ...draft, kind: k })} />
      <TextField label="Title" value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder="Tafsir of Surah Al-Kahf" />
      <TextField label="Teacher or speaker" value={draft.teacher ?? ''} onChangeText={(t) => setDraft({ ...draft, teacher: t })} placeholder="Optional" />
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <TextField label="Date" value={draft.start_date} onChangeText={(t) => setDraft({ ...draft, start_date: t })} placeholder="2026-11-26" containerStyle={{ flex: 1.2 }} />
        <TextField label="Starts" value={draft.timeText} onChangeText={(t) => setDraft({ ...draft, timeText: t })} placeholder="8:00 PM" containerStyle={{ flex: 1 }} />
      </View>
      <Choice label="Length" value={draft.duration_min} options={[15, 30, 45, 60, 90, 120].map((n) => ({ value: n, label: n < 60 ? `${n} min` : `${n / 60}${n % 60 ? '.5' : ''} h` }))} onChange={(n) => setDraft({ ...draft, duration_min: n })} />
      <View style={{ gap: space[2] }}>
        <Text style={[type.caption, font(600), { color: c.ink2 }]}>Repeats every week on</Text>
        <DayPicker value={draft.repeat_days} onChange={(v) => setDraft({ ...draft, repeat_days: v })} />
        <Text style={[type.caption, { color: c.ink3 }]}>{draft.repeat_days.length ? 'Weekly, starting on the date above.' : 'One time only, on the date above.'}</Text>
      </View>
      <TextField label="Room" value={draft.room ?? ''} onChangeText={(t) => setDraft({ ...draft, room: t })} placeholder="Main hall, Sisters' hall…" />
      <View>
        <Row label="Show on screens"><Switch label="Show on screens" value={!!draft.show_on_screens} onValueChange={(v) => setDraft({ ...draft, show_on_screens: v })} /></Row>
        {draft.show_on_screens ? (
          <View style={{ paddingVertical: space[2], gap: space[2] }}>
            <Text style={[type.caption, font(600), { color: c.ink2 }]}>Countdown on screens starts</Text>
            <Choice label="Countdown" value={draft.countdown_min} options={[0, 10, 15, 30, 45, 60].map((n) => ({ value: n, label: n ? `${n} min before` : 'No countdown' }))} onChange={(n) => setDraft({ ...draft, countdown_min: n })} />
          </View>
        ) : null}
        <Row label="Live on Siqa" sub="Interactive: questions and PDFs, run from Siqa Studio"><Switch label="Live on Siqa" value={draft.live_on_siqa} onValueChange={(v) => setDraft({ ...draft, live_on_siqa: v })} /></Row>
      </View>
      <View style={{ gap: space[2] }}>
        <Text style={[type.caption, font(600), { color: c.ink2 }]}>Registration</Text>
        <Choice label="Registration" value={draft.registration} options={[{ value: 'none', label: 'None' }, { value: 'free', label: 'Free' }, { value: 'paid', label: 'Paid' }]} onChange={(v) => setDraft({ ...draft, registration: v })} />
        {draft.registration === 'paid' ? <TextField label="Price" value={draft.price_text ?? ''} onChangeText={(t) => setDraft({ ...draft, price_text: t })} placeholder="$60 for 6 weeks" /> : null}
      </View>
      <View style={{ gap: space[2] }}>
        <Text style={[type.caption, font(600), { color: c.ink2 }]}>Attach a Seed</Text>
        <Choice label="Seed" value={draft.fundraiser_id ?? ''} options={[{ value: '', label: 'None' }, ...(seeds ?? []).filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: s.title }))]} onChange={(v) => setDraft({ ...draft, fundraiser_id: v || null })} />
        <Text style={[type.caption, { color: c.ink3 }]}>Shows a Donate button during the live and the Seed's QR code on screens.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {draft.id ? <Button label="Delete" variant="danger" size="md" onPress={remove} /> : null}
        <Button label={draft.id ? 'Save event' : 'Add event'} size="md" onPress={save} loading={busy} grow />
      </View>
    </View>
  ) : null;

  const week = (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      {wide ? (
        <View style={{ flexDirection: 'row' }}>
          {byDay.map((d, i) => {
            const isToday = d.key === todayKey;
            return (
              <View key={d.key} style={{ flex: 1, minWidth: 0, borderRightWidth: i === 6 ? 0 : 1, borderRightColor: c.line, backgroundColor: isToday ? c.goldTint : undefined }}>
                <Pressable onPress={() => open(undefined, d.key)} accessibilityRole="button" accessibilityLabel={`Add on ${d.key}`} style={{ padding: space[3], borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[type.micro, { color: isToday ? c.ink : c.ink2 }]}>{DAYS[i]} {Number(d.key.slice(8))}</Text>
                  <Text style={[type.micro, { color: c.ink3 }]}>+</Text>
                </Pressable>
                <View style={{ padding: 6, gap: 5, minHeight: 420 }}>
                  {d.items.map((it, j) => {
                    const s = kindStyle(it.kind);
                    const editing = draft?.id && it.event?.id === draft.id;
                    return (
                      <Pressable key={j} disabled={!it.event} onPress={() => it.event && open(it.event)} accessibilityRole={it.event ? 'button' : undefined}
                        style={{ borderRadius: 8, padding: 6, backgroundColor: s.bg, borderWidth: it.kind === 'khatirah' || it.kind === 'class' || it.kind === 'event' ? 1.5 : 0, borderColor: s.border, outlineWidth: editing ? 2 : 0, outlineColor: c.gold, outlineStyle: 'solid', outlineOffset: 2 } as any}>
                        <Text style={[type.micro, { color: s.fg }]} numberOfLines={1}>{fmtTime(it.at, tz, false)} {it.label}</Text>
                        {it.sub || it.live || it.seed ? <Text style={[{ fontSize: 11, lineHeight: 14 }, font(500), { color: s.fg }]} numberOfLines={1}>{[it.live ? 'Live' : null, it.seed ? 'Seed' : null, it.sub].filter(Boolean).join(' · ')}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ padding: space[4], gap: space[4] }}>
          {byDay.map((d, i) => (
            <View key={d.key} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[type.caption, font(700), { color: d.key === todayKey ? c.goldInk : c.ink2 }]}>{DAYS[i]} {Number(d.key.slice(8))}{d.key === todayKey ? ' · TODAY' : ''}</Text>
                <Pressable onPress={() => open(undefined, d.key)} accessibilityRole="button" hitSlop={8}><Text style={[type.caption, font(600), { color: c.ink }]}>Add</Text></Pressable>
              </View>
              {d.items.filter((it) => it.kind !== 'salah').length === 0 ? <Text style={[type.caption, { color: c.ink3 }]}>Salah only</Text> : null}
              {d.items.filter((it) => it.kind !== 'salah').map((it, j) => {
                const s = kindStyle(it.kind);
                return (
                  <Pressable key={j} onPress={() => it.event && open(it.event)} accessibilityRole="button" style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', padding: space[3], borderRadius: 12, backgroundColor: s.bg }}>
                    <Text style={[type.subhead, font(700), { color: s.fg, width: 70 }]}>{fmtTime(it.at, tz, false)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.subhead, font(600), { color: s.fg }]} numberOfLines={1}>{it.label}</Text>
                      {it.sub ? <Text style={[type.caption, { color: s.fg }]} numberOfLines={1}>{it.sub}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Schedule"
        sub="Everything here shows on your page and your screens."
        right={<>
          <IconButton icon="chevron-back" label="Previous week" variant="raised" onPress={() => setWeekOffset(weekOffset - 1)} />
          <Pressable onPress={() => setWeekOffset(0)} accessibilityRole="button" style={{ height: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
            <Text style={[type.subhead, font(700), { color: c.ink }]}>{weekLabel(weekStart)}</Text>
          </Pressable>
          <IconButton icon="chevron-forward" label="Next week" variant="raised" onPress={() => setWeekOffset(weekOffset + 1)} />
          <Button label="Add event" icon="add" size="md" onPress={() => open()} />
        </>}
      />
      <View style={{ flexDirection: 'row', gap: space[4], flexWrap: 'wrap' }}>
        {([['Salah (from Prayer times)', c.surfaceStrong], ['Halaqa', c.primary], ['Khatirah', c.goldTint], ['Class or event', c.seedTint]] as const).map(([l, col]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: col }} />
            <Text style={[type.caption, { color: c.ink2 }]}>{l}</Text>
          </View>
        ))}
      </View>
      {wide && draft ? (
        <View style={{ flexDirection: 'row', gap: space[5], alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{week}</View>
          <Card style={[{ width: 400 }, shadow('raised')]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[type.title2, { color: c.ink }]}>{draft.id ? 'Edit event' : 'New event'}</Text>
              <IconButton icon="close" label="Close" variant="soft" size="sm" onPress={() => setDraft(null)} />
            </View>
            <ScrollView style={{ maxHeight: 760 }}>{editor}</ScrollView>
          </Card>
        </View>
      ) : week}
      <Text style={[type.caption, { color: c.ink2 }]}>Salah times fill in from Prayer times. Change iqamah there and the schedule and screens update.</Text>
      {!wide ? <BottomSheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit event' : 'New event'}>{editor}</BottomSheet> : null}
    </>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, font(500), { color: c.ink }]}>{label}</Text>
        {sub ? <Text style={[type.caption, { color: c.ink2 }]}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function weekLabel(startKey: string) {
  const end = addDayKey(startKey, 6);
  const f = (k: string) => new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(startKey)} – ${f(end)}`;
}
