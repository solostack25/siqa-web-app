import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme } from '../constants/theme';

export default function OrderSuccessScreen() {
  const { total, count } = useLocalSearchParams<{ total: string; count: string }>();
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const itemCount = Number(count) || 1;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.icon}>🛍️</Text>
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.heading}>Order Placed</Text>
        <Text style={styles.sub}>
          Your order{itemCount > 1 ? ` (${itemCount} items)` : ''} has been received
        </Text>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>YOU PAID</Text>
          <Text style={styles.amount}>{total}</Text>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            The seller has been notified and will confirm shipping soon. You can track this order from your dashboard.
          </Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/marketplace' as any)}>
          <Text style={styles.primaryBtnText}>Continue Shopping</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.secondaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: Theme.spacing.xl, gap: Theme.spacing.xl,
    },
    iconWrap: {
      width: 100, height: 100, borderRadius: 50, backgroundColor: C.goldBg,
      borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center',
    },
    icon: { fontSize: 44 },
    content: { width: '100%', alignItems: 'center', gap: Theme.spacing.md },
    heading: { fontSize: Theme.fontSize.xxl, fontWeight: '700', color: C.text, textAlign: 'center' },
    sub: { fontSize: Theme.fontSize.base, color: C.text3, textAlign: 'center' },
    amountCard: {
      width: '100%', backgroundColor: C.goldBg, borderRadius: Theme.radius.lg,
      borderWidth: 0.5, borderColor: C.gold, padding: Theme.spacing.lg, alignItems: 'center', marginTop: Theme.spacing.sm,
    },
    amountLabel: { fontSize: Theme.fontSize.xs, color: C.gold, letterSpacing: 1, marginBottom: 4 },
    amount: { fontSize: 40, fontWeight: '700', color: C.gold },
    noteCard: {
      width: '100%', backgroundColor: C.surface, borderRadius: Theme.radius.lg,
      borderWidth: 0.5, borderColor: C.border2, padding: Theme.spacing.lg,
    },
    noteText: { fontSize: Theme.fontSize.sm, color: C.text2, lineHeight: 20, textAlign: 'center' },
    actions: { width: '100%', gap: Theme.spacing.sm },
    primaryBtn: { backgroundColor: C.gold, borderRadius: Theme.radius.md, padding: Theme.spacing.lg, alignItems: 'center' },
    primaryBtnText: { color: C.black, fontSize: Theme.fontSize.base, fontWeight: '700' },
    secondaryBtn: {
      backgroundColor: C.surface, borderRadius: Theme.radius.md, padding: Theme.spacing.lg,
      alignItems: 'center', borderWidth: 0.5, borderColor: C.border2,
    },
    secondaryBtnText: { color: C.text2, fontSize: Theme.fontSize.base, fontWeight: '500' },
  });
}
