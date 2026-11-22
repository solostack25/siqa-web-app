// Dashboard → Events: the list of an organization's events, and the editor for one event.
// Used by both the Organization and Masjid spaces.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Image, Platform, Linking, ScrollView } from 'react-native';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { Button, Chip } from '../../ui';
import { Card, Empty, PageHeader, Tag } from '../../masjid/admin/kit';
import { Icon } from '../../Icon';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { confirmDialog } from '../../../lib/dialogs';
import { STATUS_LABEL, eventUrl, usd, whenText, type EventRow, type EventStatus, type Segment, type TicketType } from '../../../lib/events';
import { BasicsTab } from './Basics';
import { TicketsTab } from './Tickets';
import { ProgramTab } from './Program';
import { GivingTab } from './Giving';
import { DevicesTab } from './Devices';
import { GuestsTab } from './Guests';
import { LiveControl } from './LiveControl';

type ListRow = { id: string; slug: string; title: string; kind: string; status: EventStatus; starts_at: string | null; venue: string | null; goal_cents: number; sold: number; raised_cents: number };

const statusTone = (s: EventStatus) => (s === 'live' ? 'danger' : s === 'published' ? 'seed' : s === 'ended' ? 'soft' : 'gold') as any;

export function EventsSection({ orgId, wide }: { orgId: string; wide: boolean }) {
  const { c } = useDS();
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('event');
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('org_events', { p_org: orgId });
    if (error) showToast(error.message);
    setRows((data as ListRow[]) ?? []);
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  // Keep ?event= in the address so a refresh stays on the same event.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    if (open) u.searchParams.set('event', open); else u.searchParams.delete('event');
    window.history.replaceState(window.history.state, '', u.toString());
  }, [open]);

  const create = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const starts = new Date(); starts.setDate(starts.getDate() + 30); starts.setHours(18, 30, 0, 0);
    const doors = new Date(starts.getTime() - 30 * 60000);
    const { data: ev, error } = await supabase.from('events').insert({
      org_id: orgId, title: 'Annual Banquet', created_by: user?.id ?? null, starts_at: starts.toISOString(), doors_at: doors.toISOString(),
      goal_cents: 10_000_000, ladder: [10_000_000, 5_000_000, 2_500_000, 1_000_000, 500_000, 100_000].map((a) => ({ amount_cents: a })),
    }).select('id').single();
    if (error || !ev) { setBusy(false); showToast(error?.message ?? 'Could not create the event.'); return; }
    // A starting point people can edit: common ticket types and a typical banquet program.
    await Promise.all([
      supabase.from('event_ticket_types').insert([
        { event_id: ev.id, name: 'Individual', price_cents: 10000, sort: 1 },
        { event_id: ev.id, name: 'Table of 10', price_cents: 100000, seats: 10, sort: 2, description: 'Reserved table for your family or friends.' },
        { event_id: ev.id, name: 'Watch online', price_cents: 2500, kind: 'online', sort: 3, description: 'Join from home. The ticket counts as a donation.' },
      ]),
      supabase.from('event_segments').insert([
        { event_id: ev.id, sort: 1, title: 'Welcome', kind: 'welcome', minutes: 5 },
        { event_id: ev.id, sort: 2, title: 'Quran recitation', kind: 'recitation', minutes: 5 },
        { event_id: ev.id, sort: 3, title: 'Our work this year', kind: 'video', minutes: 4 },
        { event_id: ev.id, sort: 4, title: 'Keynote', kind: 'talk', minutes: 20 },
        { event_id: ev.id, sort: 5, title: 'Dinner', kind: 'meal', minutes: 30 },
        { event_id: ev.id, sort: 6, title: 'Fundraising appeal', kind: 'appeal', minutes: 30 },
        { event_id: ev.id, sort: 7, title: 'Closing dua', kind: 'other', minutes: 5 },
      ]),
    ]);
    setBusy(false);
    setOpen(ev.id);
    load();
  };

  if (open) return <EventEditor eventId={open} wide={wide} onBack={() => { setOpen(null); load(); }} />;

  return (
    <>
      <PageHeader title="Events" sub="Banquets and fundraising dinners: tickets, the program, the appeal, and every screen in the room."
        right={<Button label="New event" icon="add" size="md" onPress={create} loading={busy} />} />
      {rows && rows.length === 0 ? (
        <Empty icon="sparkles-outline" title="Plan your first banquet" sub="Sell tickets online, run the night from one phone, and show giving live on the big screen. We'll start you with a sample program you can change.">
          <Button label="Create an event" icon="add" size="md" onPress={create} loading={busy} style={{ marginTop: space[3] }} />
        </Empty>
      ) : null}
      <View style={{ gap: space[3] }}>
        {(rows ?? []).map((r) => {
          const pct = r.goal_cents ? Math.min(100, Math.round((r.raised_cents / r.goal_cents) * 100)) : 0;
          return (
            <Pressable key={r.id} onPress={() => setOpen(r.id)} accessibilityRole="button" accessibilityLabel={`Open ${r.title}`}>
              {({ pressed }) => (
                <Card style={{ opacity: pressed ? 0.9 : 1 }}>
                  <View style={{ flexDirection: wide ? 'row' : 'column', gap: space[4], alignItems: wide ? 'center' : 'stretch' }}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                        <Tag label={STATUS_LABEL[r.status]} tone={statusTone(r.status)} />
                      </View>
                      <Text style={[type.title2, { color: c.ink }]}>{r.title}</Text>
                      <Text style={[type.callout, { color: c.ink2 }]}>{whenText(r.starts_at)}{r.venue ? ` · ${r.venue}` : ''}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: space[5] }}>
                      <Mini label="Guests" value={String(r.sold)} />
                      <Mini label="Raised" value={usd(r.raised_cents)} sub={r.goal_cents ? `${pct}% of ${usd(r.goal_cents)}` : undefined} />
                    </View>
                    {wide ? <Icon name="chevron-forward" size={18} color={c.ink3} /> : null}
                  </View>
                </Card>
              )}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { c } = useDS();
  return (
    <View style={{ gap: 2, minWidth: 80 }}>
      <Text style={[type.micro, { color: c.ink2 }]}>{label}</Text>
      <Text style={[type.headline, { color: c.ink }]}>{value}</Text>
      {sub ? <Text style={[type.micro, font(500), { color: c.ink3 }]}>{sub}</Text> : null}
    </View>
  );
}

// ── Editor ─────────────────────────────────────────────────────────────
export type EventData = { event: EventRow; tickets: TicketType[]; segments: (Segment & { sort: number })[] };
type Tab = 'basics' | 'tickets' | 'program' | 'giving' | 'devices' | 'guests' | 'live';

export function useEventData(eventId: string) {
  const [data, setData] = useState<EventData | null>(null);
  const reload = useCallback(async () => {
    const [e, t, s] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('event_ticket_types').select('*').eq('event_id', eventId).order('sort').order('price_cents', { ascending: false }),
      supabase.from('event_segments').select('*').eq('event_id', eventId).order('sort').order('created_at'),
    ]);
    if (e.error || !e.data) { showToast(e.error?.message ?? 'Event not found'); return; }
    setData({ event: e.data as EventRow, tickets: (t.data as TicketType[]) ?? [], segments: (s.data as any[]) ?? [] });
  }, [eventId]);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload, setData };
}

