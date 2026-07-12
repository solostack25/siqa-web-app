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
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Theme } from '../../constants/theme';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleUpdate() {
    if (!password || !confirm) { setError('Please fill in both fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    setDone(true);
    setTimeout(() => router.replace('/(tabs)/dashboard'), 2000);
  }

  if (done) {
    return (
      <View style={styles.centeredWrap}>
        <Text style={styles.doneEmoji}>✅</Text>
        <Text style={styles.doneTitle}>Password updated!</Text>
        <Text style={styles.doneSub}>Taking you to the app...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.wrap}>
        <Text style={styles.logoArabic}>صِقا</Text>
        <Text style={styles.heading}>Set new password</Text>
        <Text style={styles.sub}>Choose a strong password for your account.</Text>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>NEW PASSWORD</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="At least 6 characters"
                placeholderTextColor={Colors.text3}
                value={password}
                onChangeText={t => { setPassword(t); setError(''); }}
                secureTextEntry={!showPassword}
                autoFocus
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(p => !p)}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="Repeat password"
              placeholderTextColor={Colors.text3}
              value={confirm}
              onChangeText={t => { setConfirm(t); setError(''); }}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleUpdate}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleUpdate}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color={Colors.black} /> : <Text style={styles.submitText}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  wrap: { flex: 1, paddingHorizontal: Theme.spacing.xl, paddingTop: 80 },
  logoArabic: { fontSize: 48, color: Colors.gold, marginBottom: Theme.spacing.lg },
  heading: { fontSize: Theme.fontSize.xxl, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  sub: { fontSize: Theme.fontSize.base, color: Colors.text2, lineHeight: 22, marginBottom: Theme.spacing.xl },
  card: { backgroundColor: Colors.surface, borderRadius: Theme.radius.xl, borderWidth: 0.5, borderColor: Colors.border2, padding: Theme.spacing.xl, gap: Theme.spacing.md },
  field: { gap: 6 },
  label: { fontSize: Theme.fontSize.xs, color: Colors.text3, letterSpacing: 1, fontWeight: '600' },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border2, borderRadius: Theme.radius.md, padding: Theme.spacing.md, color: Colors.text, fontSize: Theme.fontSize.base },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border2, borderRadius: Theme.radius.md },
  passwordInput: { flex: 1, padding: Theme.spacing.md, color: Colors.text, fontSize: Theme.fontSize.base },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  eyeIcon: { fontSize: 18 },
  error: { fontSize: Theme.fontSize.sm, color: Colors.live, textAlign: 'center' },
  submitBtn: { backgroundColor: Colors.gold, borderRadius: Theme.radius.md, padding: Theme.spacing.lg, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.black, fontSize: Theme.fontSize.base, fontWeight: '700' },
  centeredWrap: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  doneEmoji: { fontSize: 64 },
  doneTitle: { fontSize: 24, fontWeight: '700', color: Colors.text },
  doneSub: { fontSize: 15, color: Colors.text2 },
});
