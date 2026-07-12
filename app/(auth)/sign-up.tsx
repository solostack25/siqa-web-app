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

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignUp() {
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.replace('/(tabs)/dashboard');
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
            The home for Islamic speakers.{'\n'}Halal content, real community.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Create your account</Text>

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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.black} />
            ) : (
              <Text style={styles.submitText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            By creating an account you agree to our Terms of Service.
          </Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Theme.spacing.xl,
    paddingTop: 80,
    paddingBottom: 40,
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
});
