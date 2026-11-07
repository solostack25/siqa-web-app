import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Theme } from '../../constants/theme';
import { IS_MARKETPLACE_SITE } from '../../lib/site';
import { brandStyles } from '../../lib/ds';
import { Button } from '../../components/ui';
import { SocialSignIn } from '../../components/SocialSignIn';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  async function handleSignUp() {
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!agreed) {
      setError('Please agree to the Terms of use and community rules to continue');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), terms_accepted_at: new Date().toISOString(), terms_version: '2026-11-07' },
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.replace((IS_MARKETPLACE_SITE ? '/marketplace' : '/(tabs)/dashboard') as any);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <Text style={styles.logoArabic}>صِقا</Text>
          <Text style={styles.logoEn}>SIQA</Text>
          <Text style={styles.tagline}>
            {IS_MARKETPLACE_SITE
              ? "Shop Muslim-owned businesses."
              : "The home for Islamic speakers.\nHalal content, real community."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Create your account</Text>

          <SocialSignIn onSignedIn={() => router.replace((IS_MARKETPLACE_SITE ? '/marketplace' : '/(tabs)/dashboard') as any)} colors={{ text: Colors.text, text2: Colors.text2, text3: Colors.text3, bg: Colors.bg, border: '#d9d9d6' }} />

          <View style={styles.field}>
            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={Colors.text3}
              value={fullName}
              onChangeText={t => { setFullName(t); setError(''); }}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="you@email.com"
              placeholderTextColor={Colors.text3}
              value={email}
              onChangeText={t => { setEmail(t); setError(''); }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor={Colors.text3}
              value={password}
              onChangeText={t => { setPassword(t); setError(''); }}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={handleSignUp}
            />
          </View>

          {/* Apple Guideline 1.2: people agree to the community rules before they can post. */}
          <TouchableOpacity
            onPress={() => { setAgreed(a => !a); setError(''); }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: agreed ? Colors.text : Colors.text3, backgroundColor: agreed ? Colors.text : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              {agreed ? <Text style={{ color: Colors.bg, fontSize: 14, fontWeight: '800', lineHeight: 16 }}>✓</Text> : null}
            </View>
            <Text style={[styles.disclaimer, { flex: 1, textAlign: 'left', marginTop: 0, fontSize: 13, lineHeight: 19, color: Colors.text2 ?? Colors.text3 }]}>
              I agree to the{' '}
              <Text style={{ color: Colors.text, textDecorationLine: 'underline' }} onPress={() => router.push('/terms' as any)}>Terms of use</Text>
              , including the community rules (no abusive or objectionable content), and the{' '}
              <Text style={{ color: Colors.text, textDecorationLine: 'underline' }} onPress={() => router.push('/privacy' as any)}>Privacy policy</Text>.
            </Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label={'Create Account'} onPress={handleSignUp} loading={loading} style={{ marginTop: 8 }} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.footerLink}>Sign in →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create(brandStyles({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  // Capped so the form is a centered column on desktop instead of stretching
  // edge to edge; phones are narrower than the cap, so nothing changes there.
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Theme.spacing.xl,
    paddingTop: 80,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: Theme.spacing.xxxl,
  },
  logoArabic: {
    fontSize: 64,
    color: Colors.gold,
    lineHeight: 72,
  },
  logoEn: {
    fontSize: 11,
    color: Colors.text3,
    letterSpacing: 6,
    marginTop: -4,
    marginBottom: Theme.spacing.lg,
  },
  tagline: {
    fontSize: Theme.fontSize.md,
    color: Colors.text2,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    padding: Theme.spacing.xl,
    gap: Theme.spacing.md,
  },
  heading: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Theme.spacing.sm,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: Theme.fontSize.xs,
    color: Colors.text3,
    letterSpacing: 1,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.md,
    color: Colors.text,
    fontSize: Theme.fontSize.base,
  },
  error: {
    fontSize: Theme.fontSize.sm,
    color: Colors.live,
    textAlign: 'center',
    paddingVertical: 4,
  },
  submitBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: Colors.black,
    fontSize: Theme.fontSize.base,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Theme.spacing.xl,
  },
  footerText: {
    fontSize: Theme.fontSize.sm,
    color: Colors.text3,
  },
  footerLink: {
    fontSize: Theme.fontSize.sm,
    color: Colors.gold,
    fontWeight: '600',
  },
}));
