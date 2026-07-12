import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Colors } from '../constants/colors';
import { Theme } from '../constants/theme';

export default function DonateSuccessScreen() {
  const { amount, title } = useLocalSearchParams<{
    amount: string;
    title: string;
  }>();

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>

      {/* Checkmark */}
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.icon}>💚</Text>
      </Animated.View>

      {/* Content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.heading}>JazakAllahu Khayran</Text>
        <Text style={styles.sub}>Your donation has been received</Text>

        {/* Amount card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>YOU DONATED</Text>
          <Text style={styles.amount}>{amount}</Text>
        </View>

        {/* Campaign */}
        <View style={styles.campaignCard}>
          <Text style={styles.campaignLabel}>GOING TO</Text>
          <Text style={styles.campaignTitle}>{title}</Text>
        </View>

        {/* Hadith */}
        <View style={styles.hadithCard}>
          <Text style={styles.hadithText}>
            "Charity does not decrease wealth."
          </Text>
          <Text style={styles.hadithSource}>— Prophet Muhammad ﷺ</Text>
        </View>
      </Animated.View>

      {/* Actions */}
      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/(tabs)/seeds')}
        >
          <Text style={styles.primaryBtnText}>View More Campaigns</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.secondaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.xl,
    gap: Theme.spacing.xl,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.emeraldBg,
    borderWidth: 1.5,
    borderColor: Colors.emeraldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 44,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    gap: Theme.spacing.md,
  },
  heading: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: Theme.fontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  sub: {
    fontSize: Theme.fontSize.base,
    color: Colors.text3,
    textAlign: 'center',
  },
  amountCard: {
    width: '100%',
    backgroundColor: Colors.goldBg,
    borderRadius: Theme.radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.gold,
    padding: Theme.spacing.lg,
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
  },
  amountLabel: {
    fontSize: Theme.fontSize.xs,
    color: Colors.gold,
    letterSpacing: 1,
    marginBottom: 4,
  },
  amount: {
    fontSize: 40,
    fontWeight: Theme.fontWeight.bold,
    color: Colors.gold,
  },
  campaignCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    padding: Theme.spacing.lg,
  },
  campaignLabel: {
    fontSize: Theme.fontSize.xs,
    color: Colors.text3,
    letterSpacing: 1,
    marginBottom: 4,
  },
  campaignTitle: {
    fontSize: Theme.fontSize.base,
    fontWeight: Theme.fontWeight.semibold,
    color: Colors.text,
  },
  hadithCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    padding: Theme.spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  hadithText: {
    fontSize: Theme.fontSize.sm,
    color: Colors.text2,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  hadithSource: {
    fontSize: Theme.fontSize.xs,
    color: Colors.text3,
  },
  actions: {
    width: '100%',
    gap: Theme.spacing.sm,
  },
  primaryBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Colors.black,
    fontSize: Theme.fontSize.base,
    fontWeight: Theme.fontWeight.bold,
  },
  secondaryBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.border2,
  },
  secondaryBtnText: {
    color: Colors.text2,
    fontSize: Theme.fontSize.base,
    fontWeight: Theme.fontWeight.medium,
  },
});