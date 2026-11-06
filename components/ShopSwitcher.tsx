import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme, type AppColors } from '../lib/theme';
import { brandStyles } from '../lib/ds';

/**
 * Shop has two sides: Products (Marketplace, bought and shipped through
 * Siqa) and Local & services (directory: contact the business directly).
 */
export function ShopSwitcher({ active, stretch = false }: { active: 'products' | 'local'; stretch?: boolean }) {
  const { colors: C } = useTheme();
  const s = makeStyles(C);

  function go(to: 'products' | 'local') {
    if (to === active) return;
    // Both live under the Shop tab, so switch in place (no back stack).
    router.navigate((to === 'local' ? '/local' : '/(tabs)/marketplace') as any);
  }

  return (
    <View style={[s.wrap, stretch && { alignSelf: 'stretch' }]} accessibilityRole="tablist">
      {([['products', 'Products'], ['local', 'Local & services']] as const).map(([k, label]) => (
        <TouchableOpacity
          key={k}
          style={[s.btn, stretch && { flex: 1 }, active === k && s.btnOn]}
          onPress={() => go(k)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === k }}
        >
          <Text style={[s.text, active === k && s.textOn]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create(brandStyles({
    wrap: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, gap: 2, borderRadius: 999, backgroundColor: C.surface2 },
    btn: { minHeight: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    btnOn: { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    text: { fontSize: 14, color: C.text2, fontWeight: '500' },
    textOn: { color: C.text, fontWeight: '700' },
  }));
}
