// Classes tab on an organization profile: every Studio class the org lists, with sign-up.
// Signed in → joins the class (shows in My classes, gets reminders, recordings for enrolled students).
// Signed out → registers with name + email for reminders, or signs in to join.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, Platform, Linking } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { openStudio } from '../lib/studioLink';
import { Button, TextField, BottomSheet, Switch } from './ui';
import { Icon } from './Icon';
import { showToast } from './Toast';
import { font, radius, space, type, useDS } from '../lib/ds';

export type OrgClass = {
  id: string; share: string; title: string; description: string | null; cover: string | null;
  members_only: boolean; price_text: string | null; payment_link: string | null; schedule_text: string | null;
  teacher: string | null; next: { title: string; scheduled_at: string } | null; upcoming: number;
  live: boolean; students: number; enrolled: boolean;
};

type Candidate = { id: string; title: string; listed: boolean; elsewhere: boolean; schedule_text: string | null };

function when(iso: string) {
  const d = new Date(iso);
  const day = d.toDateString() === new Date().toDateString() ? 'Today'
    : d.toDateString() === new Date(Date.now() + 86400000).toDateString() ? 'Tomorrow'
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function openUrl(u: string) {
  const url = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener'); else Linking.openURL(url);
}

/** Loads an org's classes. Returns rows (null while loading) and a reload function. */
export function useOrgClasses(orgId: string | null | undefined) {
  const [rows, setRows] = useState<OrgClass[] | null>(null);
  const reload = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase.rpc('org_classes', { p_org: orgId });
    setRows(error ? [] : ((data as OrgClass[]) ?? []));
  }, [orgId]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, reload };
}

