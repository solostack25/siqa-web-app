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

type Role = 'viewer' | 'speaker' | 'org';

const ROLES: { key: Role; label: string; icon: string; desc: string }[] = [
  { key: 'viewer',  label: 'Community Member', icon: '🕌', desc: 'Follow speakers, save clips, donate' },
  { key: 'speaker', label: 'Speaker',           icon: '🎤', desc: 'Share knowledge, grow your reach' },
  { key: 'org',     label: 'Organization',      icon: '🏢', desc: 'Fundraise and manage your nonprofit' },
];

export default function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.replace('/(tabs)');
  }

  async function handleSignUp() {
    if (!fullName || !email || !password) { setError('Please fill in all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) {
      await supabase.from('profiles').update({ role }).eq('id', data.session.user.id);
      router.replace('/(tabs)');
    } else {
      setError('Check your email to confirm your account.');
      setLoading(false);
    }
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

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'signin' && styles.tabActive]}
            onPress={() => { setMode('signin'); setError(''); }}
          >
            <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'signup' && styles.tabActive]}
            onPress={() => { setMode('signup'); setError(''); }}
          >
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Create Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {mode === 'signup' && (
            <>
              {/* Role selector */}
              <Text style={styles.roleLabel}>I AM A...</Text>
              <View style={styles.roleRow}>
                {ROLES.map(r => (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.roleCard, role === r.key && styles.roleCardActive]}
                    onPress={() => setRole(r.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.roleIcon}>{r.icon}</Text>
                    <Text style={[styles.roleCardLabel, role === r.key && styles.roleCardLabelActive]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.roleDesc}>
                {ROLES.find(r => r.key === role)?.desc}
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>FULL NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={Colors.text3}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            </>
          )}

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
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor={Colors.text3}
                value={password}
                onChangeText={t => { setPassword(t); setError(''); }}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={mode === 'signin' ? handleSignIn : handleSignUp}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(p => !p)}
                activeOpacity={0.7}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {mode === 'signin' && (
            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => router.push('/(auth)/forgot-password' as any)}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={mode === 'signin' ? handleSignIn : handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.black} />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.skipText}>Browse without an account →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: Theme.spacing.xl, paddingTop: 80, paddingBottom: 40 },
  logoWrap: { alignItems: 'center', marginBottom: Theme.spacing.xxxl },
  logoArabic: { fontSize: 64, color: Colors.gold, lineHeight: 72 },
  logoEn: { fontSize: 11, color: Colors.text3, letterSpacing: 6, marginTop: -4, marginBottom: Theme.spacing.lg },
  tagline: { fontSize: Theme.fontSize.md, color: Colors.text2, textAlign: 'center', lineHeight: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Theme.spacing.xxl },
  tab: { flex: 1, paddingVertical: Theme.spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: Colors.transparent, marginBottom: -1 },
  tabActive: { borderBottomColor: Colors.gold },
  tabText: { fontSize: Theme.fontSize.md, color: Colors.text3, fontWeight: Theme.fontWeight.medium },
  tabTextActive: { color: Colors.gold },
  form: { gap: Theme.spacing.md },
  field: { gap: 6 },
  label: { fontSize: Theme.fontSize.xs, color: Colors.text3, letterSpacing: 1, fontWeight: '600' },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2, borderRadius: Theme.radius.md, padding: Theme.spacing.md, color: Colors.text, fontSize: Theme.fontSize.base },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2, borderRadius: Theme.radius.md },
  passwordInput: { flex: 1, padding: Theme.spacing.md, color: Colors.text, fontSize: Theme.fontSize.base },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  eyeIcon: { fontSize: 18 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -4 },
  forgotText: { fontSize: Theme.fontSize.sm, color: Colors.gold, fontWeight: '600' },
  error: { fontSize: Theme.fontSize.sm, color: Colors.live, textAlign: 'center' },
  submitBtn: { backgroundColor: Colors.gold, borderRadius: Theme.radius.md, padding: Theme.spacing.lg, alignItems: 'center', marginTop: Theme.spacing.sm },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.black, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.bold },
  skipBtn: { alignItems: 'center', padding: Theme.spacing.md },
  skipText: { fontSize: Theme.fontSize.sm, color: Colors.text3 },
  // Role selector
  roleLabel: { fontSize: Theme.fontSize.xs, color: Colors.text3, letterSpacing: 1, fontWeight: '600' },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleCard: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.surface, gap: 4 },
  roleCardActive: { borderColor: Colors.gold, backgroundColor: 'rgba(201,168,76,0.08)' },
  roleIcon: { fontSize: 20 },
  roleCardLabel: { fontSize: 10, color: Colors.text2, fontWeight: '600', textAlign: 'center' },
  roleCardLabelActive: { color: Colors.gold },
  roleDesc: { fontSize: Theme.fontSize.xs, color: Colors.text3, textAlign: 'center', lineHeight: 16, marginTop: -4 },
});