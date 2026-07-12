import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Theme } from '../../constants/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleReset() {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    setError('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: 'siqa://reset-password' }
    );
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.centeredWrap}>
          <Text style={styles.sentEmoji}>📬</Text>
          <Text style={styles.sentTitle}>Check your email</Text>
          <Text style={styles.sentSub}>
            We sent a password reset link to{' '}
            <Text style={styles.sentEmail}>{email}</Text>.
            {'\n\n'}Tap the link in the email to set a new password.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.backBtnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.logoArabic}>صِقا</Text>

        <Text style={styles.heading}>Reset your password</Text>
        <Text style={styles.sub}>
          Enter your email and we'll send you a link to reset your password.
        </Text>

        <View style={styles.card}>
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
              returnKeyType="done"
              onSubmitEditing={handleReset}
              autoFocus
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleReset}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.black} />
            ) : (
              <Text style={styles.submitText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  wrap: { flex: 1, paddingHorizontal: Theme.spacing.xl, paddingTop: 60 },
  backLink: { marginBottom: Theme.spacing.xl },
  backLinkText: { fontSize: Theme.fontSize.base, color: Colors.gold, fontWeight: '600' },
  logoArabic: { fontSize: 48, color: Colors.gold, marginBottom: Theme.spacing.lg },
  heading: { fontSize: Theme.fontSize.xxl, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  sub: { fontSize: Theme.fontSize.base, color: Colors.text2, lineHeight: 22, marginBottom: Theme.spacing.xl },
  card: { backgroundColor: Colors.surface, borderRadius: Theme.radius.xl, borderWidth: 0.5, borderColor: Colors.border2, padding: Theme.spacing.xl, gap: Theme.spacing.md },
  field: { gap: 6 },
  label: { fontSize: Theme.fontSize.xs, color: Colors.text3, letterSpacing: 1, fontWeight: '600' },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border2, borderRadius: Theme.radius.md, padding: Theme.spacing.md, color: Colors.text, fontSize: Theme.fontSize.base },
  error: { fontSize: Theme.fontSize.sm, color: Colors.live, textAlign: 'center' },
  submitBtn: { backgroundColor: Colors.gold, borderRadius: Theme.radius.md, padding: Theme.spacing.lg, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.black, fontSize: Theme.fontSize.base, fontWeight: '700' },
  centeredWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Theme.spacing.xl, gap: 16 },
  sentEmoji: { fontSize: 64 },
  sentTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  sentSub: { fontSize: 15, color: Colors.text2, textAlign: 'center', lineHeight: 24 },
  sentEmail: { color: Colors.gold, fontWeight: '600' },
  backBtn: { backgroundColor: Colors.gold, paddingHorizontal: 32, paddingVertical: 14, borderRadius: Theme.radius.md, marginTop: 8 },
  backBtnText: { color: Colors.black, fontSize: Theme.fontSize.base, fontWeight: '700' },
});
