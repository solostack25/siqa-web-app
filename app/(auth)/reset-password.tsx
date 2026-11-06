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
import { Glyph } from '../../components/Glyph';
import { Theme } from '../../constants/theme';
import { brandStyles, font } from '../../lib/ds';
import { Button } from '../../components/ui';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  // Web only: is there a valid reset session from the email link?
  const [linkState, setLinkState] = useState<'checking' | 'ok' | 'invalid'>(
    Platform.OS === 'web' ? 'checking' : 'ok',
  );
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Expired/used links come back as #error=...&error_description=...
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const errDesc = hash.get('error_description') || query.get('error_description');
    if (errDesc) {
      const msg = errDesc.replace(/\+/g, ' ').trim();
      setLinkError(/[.!?]$/.test(msg) ? msg : `${msg}.`);
      setLinkState('invalid');
      return;
    }
    let cancelled = false;
    // The client reads the tokens from the link on startup; give it a
    // moment, then check we actually have a session to update.
    const check = async () => {
      for (let i = 0; i < 10 && !cancelled; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { if (!cancelled) setLinkState('ok'); return; }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!cancelled) setLinkState('invalid');
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setLinkState('ok');
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

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

  if (linkState === 'checking') {
    return (
      <View style={styles.centeredWrap}>
        <ActivityIndicator color={Colors.gold} />
      </View>
    );
  }

  if (linkState === 'invalid') {
    return (
      <View style={styles.centeredWrap}>
        <Glyph name="time-outline" style={styles.doneEmoji} color={Colors.gold} />
        <Text style={styles.doneTitle}>This reset link has expired</Text>
        <Text style={[styles.doneSub, { textAlign: 'center', maxWidth: 380, paddingHorizontal: 24 }]}>
          {linkError || 'Reset links work once and expire after a while.'} Request a new one and use the latest email.
        </Text>
        <Button label="Send a new link" size="md" onPress={() => router.replace('/(auth)/forgot-password' as any)} style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.centeredWrap}>
        <Glyph name="checkmark-circle-outline" style={styles.doneEmoji} color={Colors.emeraldLight} />
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
                <Glyph name={showPassword ? 'eye-off-outline' : 'eye-outline'} style={styles.eyeIcon} color={Colors.text2} />
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

          <Button label={'Update Password'} onPress={handleUpdate} loading={loading} style={{ marginTop: 8 }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create(brandStyles({
  container: { flex: 1, backgroundColor: Colors.bg },
  // Capped so the form is a centered column on desktop instead of stretching
  // edge to edge; phones are narrower than the cap, so nothing changes there.
  wrap: { flex: 1, paddingHorizontal: Theme.spacing.xl, paddingTop: 80, width: '100%', maxWidth: 440, alignSelf: 'center' },
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
}));
