// Admin space → Masjids: every masjid on Siqa, set up new ones, and jump into any masjid's console.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { supabase } from '../../lib/supabase';
import { font, space, type, useDS } from '../../lib/ds';
import { Button } from '../ui';
import { Card, Empty, PageHeader, Tag } from '../masjid/admin/kit';
import { CreateMasjidSheet } from '../masjid/admin/CreateMasjid';

type M = { id: string; org_name: string; city: string | null; state: string | null; my_role: string };

export function AdminMasjids({ onOpen }: { onOpen: (id: string) => void }) {
  const { c } = useDS();
  const [list, setList] = useState<M[] | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_masjids');
    setList((data as M[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <PageHeader title="Masjids" sub="Set up a masjid, then add its people from its Team page." right={<Button label="Set up a masjid" icon="add" size="md" onPress={() => setCreating(true)} />} />
      {list && list.length === 0 ? <Empty icon="business-outline" title="No masjids yet" /> : null}
      <Card>
        {(list ?? []).map((m, i, arr) => (
          <Pressable key={m.id} onPress={() => onOpen(m.id)} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 12, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, font(600), { color: c.ink }]}>{m.org_name}</Text>
              <Text style={[type.caption, { color: c.ink2 }]}>{[m.city, m.state].filter(Boolean).join(', ')}</Text>
            </View>
            <Tag label={m.my_role === 'siqa' ? 'Siqa access' : m.my_role} />
            <Text style={[type.subhead, font(600), { color: c.ink }]}>Open</Text>
          </Pressable>
        ))}
      </Card>
      <CreateMasjidSheet visible={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load(); onOpen(id); }} />
    </>
  );
}