function EventEditor({ eventId, wide, onBack }: { eventId: string; wide: boolean; onBack: () => void }) {
  const { c } = useDS();
  const { data, reload } = useEventData(eventId);
  const [tab, setTab] = useState<Tab>('basics');
  useEffect(() => { if (data?.event.status === 'live') setTab((t) => (t === 'basics' ? 'live' : t)); }, [data?.event.status]);

  if (!data) return <Text style={[type.callout, { color: c.ink2 }]}>Loading…</Text>;
  const ev = data.event;

  const setStatus = async (status: EventStatus) => {
    if (status === 'published') {
      if (!ev.starts_at) { showToast('Add the date first (Basics).'); setTab('basics'); return; }
      if (!data.tickets.some((t) => t.active)) { showToast('Add at least one ticket first.'); setTab('tickets'); return; }
    }
    if (status === 'draft' && !(await confirmDialog('Take the event off sale?', 'The event page stops working until you publish again. Tickets already sold stay valid.', 'Unpublish'))) return;
    const { error } = await supabase.from('events').update({ status }).eq('id', ev.id);
    if (error) { showToast(error.message); return; }
    showToast(status === 'published' ? 'Published. Your event page is live and tickets are on sale.' : 'Back to draft.');
    reload();
  };
  const remove = async () => {
    if (!(await confirmDialog(`Delete “${ev.title}”?`, 'This removes the event, its tickets, program, devices and gift records. This can\'t be undone.', 'Delete event'))) return;
    const { error } = await supabase.from('events').delete().eq('id', ev.id);
    if (error) { showToast(error.message); return; }
    onBack();
  };
  const openPage = () => {
    const url = eventUrl(ev.slug);
    if (Platform.OS === 'web') window.open(url, '_blank'); else Linking.openURL(url);
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'basics', label: 'Basics' }, { value: 'tickets', label: 'Tickets' }, { value: 'program', label: 'Program' },
    { value: 'giving', label: 'Giving' }, { value: 'devices', label: 'Devices' }, { value: 'guests', label: 'Guests' },
    { value: 'live', label: ev.status === 'live' ? '● Live' : 'Run the night' },
  ];

  return (
    <View style={{ gap: space[5] }}>
      <Pressable onPress={onBack} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }} hitSlop={8}>
        <Icon name="chevron-back" size={16} color={c.ink2} />
        <Text style={[type.subhead, font(600), { color: c.ink2 }]}>All events</Text>
      </Pressable>
      <PageHeader title={ev.title} sub={`${whenText(ev.starts_at)}${ev.venue ? ` · ${ev.venue}` : ''}`}
        right={<>
          <Tag label={STATUS_LABEL[ev.status]} tone={statusTone(ev.status)} />
          {ev.status === 'draft' ? <Button label="Publish & open sales" size="md" onPress={() => setStatus('published')} />
            : ev.status === 'published' ? <Button label="Unpublish" size="md" variant="secondary" onPress={() => setStatus('draft')} /> : null}
          {ev.status !== 'draft' ? <Button label="Event page" icon="open-outline" size="md" variant="secondary" onPress={openPage} /> : null}
        </>} />
      {ev.status === 'draft' ? (
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center', padding: space[4], borderRadius: radius.lg, backgroundColor: c.goldTint }}>
          <Icon name="information-circle-outline" size={20} color={c.goldInk} />
          <Text style={[type.callout, { color: c.goldInk, flex: 1 }]}>Draft — only your team can see this. Fill in Basics, Tickets and Program, then publish to open ticket sales.</Text>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: 2 }} accessibilityRole="tablist">
        {tabs.map((t) => <Chip key={t.value} label={t.label} selected={tab === t.value} onPress={() => setTab(t.value)} />)}
      </ScrollView>
      {tab === 'basics' ? <BasicsTab key={`b${ev.id}`} data={data} reload={reload} wide={wide} onDelete={remove} /> : null}
      {tab === 'tickets' ? <TicketsTab data={data} reload={reload} wide={wide} /> : null}
      {tab === 'program' ? <ProgramTab data={data} reload={reload} wide={wide} /> : null}
      {tab === 'giving' ? <GivingTab key={`g${ev.id}`} data={data} reload={reload} wide={wide} /> : null}
      {tab === 'devices' ? <DevicesTab data={data} wide={wide} /> : null}
      {tab === 'guests' ? <GuestsTab data={data} wide={wide} /> : null}
      {tab === 'live' ? <LiveControl data={data} reload={reload} wide={wide} /> : null}
    </View>
  );
}

export function EventCover({ url, height = 160 }: { url: string | null; height?: number }) {
  const { c } = useDS();
  if (!url) return null;
  return <Image source={{ uri: url }} style={{ width: '100%', height, borderRadius: radius.lg, backgroundColor: c.bgSunk }} resizeMode="cover" />;
}
