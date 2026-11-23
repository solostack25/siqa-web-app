// Siqa Admin → Moderation: private claim-invite links for unclaimed speakers, and the blocked words list.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { font, space, type, useDS } from '../../../lib/ds';
import { useTheme } from '../../../lib/theme';
import { supabase } from '../../../lib/supabase';
import { Button, TextField } from '../../ui';
import { promptDialog } from '../../../lib/dialogs';
import { copyToClipboard } from '../../../lib/share';
import { showToast } from '../../Toast';
import { BlockedTermsSection } from '../BlockedTermsSection';
import { AdminPage, Panel } from './kit';

type Unclaimed = { id: string; display_name: string; slug: string | null };

export function AdminModeration({ wide }: { wide: boolean }) {
  const { c } = useDS();
  const { colors } = useTheme();
  const [list, setList] = useState<Unclaimed[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('speakers').select('id, display_name, slug').eq('is_claimed', false).order('display_name').limit(500);
    setList((data as Unclaimed[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const shown = useMemo(() => (list ?? []).filter((s) => !q.trim() || s.display_name.toLowerCase().includes(q.trim().toLowerCase())), [list, q]);

  // A private one-time link (7 days) for a speaker reached through an official contact you found yourself.
  const invite = async (s: Unclaimed) => {
    const sentTo = await promptDialog(`Invite link for ${s.display_name}`,
      'Who are you sending it to? Paste the official contact you found yourself (their YouTube business email or organization inbox). Only send it there.');
    if (sentTo === null) return;
    setBusy(s.id);
    const { data, error } = await supabase.rpc('create_claim_invite', { p_entity_type: 'speaker', p_entity_id: s.id, p_sent_to: sentTo || null });
    setBusy(null);
    if (error) { showToast(error.message); return; }
    const link = `https://www.siqa.us/claim?invite=${data}`;
    setMade((m) => ({ ...m, [s.id]: link }));
    showToast((await copyToClipboard(link)) ? 'Invite link copied. It works once and expires in 7 days.' : 'Invite link created.');
  };

  return (
    <AdminPage wide={wide} title="Moderation" sub="Claim invites for speaker profiles and the blocked words list.">
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}>
        <Panel title="Invite a speaker to claim their profile" style={{ flex: 1, alignSelf: 'stretch' }}>
          <Text style={[type.subhead, font(400), { color: c.ink2, marginBottom: space[3] }]}>
            After you reach a speaker through an official contact you found yourself, create a private link and send it only there. Opening it and signing in hands them the profile.
          </Text>
          <TextField value={q} onChangeText={setQ} placeholder="Search unclaimed speakers" />
          <View style={{ marginTop: space[2] }}>
            {list && shown.length === 0 ? <Text style={[type.callout, { color: c.ink2, paddingVertical: 12 }]}>{list.length ? 'No match.' : 'Every speaker profile is claimed.'}</Text> : null}
            {shown.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text style={[type.subhead, font(600), { color: c.ink }]} numberOfLines={1}>{s.display_name}</Text>
                  <Text style={[type.micro, font(400), { color: made[s.id] ? c.seed : c.ink2 }]} numberOfLines={1} selectable>
                    {made[s.id] ?? (s.slug ? `siqa.us/claim/${s.slug}` : 'No public claim link')}
                  </Text>
                </View>
                <Button label={made[s.id] ? 'New link' : 'Create invite link'} size="sm" variant={made[s.id] ? 'soft' : 'secondary'} loading={busy === s.id} onPress={() => invite(s)} />
              </View>
            ))}
          </View>
        </Panel>
        <Panel title="Blocked words & phrases" style={{ flex: 1, alignSelf: 'stretch' }}>
          <Text style={[type.subhead, font(400), { color: c.ink2, marginBottom: space[2] }]}>
            Comments, reviews, endorsements, Seed updates and display names that contain these are blocked. Changes apply right away.
          </Text>
          <BlockedTermsSection C={colors} embedded />
        </Panel>
      </View>
    </AdminPage>
  );
}
