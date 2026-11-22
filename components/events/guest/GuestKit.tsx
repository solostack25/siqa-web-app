// Guest-facing event pages: page frame, payment step, test-mode note.
import { View, Text, ScrollView, Platform, Pressable } from 'react-native';
import { useEffect } from 'react';
import { font, radius, space, type, useDS } from '../../../lib/ds';
import { useTheme } from '../../../lib/theme';
import { Icon } from '../../Icon';

const WebDonateForm = Platform.OS === 'web' ? require('../../WebDonateForm').default : () => null;

export function GuestPage({ children, title, max = 720 }: { children: React.ReactNode; title?: string; max?: number }) {
  const { c } = useDS();
  useEffect(() => { if (title && Platform.OS === 'web' && typeof document !== 'undefined') document.title = `${title} · Siqa`; }, [title]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: max, paddingHorizontal: space[4], paddingTop: space[4], gap: space[5] }}>{children}</View>
      <Text style={[type.caption, { color: c.ink3, marginTop: space[8] }]}>Powered by Siqa</Text>
    </ScrollView>
  );
}

export function TestModeNote() {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: c.goldTint }}>
      <Icon name="flask-outline" size={18} color={c.goldInk} />
      <Text style={[type.caption, { color: c.goldInk, flex: 1 }]}>
        Test mode — no real money moves. Use card 4242 4242 4242 4242, any future date, any CVC and ZIP.
      </Text>
    </View>
  );
}

/** Stripe card step. */
export function PayStep({ clientSecret, label, variant = 'primary', onPaid, onCancel, testMode }: {
  clientSecret: string; label: string; variant?: 'primary' | 'gold'; onPaid: (paymentIntentId: string) => void; onCancel: () => void; testMode?: boolean;
}) {
  const { colors, isDark } = useTheme();
  if (Platform.OS !== 'web') return <Text>Open this page in a browser to pay.</Text>;
  return (
    <View style={{ gap: space[3] }}>
      {testMode ? <TestModeNote /> : null}
      <WebDonateForm clientSecret={clientSecret} colors={colors} isDark={isDark} onSuccess={onPaid} onCancel={onCancel} confirmLabel={label} confirmVariant={variant} />
    </View>
  );
}

export function AmountChips({ amounts, value, onPick }: { amounts: number[]; value: number | null; onPick: (cents: number) => void }) {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      {amounts.map((a) => {
        const on = value === a;
        return (
          <Pressable key={a} onPress={() => onPick(a)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={({ pressed }) => ({ minWidth: 92, height: 52, paddingHorizontal: 16, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? c.gold : c.surfaceSoft, borderWidth: 1.5, borderColor: on ? c.gold : 'transparent', opacity: pressed ? 0.85 : 1 })}>
            <Text style={[type.headline, font(800), { color: on ? c.onGold : c.ink }]}>{a === 0 ? 'No thanks' : `$${(a / 100).toLocaleString('en-US')}`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
