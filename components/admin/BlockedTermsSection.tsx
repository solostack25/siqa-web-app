/**
 * Admin → Blocked words & phrases.
 *
 * Moderators manage the language filter here (public.blocked_terms). The
 * database does the actual blocking (triggers on comments, reviews,
 * endorsements, Seed updates and display names), so changes take effect
 * immediately for everyone — no deploy.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { supabase } from '../../lib/supabase';
import { type AppColors } from '../../lib/theme';
import { Theme } from '../../constants/theme';
import { brandStyles, buttonStyles } from '../../lib/ds';
import { confirmDialog } from '../../lib/dialogs';
import { showToast } from '../Toast';

type Term = {
  term: string;
  match: 'word' | 'prefix' | 'phrase';
  created_at: string;
  added_by: string | null;
};

const MATCH_LABEL: Record<Term['match'], string> = {
  word: 'Exact word',
  prefix: 'Word + longer forms',
  phrase: 'Phrase',
};

const PAGE = 30;

export function BlockedTermsSection({ C }: { C: AppColors }) {
  const styles = useMemo(() => makeStyles(C), [C]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [input, setInput] = useState('');
  const [longer, setLonger] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<null | boolean>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('blocked_terms')
      .select('term, match, created_at, added_by')
      .order('created_at', { ascending: false });
    if (error) { showToast(error.message); setLoading(false); return; }
    const list = (data as Term[]) || [];
    setTerms(list);
    const ids = [...new Set(list.map(t => t.added_by).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(Object.fromEntries((ps || []).map((p: any) => [p.id, p.full_name || 'Moderator'])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const isPhrase = /\s/.test(input.trim());
  const isOtherScript = /[^\u0000-ɏ\s]/.test(input);

  async function add() {
    const term = input.trim();
    if (!term || saving) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('blocked_terms')
      .insert({ term, match: longer && !isPhrase ? 'prefix' : 'word' })
      .select('term, match')
      .single();
    setSaving(false);
    if (error) {
      showToast(/duplicate|unique/i.test(error.message) ? 'That one is already on the list' : error.message);
      return;
    }
    // The database normalizes what was typed (lowercase, leetspeak, spaces).
    showToast(`Blocked: "${(data as any)?.term ?? term}"`);
    setInput('');
    setLonger(false);
    load();
  }

  async function remove(t: Term) {
    const ok = await confirmDialog(`Unblock "${t.term}"?`, 'People will be able to post it again.', 'Unblock');
    if (!ok) return;
    const { error } = await supabase.from('blocked_terms').delete().eq('term', t.term);
    if (error) { showToast(error.message); return; }
    setTerms(prev => prev.filter(x => x.term !== t.term));
  }

  async function runTest() {
    if (!testText.trim()) return;
    setTesting(true);
    const { data, error } = await supabase.rpc('contains_blocked_language', { t: testText });
    setTesting(false);
    if (error) { showToast(error.message); return; }
    setTestResult(Boolean(data));
  }

  const q = search.trim().toLowerCase();
  const filtered = q ? terms.filter(t => t.term.includes(q)) : terms;
  const shown = showAll || q ? filtered : filtered.slice(0, PAGE);

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHead} onPress={() => setOpen(o => !o)} accessibilityRole="button">
        <Text style={styles.sectionTitle}>Blocked words & phrases {open ? '▾' : '▸'}</Text>
        <Text style={styles.countPill}>{loading ? '…' : terms.length}</Text>
      </TouchableOpacity>

      {!open ? (
        <Text style={styles.hint}>
          Comments, reviews, endorsements, Seed updates and display names that contain these are blocked. Tap to manage.
        </Text>
      ) : (
        <View style={{ gap: 12 }}>
          {/* Add */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add a word or phrase</Text>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="e.g. idiot, or a phrase like shut up"
              placeholderTextColor={C.text3}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={add}
              maxLength={80}
            />
            {input.trim() && !isPhrase && !isOtherScript ? (
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Also block longer forms</Text>
                  <Text style={styles.meta}>
                    Blocks "{input.trim().toLowerCase()}ing", "{input.trim().toLowerCase()}er" and so on. Leave off for short words that start normal words.
                  </Text>
                </View>
                <Switch value={longer} onValueChange={setLonger} />
              </View>
            ) : null}
            {isPhrase ? <Text style={styles.meta}>Phrase: blocked when these words appear together in this order.</Text> : null}
            {isOtherScript ? <Text style={styles.meta}>Non-English script: blocked wherever it appears in the text.</Text> : null}
            <Text style={styles.meta}>
              Spelling tricks are caught automatically (sh1t, $hit, shiiit, s h i t). Don't add those separately.
            </Text>
            <TouchableOpacity style={[styles.primaryBtn, (!input.trim() || saving) && { opacity: 0.5 }]} onPress={add} disabled={!input.trim() || saving}>
              <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Block it'}</Text>
            </TouchableOpacity>
          </View>

          {/* Test */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Test the filter</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={testText}
              onChangeText={(v) => { setTestText(v); setTestResult(null); }}
              placeholder="Paste a comment to see if it would be blocked"
              placeholderTextColor={C.text3}
              multiline
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity style={styles.ghostBtn} onPress={runTest} disabled={testing || !testText.trim()}>
                <Text style={styles.ghostBtnText}>{testing ? 'Checking…' : 'Check'}</Text>
              </TouchableOpacity>
              {testResult !== null ? (
                <Text style={[styles.result, { color: testResult ? C.danger : C.emerald }]}>
                  {testResult ? 'Would be blocked' : 'Would be allowed'}
                </Text>
              ) : null}
            </View>
          </View>

          {/* List */}
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${terms.length} blocked entries`}
              placeholderTextColor={C.text3}
              autoCapitalize="none"
            />
            {loading ? <ActivityIndicator color={C.gold} /> : shown.length === 0 ? (
              <Text style={styles.meta}>{q ? 'Nothing on the list matches.' : 'The list is empty.'}</Text>
            ) : shown.map(t => (
              <View key={t.term} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.term} selectable>{t.term}</Text>
                  <Text style={styles.meta}>
                    {MATCH_LABEL[t.match]} · {t.added_by ? `added by ${names[t.added_by] || 'a moderator'}` : 'starter list'} · {new Date(t.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => remove(t)}>
                  <Text style={styles.ghostBtnText}>Unblock</Text>
                </TouchableOpacity>
              </View>
            ))}
            {!q && !showAll && filtered.length > PAGE ? (
              <TouchableOpacity onPress={() => setShowAll(true)} style={{ paddingVertical: 8 }}>
                <Text style={[styles.meta, { color: C.gold }]}>Show all {filtered.length}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    section: { marginBottom: 24 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 36 },
    sectionTitle: { color: C.text, fontSize: 16, fontWeight: Theme.fontWeight.semibold },
    countPill: { color: C.gold, borderColor: C.border, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontWeight: Theme.fontWeight.bold },
    hint: { color: C.text3, fontSize: 13, lineHeight: 18 },
    card: { backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border2, borderRadius: 18, padding: 14, gap: 10 },
    cardTitle: { color: C.text, fontSize: 14, fontWeight: Theme.fontWeight.semibold },
    input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 15 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    toggleLabel: { color: C.text, fontSize: 14, fontWeight: Theme.fontWeight.semibold },
    meta: { color: C.text3, fontSize: 12, lineHeight: 17 },
    result: { fontSize: 14, fontWeight: Theme.fontWeight.bold },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: C.border2 },
    term: { color: C.text, fontSize: 15, fontWeight: Theme.fontWeight.semibold },
    primaryBtn: buttonStyles('primary', 'md').box,
    primaryBtnText: buttonStyles('primary', 'md').text,
    ghostBtn: buttonStyles('secondary', 'sm').box,
    ghostBtnText: buttonStyles('secondary', 'sm').text,
  }));
}
