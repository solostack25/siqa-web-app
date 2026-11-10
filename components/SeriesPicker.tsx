import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { font, radius, type, useDS } from '../lib/ds';
import { Icon } from './Icon';
import { Button, Chip, TextField } from './ui';

// Upload screen: "Part of a series". Picking a series fills in its saved
// description / topics / format / visibility / Seed (the parent does that in
// onPick); everything stays editable. Creating one saves the current form as
// that series' defaults.

export type SeriesRow = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  default_topics: string[] | null;
  default_format: 'short' | 'long' | null;
  default_visibility: 'public' | 'followers' | null;
  default_fundraiser_id: string | null;
  speaker_id: string | null;
  org_id: string | null;
  episodes?: number;
  last_episode?: number | null;
};

export function SeriesPicker({
  series, selectedId, onPick, onCreate, creating, episode, onEpisode, description, onDescription, disabled, orgNames,
}: {
  series: SeriesRow[];
  selectedId: string | null;
  onPick: (s: SeriesRow | null) => void;
  onCreate: (title: string, description: string) => Promise<void> | void;
  creating?: boolean;
  episode: string;
  onEpisode: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  disabled?: boolean;
  orgNames?: Record<string, string>;
}) {
  const { c } = useDS();
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const selected = series.find(s => s.id === selectedId) ?? null;

  async function create() {
    if (!title.trim()) return;
    await onCreate(title.trim(), desc.trim());
    setTitle(''); setDesc(''); setNewOpen(false);
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text style={[type.headline, { color: c.ink }]}>Series</Text>
        <Text style={[type.caption, font(400), { color: c.ink2 }]}>
          Part of a class or a run of episodes? Pick the series and its details fill in.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Series">
        <Chip label="None" selected={!selectedId} onPress={() => onPick(null)} disabled={disabled} />
        {series.map(s => (
          <Chip
            key={s.id}
            label={s.org_id && orgNames?.[s.org_id] ? `${s.title} · ${orgNames[s.org_id]}` : s.title}
            selected={selectedId === s.id}
            onPress={() => onPick(s)}
            disabled={disabled}
          />
        ))}
        <Chip icon="add" label="New series" selected={newOpen} onPress={() => setNewOpen(v => !v)} disabled={disabled} />
      </View>

      {newOpen ? (
        <View style={{ gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: c.bgSunk }}>
          <TextField label="Series name" placeholder="e.g. Tafsir of Surah al-Kahf" value={title} onChangeText={setTitle} maxLength={120} />
          <TextField
            label="Series description"
            placeholder="What the series covers. Each episode starts with this."
            value={desc}
            onChangeText={setDesc}
            multiline
            style={{ minHeight: 80 }}
          />
          <Text style={[type.caption, font(400), { color: c.ink2 }]}>
            This video's topics, format, visibility and Seed are saved as the series defaults.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="md" label="Create series" onPress={create} loading={creating} disabled={!title.trim()} />
            <Button size="md" variant="secondary" label="Cancel" onPress={() => setNewOpen(false)} />
          </View>
        </View>
      ) : null}

      {selected ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: c.goldTint }}>
            <Icon name="albums-outline" size={18} color={c.goldInk} />
            <Text style={[type.caption, { color: c.goldInk, flex: 1 }]}>
              Filled in from “{selected.title}”{selected.episodes ? ` (${selected.episodes} episode${selected.episodes === 1 ? '' : 's'} so far)` : ''}. Change anything for this episode.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <TextField
              label="Episode"
              value={episode}
              onChangeText={v => onEpisode(v.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              containerStyle={{ width: 96 }}
              editable={!disabled}
            />
            <Pressable
              onPress={() => onPick(selected)}
              disabled={disabled}
              accessibilityRole="button"
              style={{ marginTop: 26, minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={[type.subhead, font(600), { color: c.ink, textDecorationLine: 'underline' }]}>Reset to series details</Text>
            </Pressable>
          </View>
          <TextField
            label="Description"
            placeholder="Shown under the video"
            value={description}
            onChangeText={onDescription}
            multiline
            style={{ minHeight: 100 }}
            editable={!disabled}
          />
        </View>
      ) : null}
    </View>
  );
}
