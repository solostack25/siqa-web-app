import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';
import { Theme } from '../constants/theme';

const ORG_TYPES = [
  { value: 'masjid', label: '🕌 Masjid' },
  { value: 'nonprofit', label: '🤝 Nonprofit' },
  { value: 'charity', label: '❤️ Charity' },
  { value: 'school', label: '🎓 School' },
  { value: 'relief', label: '🌍 Relief' },
  { value: 'community', label: '👥 Community' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

type FormData = {
  // Step 1
  org_name: string;
  org_type: string;
  city: string;
  state: string;
  website: string;
  // Step 2
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  ein: string;
  is_501c3: boolean;
  // Step 3
  mission: string;
  tagline: string;
  fundraising_history: string;
};

const INITIAL: FormData = {
  org_name: '',
  org_type: '',
  city: '',
  state: '',
  website: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  ein: '',
  is_501c3: false,
  mission: '',
  tagline: '',
  fundraising_history: '',
};

export default function OrgRegisterScreen() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [showStateDropdown, setShowStateDropdown] = useState(false);

  function set(key: keyof FormData, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function validateStep1() {
    if (!form.org_name.trim()) return 'Organization name is required';
    if (!form.org_type) return 'Please select an organization type';
    if (!form.city.trim()) return 'City is required';
    if (!form.state) return 'Please select a state';
    return null;
  }

  function validateStep2() {
    if (!form.contact_name.trim()) return 'Contact name is required';
    if (!form.contact_email.trim()) return 'Contact email is required';
    if (!/\S+@\S+\.\S+/.test(form.contact_email)) return 'Enter a valid email address';
    if (form.ein && !/^\d{2}-?\d{7}$/.test(form.ein.replace(/-/g, ''))) {
      return 'EIN must be in format XX-XXXXXXX';
    }
    return null;
  }

  function validateStep3() {
    if (!form.mission.trim()) return 'Please describe your organization\'s mission';
    return null;
  }

  function handleNext() {
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : null;
    if (err) {
      Alert.alert('Required', err);
      return;
    }
    setStep(s => s + 1);
  }

  async function handleSubmit() {
    const err = validateStep3();
    if (err) {
      Alert.alert('Required', err);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to register your organization.');
        router.push('/(auth)/sign-in' as any);
        return;
      }

      // Get the user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Create org record (pending approval)
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({
          profile_id: profile.id,
          org_name: form.org_name.trim(),
          org_type: form.org_type,
          city: form.city.trim(),
          state: form.state,
          website: form.website.trim() || null,
          ein: form.ein.trim() || null,
          mission: form.mission.trim(),
          tagline: form.tagline.trim() || null,
          approval_status: 'pending',
          trust_score: 60,
        })
        .select('id')
        .single();

      if (orgErr) throw orgErr;

      // Create the formal application record
      const { error: appErr } = await supabase
        .from('org_applications')
        .insert({
          org_id: org.id,
          profile_id: profile.id,
          org_name: form.org_name.trim(),
          org_type: form.org_type,
          ein: form.ein.trim() || null,
          website: form.website.trim() || null,
          city: form.city.trim(),
          state: form.state,
          contact_name: form.contact_name.trim(),
          contact_email: form.contact_email.trim(),
          contact_phone: form.contact_phone.trim() || null,
          is_501c3: form.is_501c3,
          fundraising_history: form.fundraising_history.trim() || null,
          status: 'pending',
        });

      if (appErr) throw appErr;

      // Update profile role to org
      await supabase
        .from('profiles')
        .update({ role: 'org' })
        .eq('id', profile.id);

      setStep(4); // success step
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const progress = (step / 3) * 100;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        {step < 4 && (
          <TouchableOpacity onPress={() => step > 1 ? setStep(s => s - 1) : router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Register Organization</Text>
          {step < 4 && <Text style={styles.headerStep}>Step {step} of 3</Text>}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      {step < 4 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepTitle}>About Your Organization</Text>
            <Text style={styles.stepSubtitle}>Tell us the basics — this shows on your public profile.</Text>

            <Field label="Organization Name *" required>
              <TextInput
                style={styles.input}
                placeholder="e.g. ICNA Relief USA"
                placeholderTextColor={Colors.text3}
                value={form.org_name}
                onChangeText={v => set('org_name', v)}
                autoCapitalize="words"
              />
            </Field>

            <Field label="Organization Type *">
              <View style={styles.typeGrid}>
                {ORG_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.typeChip, form.org_type === t.value && styles.typeChipActive]}
                    onPress={() => set('org_type', t.value)}
                  >
                    <Text style={[styles.typeChipText, form.org_type === t.value && styles.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <View style={styles.row}>
              <View style={{ flex: 1.4 }}>
                <Field label="City *">
                  <TextInput
                    style={styles.input}
                    placeholder="Houston"
                    placeholderTextColor={Colors.text3}
                    value={form.city}
                    onChangeText={v => set('city', v)}
                    autoCapitalize="words"
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="State *">
                  <TouchableOpacity
                    style={[styles.input, styles.dropdownTrigger]}
                    onPress={() => setShowStateDropdown(!showStateDropdown)}
                  >
                    <Text style={form.state ? styles.dropdownValue : styles.dropdownPlaceholder}>
                      {form.state || 'Select'}
                    </Text>
                    <Text style={styles.dropdownArrow}>{showStateDropdown ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {showStateDropdown && (
                    <ScrollView style={styles.dropdown} nestedScrollEnabled>
                      {US_STATES.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={styles.dropdownItem}
                          onPress={() => { set('state', s); setShowStateDropdown(false); }}
                        >
                          <Text style={[styles.dropdownItemText, form.state === s && styles.dropdownItemActive]}>
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </Field>
              </View>
            </View>

            <Field label="Website">
              <TextInput
                style={styles.input}
                placeholder="https://yourorg.org"
                placeholderTextColor={Colors.text3}
                value={form.website}
                onChangeText={v => set('website', v)}
                autoCapitalize="none"
                keyboardType="url"
              />
            </Field>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepTitle}>Contact & Legal Info</Text>
            <Text style={styles.stepSubtitle}>This stays private — we use it to review and verify your application.</Text>

            <Field label="Contact Name *">
              <TextInput
                style={styles.input}
                placeholder="Your full name"
                placeholderTextColor={Colors.text3}
                value={form.contact_name}
                onChangeText={v => set('contact_name', v)}
                autoCapitalize="words"
              />
            </Field>

            <Field label="Contact Email *">
              <TextInput
                style={styles.input}
                placeholder="you@yourorg.org"
                placeholderTextColor={Colors.text3}
                value={form.contact_email}
                onChangeText={v => set('contact_email', v)}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </Field>

            <Field label="Contact Phone">
              <TextInput
                style={styles.input}
                placeholder="(555) 000-0000"
                placeholderTextColor={Colors.text3}
                value={form.contact_phone}
                onChangeText={v => set('contact_phone', v)}
                keyboardType="phone-pad"
              />
            </Field>

            <Field label="EIN (Tax ID)">
              <TextInput
                style={styles.input}
                placeholder="XX-XXXXXXX"
                placeholderTextColor={Colors.text3}
                value={form.ein}
                onChangeText={v => set('ein', v)}
                keyboardType="numbers-and-punctuation"
              />
            </Field>

            <Field label="501(c)(3) Status">
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, form.is_501c3 && styles.toggleBtnActive]}
                  onPress={() => set('is_501c3', true)}
                >
                  <Text style={[styles.toggleText, form.is_501c3 && styles.toggleTextActive]}>
                    ✓ Yes, we are 501(c)(3)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, !form.is_501c3 && styles.toggleBtnActive]}
                  onPress={() => set('is_501c3', false)}
                >
                  <Text style={[styles.toggleText, !form.is_501c3 && styles.toggleTextActive]}>
                    Not yet
                  </Text>
                </TouchableOpacity>
              </View>
            </Field>

            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                🔒 Your EIN and contact details are never shared publicly. They're only used by the Siqa team to verify your organization.
              </Text>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepWrap}>
            <Text style={styles.stepTitle}>Your Mission</Text>
            <Text style={styles.stepSubtitle}>Help donors and community members understand who you are.</Text>

            <Field label="Mission Statement *">
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Describe what your organization does and who you serve..."
                placeholderTextColor={Colors.text3}
                value={form.mission}
                onChangeText={v => set('mission', v)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </Field>

            <Field label="Tagline">
              <TextInput
                style={styles.input}
                placeholder="A short, memorable phrase (optional)"
                placeholderTextColor={Colors.text3}
                value={form.tagline}
                onChangeText={v => set('tagline', v)}
                maxLength={80}
              />
              <Text style={styles.charCount}>{form.tagline.length}/80</Text>
            </Field>

            <Field label="Fundraising History">
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Have you run fundraisers before? Tell us about your experience (optional)..."
                placeholderTextColor={Colors.text3}
                value={form.fundraising_history}
                onChangeText={v => set('fundraising_history', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </Field>

            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>Review Summary</Text>
              <ReviewRow label="Org" value={form.org_name} />
              <ReviewRow label="Type" value={form.org_type} />
              <ReviewRow label="Location" value={`${form.city}, ${form.state}`} />
              <ReviewRow label="Contact" value={form.contact_email} />
              {form.ein ? <ReviewRow label="EIN" value={form.ein} /> : null}
              <ReviewRow label="501(c)(3)" value={form.is_501c3 ? 'Yes' : 'Not yet'} />
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.successWrap}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.successTitle}>Application Submitted!</Text>
            <Text style={styles.successBody}>
              Your organization <Text style={styles.successOrgName}>{form.org_name}</Text> has been submitted for review.
              {'\n\n'}
              The Siqa team typically reviews applications within 1–3 business days. You'll be notified once your organization is approved.
            </Text>
            <View style={styles.successSteps}>
              <SuccessStep n="1" label="Application submitted" done />
              <SuccessStep n="2" label="Siqa team reviews" />
              <SuccessStep n="3" label="Organization approved & live" />
            </View>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => router.replace('/(tabs)/orgs' as any)}
            >
              <Text style={styles.successBtnText}>Back to Organizations</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      {step < 4 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, submitting && styles.nextBtnDisabled]}
            onPress={step < 3 ? handleNext : handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.black} size="small" />
            ) : (
              <Text style={styles.nextBtnText}>
                {step < 3 ? 'Continue →' : 'Submit Application'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.footerNote}>
            {step === 3
              ? 'Your application will be reviewed within 1–3 business days.'
              : `${3 - step} step${3 - step !== 1 ? 's' : ''} remaining`}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function SuccessStep({ n, label, done }: { n: string; label: string; done?: boolean }) {
  return (
    <View style={styles.successStep}>
      <View style={[styles.successStepDot, done && styles.successStepDotDone]}>
        <Text style={styles.successStepN}>{done ? '✓' : n}</Text>
      </View>
      <Text style={[styles.successStepLabel, done && styles.successStepLabelDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: Theme.spacing.lg,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: Colors.text2 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: Theme.fontSize.base, fontWeight: '600', color: Colors.text },
  headerStep: { fontSize: Theme.fontSize.xs, color: Colors.text3, marginTop: 2 },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.surface,
    marginHorizontal: Theme.spacing.lg,
    borderRadius: 2,
    marginBottom: Theme.spacing.lg,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Theme.spacing.lg, paddingBottom: 40 },
  stepWrap: { gap: Theme.spacing.lg },
  stepTitle: { fontSize: Theme.fontSize.xl, fontWeight: '700', color: Colors.text },
  stepSubtitle: { fontSize: Theme.fontSize.sm, color: Colors.text3, lineHeight: 20, marginTop: -8 },
  field: { gap: 6 },
  fieldLabel: { fontSize: Theme.fontSize.sm, fontWeight: '600', color: Colors.text2 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: Theme.fontSize.base,
  },
  textarea: { minHeight: 96, paddingTop: 12 },
  charCount: { fontSize: 10, color: Colors.text3, textAlign: 'right', marginTop: 2 },
  row: { flexDirection: 'row', gap: Theme.spacing.md },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.border2,
  },
  typeChipActive: { backgroundColor: Colors.goldBg, borderColor: Colors.gold },
  typeChipText: { fontSize: Theme.fontSize.sm, color: Colors.text2 },
  typeChipTextActive: { color: Colors.gold, fontWeight: '600' },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownPlaceholder: { color: Colors.text3, fontSize: Theme.fontSize.base },
  dropdownValue: { color: Colors.text, fontSize: Theme.fontSize.base },
  dropdownArrow: { color: Colors.text3, fontSize: 10 },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: Colors.surface2,
    borderRadius: Theme.radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    maxHeight: 180,
    zIndex: 999,
  },
  dropdownItem: { paddingHorizontal: Theme.spacing.md, paddingVertical: 10 },
  dropdownItemText: { fontSize: Theme.fontSize.sm, color: Colors.text2 },
  dropdownItemActive: { color: Colors.gold, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: Colors.emeraldBg, borderColor: Colors.emerald },
  toggleText: { fontSize: Theme.fontSize.sm, color: Colors.text2, fontWeight: '500' },
  toggleTextActive: { color: Colors.emeraldLight, fontWeight: '700' },
  infoBox: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    padding: Theme.spacing.md,
  },
  infoBoxText: { fontSize: Theme.fontSize.sm, color: Colors.text3, lineHeight: 18 },
  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    borderWidth: 0.5,
    borderColor: Colors.border2,
    padding: Theme.spacing.lg,
    gap: 8,
  },
  reviewTitle: { fontSize: Theme.fontSize.sm, fontWeight: '700', color: Colors.text2, marginBottom: 4 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewLabel: { fontSize: Theme.fontSize.sm, color: Colors.text3 },
  reviewValue: { fontSize: Theme.fontSize.sm, color: Colors.text, fontWeight: '500' },
  footer: {
    padding: Theme.spacing.lg,
    paddingBottom: 34,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border2,
    gap: 8,
  },
  nextBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Theme.radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { fontSize: Theme.fontSize.base, fontWeight: '700', color: Colors.black },
  footerNote: { fontSize: Theme.fontSize.xs, color: Colors.text3, textAlign: 'center' },
  successWrap: { paddingTop: 40, alignItems: 'center', gap: Theme.spacing.lg, paddingHorizontal: Theme.spacing.md },
  successEmoji: { fontSize: 56 },
  successTitle: { fontSize: Theme.fontSize.xxl, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  successBody: { fontSize: Theme.fontSize.base, color: Colors.text2, textAlign: 'center', lineHeight: 24 },
  successOrgName: { color: Colors.gold, fontWeight: '700' },
  successSteps: { width: '100%', gap: 12, marginTop: 8 },
  successStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  successStepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successStepDotDone: { backgroundColor: Colors.emeraldBg, borderColor: Colors.emerald },
  successStepN: { fontSize: 11, fontWeight: '700', color: Colors.text3 },
  successStepLabel: { fontSize: Theme.fontSize.base, color: Colors.text3 },
  successStepLabelDone: { color: Colors.emeraldLight, fontWeight: '600' },
  successBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.full,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  successBtnText: { fontSize: Theme.fontSize.base, color: Colors.text2, fontWeight: '600' },
});
