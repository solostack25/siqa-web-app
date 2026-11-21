import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { Button, TextField } from '../../ui';
import { Card, CardTitle, Choice, PageHeader, Tag, type SectionProps } from './kit';
import { supabase } from '../../../lib/supabase';
import { confirmDialog } from '../../../lib/dialogs';
import { showToast } from '../../Toast';

type Member = { profile_id: string; full_name: string | null; email: string; role: 'owner' | 'admin' | 'editor' };
const ROLE_HELP: Record<string, string> = {
  owner: 'Everything, including the team and screens\' Wi-Fi',
  admin: 'Prayer times, schedule, announcements, Seeds and screens',
  editor: 'Schedule, announcements and Seeds',
};

export function TeamSection({ masjid }: SectionProps) {
  const { c } = useDS();
  const [team, setTeam] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'editor'>('admin');
  const [busy, setBusy] = useState(false);
  const canManage = masjid.my_role === 'owner' || masjid.my_role === 'siqa';

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('masjid_team', { p_org: masjid.id });
    setTeam((data as Member[]) || []);
  }, [masjid.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('masjid_add_admin', { p_org: masjid.id, p_email: email.trim(), p_role: role });
    setBusy(false);
    if (error) { showToast(error.message); return; }
    if (data === 'not_found') { showToast('No Siqa account uses that email yet. Ask them to sign up at siqa.us first.'); return; }
    setEmail(''); load(); showToast('Added. Next time they open Siqa, they land in this console.');
  };
  const remove = async (m: Member) => {
    if (!(await confirmDialog(`Remove ${m.full_name || m.email}?`, 'They lose access to this masjid.', 'Remove'))) return;
    const { error } = await supabase.from('masjid_admins').delete().eq('org_id', masjid.id).eq('profile_id', m.profile_id);
    if (error) showToast(error.message); else load();
  };

  return (
    <>
      <PageHeader title="Team" sub="People who can run this masjid on Siqa. They see only this console, not Gems or Shop." />
      <Card>
        <CardTitle>People</CardTitle>
        {team.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>{canManage ? 'Only you so far. Add the imam, board members or volunteers below.' : 'No other team members.'}</Text> : null}
        {team.map((m, i) => (
          <View key={m.profile_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, borderBottomWidth: i === team.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, font(600), { color: c.ink }]}>{m.full_name || m.email}</Text>
              <Text style={[type.caption, { color: c.ink2 }]}>{m.email}</Text>
            </View>
            <Tag label={m.role[0].toUpperCase() + m.role.slice(1)} tone={m.role === 'owner' ? 'gold' : 'soft'} />
            {canManage ? <Pressable onPress={() => remove(m)} accessibilityRole="button" hitSlop={8}><Text style={[type.caption, { color: c.danger }]}>Remove</Text></Pressable> : null}
          </View>
        ))}
      </Card>
      {canManage ? (
        <Card>
          <CardTitle>Add someone</CardTitle>
          <TextField label="Their Siqa email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="imam@yourmasjid.org" />
          <Choice label="Role" value={role} options={[{ value: 'owner', label: 'Owner' }, { value: 'admin', label: 'Admin' }, { value: 'editor', label: 'Editor' }]} onChange={setRole} />
          <Text style={[type.caption, { color: c.ink2 }]}>{ROLE_HELP[role]}</Text>
          <Button label="Add to team" size="md" onPress={add} loading={busy} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}
    </>
  );
}
