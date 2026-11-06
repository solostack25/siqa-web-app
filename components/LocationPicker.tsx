import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useState } from 'react';
import { useTheme, type AppColors } from '../lib/theme';
import { Icon } from './Icon';
import {
  ANYWHERE, RADIUS_OPTIONS, deviceLocationSupported, locateDevice, locateText, saveLocation, type SavedLocation,
} from '../lib/location';
import { brandStyles, font } from '../lib/ds';

/**
 * "Near Katy, TX · 25 mi ▾" button with a panel to use the current location,
 * type a city / state / ZIP, change the radius, or search anywhere.
 * Choices are saved on the device.
 */
export function LocationPicker({
  value, onChange, startOpen = false, inline = false,
}: {
  value: SavedLocation | null;
  onChange: (loc: SavedLocation) => void;
  startOpen?: boolean;
  /** Always show the panel (for Settings). */
  inline?: boolean;
}) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  const [open, setOpen] = useState(startOpen || inline);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'device' | 'text' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = value ?? ANYWHERE;
  const hasPoint = current.lat != null && current.lon != null;
  const summary = current.mode === 'anywhere'
    ? 'Anywhere'
    : `Near ${current.label}${hasPoint ? ` · ${current.radius} mi` : ''}`;

  async function commit(loc: SavedLocation) {
    await saveLocation(loc);
    onChange(loc);
    if (!inline) setOpen(false);
  }

  async function useDevice() {
    setBusy('device'); setError(null);
    const loc = await locateDevice(current.radius);
    setBusy(null);
    if (!loc) {
      setError('Couldn’t get your location. Check that location access is allowed for this site, or type a city or ZIP.');
      return;
    }
    commit(loc);
  }

  async function useText() {
    const t = text.trim();
    if (!t) return;
    setBusy('text'); setError(null);
    const loc = await locateText(t, current.radius);
    setBusy(null);
    if (!loc) { setError('Enter a city, state or 5-digit ZIP.'); return; }
    setText('');
    commit(loc);
  }

  return (
    <View style={{ gap: 10 }}>
      {!inline && (
        <TouchableOpacity
          style={[s.trigger, current.mode !== 'anywhere' && s.triggerOn]}
          onPress={() => setOpen(o => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Location: ${summary}. Change location`}
        >
          <Icon name={current.mode === 'auto' ? 'navigate' : 'location-outline'} size={17} color={current.mode !== 'anywhere' ? C.gold : C.text2} />
          <Text style={[s.triggerText, current.mode !== 'anywhere' && { color: C.gold, ...font(700) }]} numberOfLines={1}>{summary}</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
        </TouchableOpacity>
      )}

      {open && (
        <View style={[s.panel, inline && s.panelInline]}>
          {deviceLocationSupported() && (
            <TouchableOpacity style={s.deviceBtn} onPress={useDevice} disabled={busy !== null}>
              {busy === 'device' ? <ActivityIndicator color={C.gold} /> : <Icon name="navigate-outline" size={18} color={C.gold} />}
              <Text style={s.deviceText}>{current.mode === 'auto' ? 'Update my current location' : 'Use my current location'}</Text>
            </TouchableOpacity>
          )}

          <View style={s.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={useText}
              placeholder="City, state or ZIP"
              placeholderTextColor={C.text3}
              style={s.input}
              returnKeyType="search"
              autoCapitalize="words"
              accessibilityLabel="City, state or ZIP"
            />
            <TouchableOpacity style={[s.goBtn, !text.trim() && { opacity: 0.5 }]} onPress={useText} disabled={!text.trim() || busy !== null}>
              {busy === 'text' ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>Set</Text>}
            </TouchableOpacity>
          </View>

          {hasPoint && current.mode !== 'anywhere' && (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Distance</Text>
              <View style={s.row}>
                {RADIUS_OPTIONS.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[s.chip, current.radius === r && s.chipOn]}
                    onPress={() => commit({ ...current, radius: r })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: current.radius === r }}
                  >
                    <Text style={[s.chipText, current.radius === r && s.chipTextOn]}>{r} mi</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {current.mode !== 'anywhere' && (
            <TouchableOpacity onPress={() => commit({ ...ANYWHERE, radius: current.radius, updatedAt: Date.now() })} style={s.linkBtn}>
              <Text style={s.link}>Show businesses anywhere</Text>
            </TouchableOpacity>
          )}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Text style={s.small}>Saved on this device only. Siqa doesn't store your location.</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    trigger: {
      minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
    },
    triggerOn: { borderColor: C.gold, backgroundColor: C.goldBg },
    triggerText: { flex: 1, fontSize: 15, color: C.text },
    panel: { gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
    panelInline: { padding: 0, borderWidth: 0, backgroundColor: 'transparent' },
    deviceBtn: {
      minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.gold, flexDirection: 'row',
      alignItems: 'center', gap: 8, paddingHorizontal: 14, alignSelf: 'flex-start',
    },
    deviceText: { fontSize: 14, fontWeight: '700', color: C.gold },
    inputRow: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12,
      fontSize: 15, color: C.text, backgroundColor: C.bg, ...(Platform.OS === 'web' ? { outlineColor: C.gold } as any : {}),
    },
    goBtn: { minHeight: 46, minWidth: 64, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
    goText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    label: { fontSize: 13, fontWeight: '700', color: C.text },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
    chipOn: { backgroundColor: C.text, borderColor: C.text },
    chipText: { fontSize: 13, color: C.text },
    chipTextOn: { color: C.bg, fontWeight: '700' },
    linkBtn: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
    link: { fontSize: 14, fontWeight: '600', color: C.gold },
    error: { fontSize: 13, color: C.danger, lineHeight: 18 },
    small: { fontSize: 12, color: C.text3 },
  }));
}
