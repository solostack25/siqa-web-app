import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme } from '../constants/theme';
import { Icon } from './Icon';

export type ClaimEntityType = 'speaker' | 'business' | 'organization';

/**
 * Shown on any profile Siqa put together from public information
 * (speakers seeded from public lectures, businesses added to the
 * directory) until the real owner claims it and an admin approves.
 *
 * Usage on a business page:
 *   {!business.is_claimed && <ClaimNotice entityType="business" entityId={business.id} name={business.name} />}
 */
export function ClaimNotice({
  entityType,
  entityId,
  name,
  compact = false,
}: {
  entityType: ClaimEntityType;
  entityId: string;
  name: string;
  compact?: boolean;
}) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);

  const body = entityType === 'speaker'
    ? `Siqa put this page together from ${name}'s publicly available lectures so they're easy to find in one place. ${name} hasn't claimed this profile, doesn't run it, and hasn't endorsed Siqa.`
    : entityType === 'organization'
      ? `Siqa listed ${name} from public records (IRS filings, maps and websites). The organization hasn't claimed this listing, so details may be out of date and it can't take donations on Siqa yet.`
      : `Siqa listed ${name} using publicly available information. The business hasn't claimed this listing yet, so hours, contact details and offers may be out of date.`;

  const ask = entityType === 'speaker'
    ? `Are you ${name}, or authorized to represent them?`
    : entityType === 'organization'
      ? `Do you run ${name}?`
      : `Own or manage ${name}?`;
  const noun = entityType === 'speaker' ? 'profile' : entityType === 'organization' ? 'organization' : 'business';

  return (
    <View style={[s.card, compact && s.cardCompact]} accessibilityRole="summary">
      <View style={s.head}>
        <Icon name="information-circle-outline" size={20} color={C.text} />
        <Text style={s.title}>About this {entityType === 'speaker' ? 'profile' : 'listing'}</Text>
      </View>
      <Text style={s.body}>{body}</Text>
      <View style={s.footer}>
        <Text style={s.ask}>{ask}</Text>
        <TouchableOpacity
          style={s.btn}
          onPress={() => router.push({ pathname: '/claim', params: { type: entityType, id: entityId } } as any)}
          accessibilityRole="button"
        >
          <Icon name="shield-checkmark-outline" size={16} color={C.bg} />
          <Text style={s.btnText}>Claim this {noun}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Small pill for headers and cards. */
export function UnclaimedBadge() {
  const { colors: C } = useTheme();
  const s = makeStyles(C);
  return (
    <View style={s.badge} accessibilityLabel="Unclaimed profile">
      <Text style={s.badgeText}>Unclaimed</Text>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      gap: 10, padding: 18, borderRadius: Theme.radius.lg,
      borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2,
    },
    cardCompact: { padding: 14, gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 16, fontWeight: '700', color: C.text },
    body: { fontSize: 14, lineHeight: 21, color: C.text2 },
    footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 },
    ask: { fontSize: 13, color: C.text2, flexShrink: 1 },
    btn: {
      height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.text,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    btnText: { color: C.bg, fontSize: 14, fontWeight: '700' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
    badgeText: { fontSize: 12, fontWeight: '700', color: C.text2 },
  });
}
