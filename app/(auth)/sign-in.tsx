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
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Glyph, type GlyphName } from '../../components/Glyph';
import { Theme } from '../../constants/theme';
import { IS_MARKETPLACE_SITE, SITE_HOME } from '../../lib/site';
import { brandStyles } from '../../lib/ds';
import { Button } from '../../components/ui';
import { SocialSignIn } from '../../components/SocialSignIn';
import { setSignupIntent, consumeSignupIntent, INTENT_ROUTE, type SignupIntent } from '../../lib/signupIntent';

type Role = 'viewer' | 'speaker' | 'org' | 'seller';
type RoleOption = { key: Role; label: string; icon: GlyphName; desc: string };

// Seller isn't an account type: any account can open a shop. Picking it just
// sends them straight into Sell on Siqa after sign-up.
const SELLER: RoleOption = { key: 'seller', label: 'Seller', icon: 'storefront-outline', desc: 'Open a shop and list your products (reviewed by Siqa)' };

const ROLES: RoleOption[] = [
  { key: 'viewer',  label: 'Community Member', icon: 'people-outline', desc: 'Follow speakers, save clips, donate' },
  { key: 'speaker', label: 'Speaker',           icon: 'mic-outline', desc: 'Apply to share Gems (reviewed by Siqa)' },
  { key: 'org',     label: 'Organization',      icon: 'business-outline', desc: 'Apply to fundraise (verified by Siqa)' },
  SELLER,
];

// shop.siqa.us: just shopping or selling.
const SHOP_ROLES: RoleOption[] = [
  { key: 'viewer', label: 'Shopper', icon: 'bag-handle-outline', desc: 'Buy from Muslim-owned businesses' },
  SELLER,
];

export default function LoginScreen() {
  const params = useLocalSearchParams<{ mode?: string; role?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>(params.mode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  // ?role=seller lets "Sell on Siqa" links open Create Account with Seller picked.
  const [role, setRole] = useState<Role>(params.role === 'seller' ? 'seller' : 'viewer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  async function handleSignIn() {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setError(error.message); setLoading(false); return; }
    // Signed up as a Seller, confirmed their email, now signing in.
    const intent = consumeSignupIntent();
    router.replace((intent ? INTENT_ROUTE[intent] : SITE_HOME) as any);
  }

  async function handleSignUp() {
    if (!fullName || !email || !password) { setError('Please fill in all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!agreed) { setError('Please agree to the Terms of use and community rules to continue'); return; }
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // No role in metadata: every new account starts as a viewer. Speakers
      // and organizations apply and are approved by Siqa (enforced in the DB).
      options: { data: { full_name: fullName, terms_accepted_at: new Date().toISOString(), terms_version: '2026-11-07' } },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) {
      setSignupIntent(null);
      if (role === 'speaker') router.replace('/apply-speaker' as any);
      else if (role === 'seller') router.replace('/sell' as any);
      else if (role === 'org') router.replace('/org-register' as any);
      else router.replace(SITE_HOME as any);
    } else {
      // Remember the choice so their first sign-in after confirming lands on Sell on Siqa.
      setSignupIntent(role === 'viewer' ? null : (role as SignupIntent));
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
            {IS_MARKETPLACE_SITE
              ? "Shop Muslim-owned businesses.\nSign in to check out, message sellers and track orders."
              : "The home for Islamic speakers.\nHalal content, real community."}
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
          {/* Picked before Apple/Google so the choice applies to those too. */}
          {mode === 'signup' && (
            <>
              {/* Role selector. Shop site: Shopper or Seller. */}
              <>
              <Text style={styles.roleLabel}>I AM A...</Text>
              <View style={styles.roleRow}>
                {(IS_MARKETPLACE_SITE ? SHOP_ROLES : ROLES).map(r => (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.roleCard, role === r.key && styles.roleCardActive]}
                    onPress={() => setRole(r.key)}
                    activeOpacity={0.8}
                  >
                    <Glyph name={r.icon} style={styles.roleIcon} color={role === r.key ? Colors.gold : Colors.text2} />
                    <Text style={[styles.roleCardLabel, role === r.key && styles.roleCardLabelActive]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.roleDesc}>
                {(IS_MARKETPLACE_SITE ? SHOP_ROLES : ROLES).find(r => r.key === role)?.desc}
              </Text>
              </>
            </>
          )}

          <SocialSignIn onError={setError} intent={mode === 'signup' && role !== 'viewer' ? (role as SignupIntent) : null} />

          {mode === 'signup' && (
            <>

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
                <Glyph name={showPassword ? 'eye-off-outline' : 'eye-outline'} style={styles.eyeIcon} color={Colors.text2} />
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

          {mode === 'signup' && (
            // Apple Guideline 1.2: people agree to the community rules before they can post.
            <TouchableOpacity
              onPress={() => { setAgreed(a => !a); setError(''); }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4, marginBottom: 4 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: agreed ? Colors.text : Colors.text3, backgroundColor: agreed ? Colors.text : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                {agreed ? <Text style={{ color: Colors.bg, fontSize: 14, fontWeight: '800', lineHeight: 16 }}>✓</Text> : null}
              </View>
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: Colors.text2 }}>
                I agree to the{' '}
                <Text style={{ color: Colors.text, textDecorationLine: 'underline' }} onPress={() => router.push('/terms' as any)}>Terms of use</Text>
                , including the community rules (no abusive or objectionable content), and the{' '}
                <Text style={{ color: Colors.text, textDecorationLine: 'underline' }} onPress={() => router.push('/privacy' as any)}>Privacy policy</Text>.
              </Text>
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label={mode === 'signin' ? 'Sign In' : 'Create Account'} onPress={mode === 'signin' ? handleSignIn : handleSignUp} loading={loading} style={{ marginTop: 8 }} />

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => router.replace(SITE_HOME as any)}
          >
            <Text style={styles.skipText}>Browse without an account →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create(brandStyles({
  container: { flex: 1, backgroundColor: Colors.bg },
  // Capped so the form is a centered column on desktop instead of stretching
  // edge to edge; phones are narrower than the cap, so nothing changes there.
  scroll: { flexGrow: 1, paddingHorizontal: Theme.spacing.xl, paddingTop: 80, paddingBottom: 40, width: '100%', maxWidth: 440, alignSelf: 'center' },
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
}));