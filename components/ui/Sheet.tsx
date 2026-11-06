import { Modal, Pressable, ScrollView, Text, View, Platform } from 'react-native';
import { Icon, type SiqaIconName } from '../Icon';
import { IconButton } from './Button';
import { font, radius, type, useDS } from '../../lib/ds';

/** Bottom sheet over a dimmed screen. Phones only; content scrolls. */
export function BottomSheet({ visible, onClose, title, children, footer }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const { c, shadow } = useDS();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }} onPress={onClose} accessibilityLabel="Close" />
        <View style={[{ maxHeight: '88%', backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, width: '100%', maxWidth: 560, alignSelf: 'center' }, shadow('sheet')]}>
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: c.surfaceStrong, marginTop: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 6 }}>
            <Text style={[type.headline, { flex: 1, color: c.ink }]} accessibilityRole="header">{title}</Text>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: footer ? 8 : 28, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}>{footer}</View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** One choice inside a sheet: radio (single) or check (multi). */
export function OptionRow({ label, sub, selected = false, onPress, icon, multi, last, action }: {
  label: string; sub?: string; selected?: boolean; onPress: () => void; icon?: SiqaIconName; multi?: boolean; last?: boolean;
  /** A plain action (no radio): shows a chevron instead. */
  action?: boolean;
}) {
  const { c } = useDS();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={action ? 'button' : multi ? 'checkbox' : 'radio'}
      accessibilityState={action ? undefined : { checked: selected }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1 })}
    >
      {icon ? <Icon name={icon} size={22} color={c.ink} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, font(selected ? 600 : 500), { color: c.ink }]}>{label}</Text>
        {sub ? <Text style={[type.caption, font(400), { color: c.ink2 }]}>{sub}</Text> : null}
      </View>
      {action ? <Icon name="chevron-forward" size={17} color={c.ink3} /> : <View
        style={{
          width: 24, height: 24, borderRadius: multi ? 7 : 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: selected ? c.primary : 'transparent', borderWidth: selected ? 0 : 1.5, borderColor: c.lineControl,
        }}
      >
        {selected ? <Icon name="checkmark" size={15} color={c.onPrimary} /> : null}
      </View>}
    </Pressable>
  );
}
