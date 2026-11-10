import { useState } from 'react';
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { uploadFileToBunny } from '../lib/bunnyUpload';
import { font, radius, type, useDS } from '../lib/ds';
import { Icon } from './Icon';
import { Card, CardTitle } from './SeedSocial';
import { Button, TextField } from './ui';
import { showToast } from './Toast';

// 501(c)(3) proof. Donations on Siqa only go to organizations whose
// tax-exempt status a Siqa admin has checked (app store rules). Owners
// upload proof here; admins approve or reject it from the same card.

export type TaxExemptOrg = {
  id: string;
  org_name: string;
  ein: string | null;
  tax_exempt_status?: 'none' | 'pending' | 'verified' | 'rejected' | null;
  tax_exempt_doc_url?: string | null;
  tax_exempt_note?: string | null;
};

export function irsLookupUrl(ein: string | null) {
  const digits = (ein || '').replace(/\D/g, '');
  return digits.length === 9
    ? `https://apps.irs.gov/app/eos/allSearch?ein1=${digits}&names=&resultsPerPage=25&indexOfFirstRow=0&dispatchMethod=searchAll&isDescending=false&city=&state=All+States&country=US&postDateFrom=&postDateTo=&exemptTypeCode=al&deductibility=all&sortColumn=orgName`
    : 'https://apps.irs.gov/app/eos/';
}

const STATUS_COPY: Record<string, { title: string; body: string; tone: 'gold' | 'seed' | 'danger' | 'ink' }> = {
  none: { title: 'Donations are off until we confirm your 501(c)(3)', body: 'Upload your IRS determination letter (or a screenshot of your listing in the IRS Tax Exempt Organization Search). The Siqa team checks it, usually within 1–3 business days.', tone: 'gold' },
  pending: { title: 'Your 501(c)(3) proof is in review', body: 'Thanks. The Siqa team is checking it. Donations turn on as soon as it’s confirmed.', tone: 'gold' },
  verified: { title: '501(c)(3) confirmed', body: 'Your organization can receive donations on Siqa.', tone: 'seed' },
  rejected: { title: 'We couldn’t confirm your 501(c)(3)', body: 'Upload clearer or different proof and we’ll check again.', tone: 'danger' },
};

export function TaxExemptCard({ org, isAdmin, canEdit, onChanged }: {
  org: TaxExemptOrg;
  isAdmin: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { c } = useDS();
  const status = org.tax_exempt_status || 'none';
  const copy = STATUS_COPY[status] ?? STATUS_COPY.none;
  const [link, setLink] = useState('');
  const [note, setNote] = useState(org.tax_exempt_note ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  if (!canEdit && !isAdmin) return null;

  async function save(docUrl: string) {
    setBusy('save');
    const { error } = await supabase.from('organizations').update({ tax_exempt_doc_url: docUrl, tax_exempt_note: note.trim() || null }).eq('id', org.id);
    setBusy(null);
    if (error) { showToast(error.message); return; }
    setLink('');
    showToast('Sent for review');
    onChanged();
  }

  async function upload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Allow Siqa to access your photos.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    setBusy('upload');
    try {
      const a = res.assets[0];
      const url = await uploadFileToBunny({ uri: a.uri, fileName: `org-docs/${org.id}/irs-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' });
      setBusy(null);
      await save(url);
    } catch (e: any) {
      setBusy(null);
      showToast(e?.message || 'Upload failed');
    }
  }

  async function decide(next: 'verified' | 'rejected') {
    setBusy(next);
    const { error } = await supabase.from('organizations').update({ tax_exempt_status: next, tax_exempt_note: note.trim() || null }).eq('id', org.id);
    setBusy(null);
    if (error) { showToast(error.message); return; }
    showToast(next === 'verified' ? '501(c)(3) confirmed. Donations are on.' : 'Marked as not confirmed');
    onChanged();
  }

  const toneBg = copy.tone === 'seed' ? c.seedTint : copy.tone === 'danger' ? c.dangerTint : c.goldTint;
  const toneFg = copy.tone === 'seed' ? c.seed : copy.tone === 'danger' ? c.danger : c.goldInk;
  const docIsImage = !!org.tax_exempt_doc_url && /\.(jpe?g|png|webp)(\?|$)/i.test(org.tax_exempt_doc_url);

  return (
    <Card>
      <CardTitle icon="document-text-outline">501(c)(3) status</CardTitle>
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: toneBg }}>
        <Icon name={status === 'verified' ? 'checkmark-circle' : status === 'rejected' ? 'alert-circle-outline' : 'time-outline'} size={20} color={toneFg} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.subhead, font(700), { color: toneFg }]}>{copy.title}</Text>
          <Text style={[type.caption, font(400), { color: toneFg }]}>{copy.body}</Text>
        </View>
      </View>

      {org.tax_exempt_doc_url ? (
        <Pressable onPress={() => Linking.openURL(org.tax_exempt_doc_url!)} accessibilityRole="link" style={{ gap: 8 }}>
          {docIsImage ? <Image source={{ uri: org.tax_exempt_doc_url }} style={{ width: '100%', height: 180, borderRadius: radius.md, backgroundColor: c.bgSunk }} resizeMode="contain" /> : null}
          <Text style={[type.subhead, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>View submitted proof</Text>
        </Pressable>
      ) : null}

      {canEdit && status !== 'verified' ? (
        <View style={{ gap: 10 }}>
          <Button size="md" variant="secondary" icon="cloud-upload-outline" label={org.tax_exempt_doc_url ? 'Upload new proof' : 'Upload IRS letter (photo or screenshot)'} onPress={upload} loading={busy === 'upload'} />
          <TextField
            label="Or paste a link"
            placeholder="Link to your IRS letter PDF or IRS search result"
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            keyboardType="url"
            help={Platform.OS === 'web' ? 'A Google Drive or Dropbox link works if it’s shared so anyone with the link can view.' : undefined}
          />
          {link.trim() ? <Button size="md" label="Send for review" onPress={() => save(link.trim())} loading={busy === 'save'} disabled={!/^https?:\/\//i.test(link.trim())} /> : null}
          <Pressable onPress={() => Linking.openURL(irsLookupUrl(org.ein))} accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={[type.caption, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>Find your organization in the IRS Tax Exempt Organization Search</Text>
          </Pressable>
        </View>
      ) : null}

      {isAdmin ? (
        <View style={{ gap: 10, paddingTop: 4, borderTopWidth: 1, borderTopColor: c.line }}>
          <Text style={[type.micro, { color: c.ink2, letterSpacing: 0.4, marginTop: 10 }]}>SIQA ADMIN</Text>
          <Pressable onPress={() => Linking.openURL(irsLookupUrl(org.ein))} accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={[type.subhead, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>Check EIN {org.ein || '(none on file)'} with the IRS</Text>
          </Pressable>
          <TextField label="Note (optional)" placeholder="e.g. Pub 78 listed, deductibility code PC" value={note} onChangeText={setNote} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button size="md" label="Confirm 501(c)(3)" onPress={() => decide('verified')} loading={busy === 'verified'} disabled={status === 'verified'} />
            <Button size="md" variant="danger" label="Not confirmed" onPress={() => decide('rejected')} loading={busy === 'rejected'} disabled={status === 'rejected'} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
