// Event editor → Tickets: ticket types (individual, table, online seat), limits, and checkout options.
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { BottomSheet, Button, SegmentedControl, Stepper, TextField } from '../../ui';
import { Card, CardTitle, Tag } from '../../masjid/admin/kit';
import { Icon } from '../../Icon';
import { supabase } from '../../../lib/supabase';
import { showToast } from '../../Toast';
import { confirmDialog } from '../../../lib/dialogs';
import { usd, type TicketType } from '../../../lib/events';
import { MoneyField, ToggleRow } from '../fields';
import type { EventData } from './EventsSection';

type Draft = Partial<TicketType> & { name: string };

export function TicketsTab({ data, reload }: { data: EventData; reload: () => void; wide: boolean }) {
  const { c } = useDS();
  const ev = data.event;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft || !draft.name.trim()) { showToast('Name the ticket.'); return; }
    setBusy(true);
    const row = {
      event_id: ev.id, name: draft.name.trim(), description: draft.description?.trim() || null, price_cents: draft.price_cents ?? 0,
      quantity: draft.quantity ?? null, kind: draft.kind ?? 'in_person', seats: draft.seats ?? 1,
      deductible_cents: Math.min(draft.deductible_cents ?? 0, draft.price_cents ?? 0), active: draft.active ?? true,
      sort: draft.sort ?? (data.tickets.length + 1),
    };
    const res = draft.id ? await supabase.from('event_ticket_types').update(row).eq('id', draft.id) : await supabase.from('event_ticket_types').insert(row);
    setBusy(false);
    if (res.error) { showToast(res.error.message); return; }
    setDraft(null); reload();
  };
  const remove = async () => {
    if (!draft?.id || !(await confirmDialog('Delete this ticket type?', 'Tickets already sold stay valid. If any were sold, consider turning it off instead.', 'Delete'))) return;
    const { error } = await supabase.from('event_ticket_types').delete().eq('id', draft.id);
    if (error) { showToast(error.message); return; }
    setDraft(null); reload();
  };
  const setOpt = async (p: Record<string, boolean>) => {
    const { error } = await supabase.from('events').update(p).eq('id', ev.id);
    if (error) showToast(error.message); else reload();
  };

  return (
    <View style={{ gap: space[4] }}>
      <Card>
        <CardTitle action="Add ticket" onAction={() => setDraft({ name: '', price_cents: 0, kind: 'in_person', seats: 1, active: true })}>Tickets</CardTitle>
        {data.tickets.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>No tickets yet. Add one so people can register.</Text> : null}
        {data.tickets.map((t, i) => (
          <Pressable key={t.id} onPress={() => setDraft(t)} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: t.active ? 1 : 0.55 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.kind === 'online' ? c.seedTint : c.goldTint }}>
              <Icon name={t.kind === 'online' ? 'laptop-outline' : t.seats > 1 ? 'people-outline' : 'ticket-outline'} size={20} color={t.kind === 'online' ? c.seed : c.goldInk} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, font(700), { color: c.ink }]}>{t.name}</Text>
              <Text style={[type.caption, font(400), { color: c.ink2 }]}>
                {t.kind === 'online' ? 'Online seat' : t.seats > 1 ? `Seats ${t.seats}` : 'In person'}
                {t.quantity != null ? ` · ${t.quantity} available` : ' · No limit'}
                {t.deductible_cents ? ` · ${usd(t.deductible_cents)} tax-deductible` : ''}
              </Text>
            </View>
            {!t.active ? <Tag label="Off" /> : null}
            <Text style={[type.headline, { color: c.ink }]}>{t.price_cents ? usd(t.price_cents, true) : 'Free'}</Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <CardTitle>Checkout</CardTitle>
        <ToggleRow label="Ask for an extra gift at checkout" sub="Buyers can add a donation on top of their tickets. It counts toward tonight's total." value={ev.checkout_gift} onChange={(v) => setOpt({ checkout_gift: v })} />
        <ToggleRow label="Sell at the door" sub="The registration desk can add walk-in guests." value={ev.door_sales} onChange={(v) => setOpt({ door_sales: v })} last />
      </Card>

      <BottomSheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit ticket' : 'New ticket'}
        footer={<View style={{ flexDirection: 'row', gap: space[2] }}>{draft?.id ? <Button label="Delete" variant="danger" onPress={remove} /> : null}<Button label="Save ticket" onPress={save} loading={busy} grow /></View>}>
        {draft ? (
          <View style={{ gap: space[4] }} key={draft.id ?? 'new'}>
            <SegmentedControl label="Ticket kind" value={draft.kind ?? 'in_person'} onChange={(v) => setDraft({ ...draft, kind: v, seats: v === 'online' ? 1 : draft.seats })}
              options={[{ value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online seat' }]} />
            <TextField label="Name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder={draft.kind === 'online' ? 'Watch online' : 'Individual'} maxLength={60} />
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <MoneyField label="Price" cents={draft.price_cents ?? 0} onChange={(v) => setDraft({ ...draft, price_cents: v ?? 0 })} containerStyle={{ flex: 1 }} help="Leave empty for free." />
              <MoneyField label="Tax-deductible part" cents={draft.deductible_cents ?? 0} onChange={(v) => setDraft({ ...draft, deductible_cents: v ?? 0 })} containerStyle={{ flex: 1 }} help="Price minus the value of the dinner." />
            </View>
            {draft.kind !== 'online' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, font(600), { color: c.ink }]}>Guests per ticket</Text>
                  <Text style={[type.caption, font(400), { color: c.ink2 }]}>Set 10 for a table. Each seat gets its own QR code.</Text>
                </View>
                <Stepper label="Guests per ticket" value={draft.seats ?? 1} onChange={(v) => setDraft({ ...draft, seats: v })} min={1} max={20} />
              </View>
            ) : null}
            <TextField label="How many are available? (optional)" keyboardType="number-pad" value={draft.quantity != null ? String(draft.quantity) : ''}
              onChangeText={(v) => { const n = parseInt(v.replace(/\D/g, ''), 10); setDraft({ ...draft, quantity: Number.isFinite(n) ? n : null }); }}
              placeholder="No limit" help={draft.seats && draft.seats > 1 ? 'Count tables, not seats.' : undefined} />
            <TextField label="Description (optional)" value={draft.description ?? ''} onChangeText={(v) => setDraft({ ...draft, description: v })} multiline placeholder="Includes dinner and reserved seating." />
            <ToggleRow label="On sale" sub="Turn off to stop selling without deleting." value={draft.active ?? true} onChange={(v) => setDraft({ ...draft, active: v })} last />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