export function OrgClasses({ orgId, orgName, rows, reload, canEdit, limit, onSeeAll }: {
  orgId: string; orgName: string; rows: OrgClass[] | null; reload: () => void; canEdit: boolean; limit?: number; onSeeAll?: () => void;
}) {
  const { c, shadow } = useDS();
  const [signup, setSignup] = useState<OrgClass | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manage, setManage] = useState(false);

  async function join(k: OrgClass) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSignup(k); return; }
    setBusy(k.id);
    const { error } = await supabase.rpc('studio_class_enroll', { p_share: k.share });
    setBusy(null);
    if (error) { showToast(error.message); return; }
    showToast(`You're in. "${k.title}" is in My classes.`);
    reload();
    if (k.payment_link) openUrl(k.payment_link);
  }

  const shown = rows ? (limit ? rows.slice(0, limit) : rows) : [];

  return (
    <View style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Text style={[{ fontSize: 20, lineHeight: 26 }, font(800), { color: c.ink, flex: 1 }]} accessibilityRole="header">Classes</Text>
        {limit && rows && rows.length > limit && onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button"><Text style={[type.callout, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>See all {rows.length}</Text></Pressable>
        ) : null}
        {canEdit && !limit ? <Button label="Manage classes" icon="settings-outline" variant="soft" size="md" onPress={() => setManage(true)} /> : null}
      </View>

      {rows === null ? <Text style={[type.callout, { color: c.ink2 }]}>Loading classes…</Text> : null}
      {rows && rows.length === 0 ? (
        <View style={{ padding: space[5], borderRadius: radius.xl, backgroundColor: c.surface, gap: space[2], borderWidth: 1, borderColor: c.line }}>
          <Text style={[{ fontSize: 17 }, font(700), { color: c.ink }]}>No classes listed yet</Text>
          <Text style={[type.callout, { color: c.ink2 }]}>
            {canEdit ? 'Create a class in Siqa Studio, then tap Manage classes to list it here.' : `When ${orgName} opens a class, you can sign up here.`}
          </Text>
        </View>
      ) : null}

      {shown.map((k) => (
        <View key={k.id} style={[{ backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden' }, shadow('card')]}>
          {k.cover ? <Image source={{ uri: k.cover }} style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: c.bgSunk }} resizeMode="cover" /> : null}
          <View style={{ padding: space[5], gap: space[3] }}>
            <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
              {k.live ? <Tag label="LIVE NOW" bg="#C8312B" fg="#fff" /> : null}
              <Tag label={k.price_text?.trim() || 'Free'} bg={c.goldTint} fg={c.ink} />
              {k.members_only ? <Tag label="Invite only" bg={c.bgSunk} fg={c.ink2} /> : null}
              {k.enrolled ? <Tag label="Enrolled" bg={c.seedTint} fg={c.seed} /> : null}
            </View>
            <Text style={[{ fontSize: 21, lineHeight: 27 }, font(800), { color: c.ink }]}>{k.title}</Text>
            {k.teacher ? <Text style={[type.callout, { color: c.ink2 }]}>With {k.teacher}</Text> : null}
            {k.description ? <Text style={[type.body, { color: c.ink }]} numberOfLines={4}>{k.description}</Text> : null}

            <View style={{ gap: 6 }}>
              {k.next ? <Line icon="calendar-outline" text={`Next: ${when(k.next.scheduled_at)}`} /> : null}
              {k.schedule_text ? <Line icon="time-outline" text={k.schedule_text} /> : null}
              {!k.next && !k.schedule_text ? <Line icon="calendar-outline" text="Dates announced soon. Sign up to hear first." /> : null}
              <Line icon="videocam-outline" text="Live on Siqa. Recordings for enrolled students." />
              {k.students >= 5 ? <Line icon="people-outline" text={`${k.students} signed up`} /> : null}
            </View>

            <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap', marginTop: space[1] }}>
              {k.live && (k.enrolled || !k.members_only) ? (
                <Button label="Join live class" icon="radio-outline" size="md" grow onPress={() => openStudio(`/s/${k.share}`)} />
              ) : k.enrolled ? (
                <Button label="Open in My classes" icon="book-outline" variant="secondary" size="md" grow onPress={() => router.push('/my-classes' as any)} />
              ) : k.members_only ? (
                <Button label="Join with invite" icon="lock-closed-outline" variant="secondary" size="md" grow loading={busy === k.id} onPress={() => join(k)} />
              ) : (
                <Button label={k.payment_link ? 'Register & pay' : 'Sign up'} icon="add-circle-outline" size="md" grow loading={busy === k.id} onPress={() => join(k)} />
              )}
              <Button label="Details" variant="soft" size="md" onPress={() => openStudio(`/s/${k.share}`)} />
            </View>
          </View>
        </View>
      ))}

      <GuestSignup orgId={orgId} klass={signup} onClose={() => setSignup(null)} onDone={reload} />
      {canEdit ? <ManageClasses orgId={orgId} visible={manage} onClose={() => { setManage(false); reload(); }} /> : null}
    </View>
  );
}

function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: bg }}>
      <Text style={[type.caption, font(700), { color: fg }]}>{label}</Text>
    </View>
  );
}

