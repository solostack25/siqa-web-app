// Event editor → Guests: everyone with a ticket, check-in status, table numbers, and a CSV download.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { BottomSheet, Button, TextField } from '../../ui';
import { Card, CardTitle, Tag } from '../../masjid/admin/kit';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { teamAct, usd } from '../../../lib/events';
import { Stat } from '../fields';
import type { EventData } from './EventsSection';

type Attendee = {
  id: string; name: string | null; email: string | null; table_label: string | null; diet: string | null; code: string; kind: string;
  checked_in_at: string | null; ticket_type_id: string | null; order_id: string | null;
};
type Order = { id: string; buyer_name: string | null; buyer_email: string | null; total_cents: number; gift_cents: number; status: string; test_mode: boolean; created_at: string; source: string };

export function GuestsTab({ data, wide }: { data: EventData; wide: boolean }) {
  const { c } = useDS();
  const ev = data.event;
  const [people, setPeople] = useState<Attendee[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Attendee | null>(null);
  const [adding, setAdding] = useState<{ name: string; email: string; table: string } | null>(null);

  const load = useCallback(async () => {
    const [a, o] = await Promise.all([
      supabase.from('event_attendees').select('*').eq('event_id', ev.id).order('created_at'),
      supabase.from('event_orders').select('id, buyer_name, buyer_email, total_cents, gift_cents, status, test_mode, created_at, source').eq('event_id', ev.id).eq('status', 'paid'),
    ]);
    setPeople((a.data as Attendee[]) ?? []);
    setOrders((o.data as Order[]) ?? []);
  }, [ev.id]);
  useEffect(() => { load(); }, [load]);

  const ticketName = (id: string | null) => data.tickets.find((t) => t.id === id)?.name ?? 'Added at the desk';
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (people ?? []).filter((p) => !s || [p.name, p.email, p.code, p.table_label].some((x) => x?.toLowerCase().includes(s)));
  }, [people, q]);
  const inPerson = (people ?? []).filter((p) => p.kind === 'in_person');
  const checked = inPerson.filter((p) => p.checked_in_at).length;
  const sales = orders.reduce((a, o) => a + o.total_cents - o.gift_cents, 0);

  const saveEdit = async () => {
    if (!edit) return;
    const { error } = await supabase.from('event_attendees').update({ name: edit.name?.trim() || null, email: edit.email?.trim() || null, table_label: edit.table_label?.trim() || null, diet: edit.diet?.trim() || null }).eq('id', edit.id);
    if (error) { showToast(error.message); return; }
    setEdit(null); load();
  };
  const toggleIn = async (p: Attendee) => {
    try { await teamAct(ev.id, p.checked_in_at ? 'undo_check_in' : 'check_in', { attendee_id: p.id }); load(); } catch (e: any) { showToast(e.message); }
  };
  const add = async () => {
    if (!adding?.name.trim()) { showToast('Enter a name.'); return; }
    try {
      await teamAct(ev.id, 'add_guest', { name: adding.name, email: adding.email, table_label: adding.table, check_in: false });
      setAdding(null); load();
    } catch (e: any) { showToast(e.message); }
  };
  const csv = () => {
    if (Platform.OS !== 'web') return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Name', 'Email', 'Ticket', 'Table', 'Dietary', 'Code', 'Kind', 'Checked in'],
      ...(people ?? []).map((p) => [p.name, p.email, ticketName(p.ticket_type_id), p.table_label, p.diet, p.code, p.kind === 'online' ? 'Online' : 'In person', p.checked_in_at ? new Date(p.checked_in_at).toLocaleString() : ''])];
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ev.title.replace(/[^\w]+/g, '-')}-guests.csv`;
    a.click();
  };

  return (
    <View style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
        <Stat label="Guests" value={String(inPerson.length)} sub={`${(people ?? []).length - inPerson.length} online`} />
        <Stat label="Checked in" value={`${checked}`} sub={inPerson.length ? `${Math.round((checked / inPerson.length) * 100)}%` : undefined} />
        <Stat label="Ticket sales" value={usd(sales)} sub={`${orders.length} orders`} />
      </View>
      <Card>
        <CardTitle action="Add guest" onAction={() => setAdding({ name: '', email: '', table: '' })}>Guest list</CardTitle>
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          <TextField value={q} onChangeText={setQ} placeholder="Search name, email, table or code" containerStyle={{ flex: 1 }} />
          {Platform.OS === 'web' && people?.length ? <Button label="Download" icon="download-outline" size="md" variant="secondary" onPress={csv} /> : null}
        </View>
        {people && people.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>No guests yet. They show up here as tickets sell.</Text> : null}
        {shown.slice(0, 400).map((p, i) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            <Pressable style={{ flex: 1, gap: 2 }} onPress={() => setEdit({ ...p })} accessibilityRole="button" accessibilityLabel={`Edit ${p.name ?? 'guest'}`}>
              <Text style={[type.body, font(600), { color: c.ink }]}>{p.name || 'Guest'}</Text>
              <Text style={[type.caption, font(400), { color: c.ink2 }]} numberOfLines={1}>
                {[ticketName(p.ticket_type_id), p.table_label ? `Table ${p.table_label}` : null, p.diet, wide ? p.email : null].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
            {p.kind === 'online' ? <Tag label="Online" tone="seed" />
              : <Button label={p.checked_in_at ? 'Checked in' : 'Check in'} size="sm" variant={p.checked_in_at ? 'soft' : 'secondary'} icon={p.checked_in_at ? 'checkmark' : undefined} onPress={() => toggleIn(p)} />}
          </View>
        ))}
      </Card>

      <BottomSheet visible={!!edit} onClose={() => setEdit(null)} title="Guest" footer={<Button label="Save" onPress={saveEdit} />}>
        {edit ? (
          <View style={{ gap: space[4] }}>
            <TextField label="Name" value={edit.name ?? ''} onChangeText={(v) => setEdit({ ...edit, name: v })} />
            <TextField label="Email" value={edit.email ?? ''} onChangeText={(v) => setEdit({ ...edit, email: v })} autoCapitalize="none" keyboardType="email-address" />
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <TextField label="Table" value={edit.table_label ?? ''} onChangeText={(v) => setEdit({ ...edit, table_label: v })} placeholder="12" containerStyle={{ flex: 1 }} />
              <TextField label="Dietary" value={edit.diet ?? ''} onChangeText={(v) => setEdit({ ...edit, diet: v })} placeholder="Vegetarian" containerStyle={{ flex: 2 }} />
            </View>
            <Text style={[type.caption, font(400), { color: c.ink2 }]}>Ticket code {edit.code} · {ticketName(edit.ticket_type_id)}</Text>
          </View>
        ) : null}
      </BottomSheet>
      <BottomSheet visible={!!adding} onClose={() => setAdding(null)} title="Add a guest" footer={<Button label="Add guest" onPress={add} />}>
        {adding ? (
          <View style={{ gap: space[4] }}>
            <Text style={[type.callout, { color: c.ink2 }]}>For sponsors, speakers and comped guests. They get a check-in code like everyone else.</Text>
            <TextField label="Name" value={adding.name} onChangeText={(v) => setAdding({ ...adding, name: v })} />
            <TextField label="Email (optional)" value={adding.email} onChangeText={(v) => setAdding({ ...adding, email: v })} autoCapitalize="none" keyboardType="email-address" />
            <TextField label="Table (optional)" value={adding.table} onChangeText={(v) => setAdding({ ...adding, table: v })} />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