function Line({ icon, text }: { icon: any; text: string }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Icon name={icon} size={16} color={c.ink2} />
      <Text style={[type.callout, { color: c.ink2, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/** Signed-out sign-up: sign in to join fully, or leave name + email for reminders and the class link. */
function GuestSignup({ orgId, klass, onClose, onDone }: { orgId: string; klass: OrgClass | null; onClose: () => void; onDone: () => void }) {
  const { c } = useDS();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setErr(null); }, [klass]);

  async function submit() {
    if (!klass) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('Enter a valid email.'); return; }
    setSaving(true);
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })();
    const { error } = await supabase.rpc('studio_register', { p_share: klass.share, p_name: name.trim(), p_email: email.trim(), p_timezone: tz });
    setSaving(false);
    if (error) { setErr(error.message === 'not available' ? 'This class is invite-only. Sign in with the email you were invited with.' : error.message); return; }
    showToast(`You're signed up. We'll email ${email.trim()} before each class.`);
    const pay = klass.payment_link;
    onClose(); onDone();
    if (pay) openUrl(pay);
  }

  return (
    <BottomSheet visible={!!klass} onClose={onClose} title={klass ? `Sign up: ${klass.title}` : 'Sign up'}>
      <View style={{ padding: space[5], gap: space[4] }}>
        <Button label="Sign in to join" icon="person-circle-outline" size="md"
          onPress={() => { onClose(); router.push(`/sign-in?next=${encodeURIComponent(`/org/${orgId}?tab=classes`)}` as any); }} />
        <Text style={[type.caption, { color: c.ink2 }]}>Signing in adds the class to My classes, with recordings and notes.</Text>
        <View style={{ height: 1, backgroundColor: c.line }} />
        {!klass?.members_only ? (
          <>
            <Text style={[type.callout, font(600), { color: c.ink }]}>Or get reminders by email</Text>
            <TextField label="Your name" value={name} onChangeText={setName} autoComplete="name" />
            <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={err} />
            <Button label={klass?.payment_link ? 'Sign up & pay' : 'Sign up'} size="md" loading={saving} onPress={submit} />
          </>
        ) : <Text style={[type.callout, { color: c.ink2 }]}>This class is invite-only. Sign in with the email you were invited with.</Text>}
      </View>
    </BottomSheet>
  );
}

/** Org owners and Siqa admins: pick which Studio classes appear on this profile. */
function ManageClasses({ orgId, visible, onClose }: { orgId: string; visible: boolean; onClose: () => void }) {
  const { c } = useDS();
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [sched, setSched] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    setRows(null);
    supabase.rpc('org_class_candidates', { p_org: orgId }).then(({ data, error }) => {
      if (error) { showToast(error.message); setRows([]); return; }
      const list = (data as Candidate[]) ?? [];
      setRows(list);
      setSched(Object.fromEntries(list.map((r) => [r.id, r.schedule_text ?? ''])));
    });
  }, [visible, orgId]);

  async function toggle(r: Candidate, on: boolean) {
    const { error } = await supabase.rpc('org_class_set', { p_org: orgId, p_series: r.id, p_on: on, p_schedule: sched[r.id] || null });
    if (error) { showToast(error.message); return; }
    setRows((l) => (l ?? []).map((x) => x.id === r.id ? { ...x, listed: on, elsewhere: false } : x));
  }
  async function saveSched(r: Candidate) {
    if (!r.listed) return;
    const { error } = await supabase.rpc('org_class_set', { p_org: orgId, p_series: r.id, p_on: true, p_schedule: sched[r.id] || null });
    if (error) showToast(error.message);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Classes on this profile"
      footer={<View style={{ padding: space[4] }}><Button label="Done" size="md" onPress={onClose} /></View>}>
      <View style={{ padding: space[5], gap: space[4] }}>
        <Text style={[type.callout, { color: c.ink2 }]}>Turn on the classes to show here. Classes are made in Siqa Studio (title, cover, price, sessions).</Text>
        <Button label="Open Siqa Studio" icon="open-outline" variant="soft" size="md" onPress={() => openStudio('/')} />
        {rows === null ? <Text style={[type.callout, { color: c.ink2 }]}>Loading…</Text> : null}
        {rows && rows.length === 0 ? <Text style={[type.callout, { color: c.ink2 }]}>No Studio classes yet.</Text> : null}
        {(rows ?? []).map((r) => (
          <View key={r.id} style={{ gap: space[2], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Switch value={r.listed} onValueChange={(v) => toggle(r, v)} label={r.title + (r.elsewhere ? ' (on another profile)' : '')} />
            {r.listed ? (
              <TextField label="Schedule line (optional)" placeholder="Tuesdays, 8 pm CT · 6 weeks" value={sched[r.id] ?? ''}
                onChangeText={(v) => setSched((s) => ({ ...s, [r.id]: v }))} onBlur={() => saveSched(r)} />
            ) : null}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}
