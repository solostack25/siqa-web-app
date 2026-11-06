import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { DesktopShell, useIsDesktopWeb } from '../../components/DesktopShell';
import { Icon } from '../../components/Icon';
import { ClaimNotice, UnclaimedBadge } from '../../components/ClaimNotice';
import { ORG_CATEGORY_LABEL, type OrgCategory } from '../../lib/orgCategories';
import { brandStyles } from '../../lib/ds';

/**
 * Public-record page for an organization Siqa listed from the crawler but
 * that hasn't claimed its listing. Once claimed, it redirects to the real
 * organization profile.
 */

type Listing = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  ein: string | null;
  category: OrgCategory;
  ntee_code: string | null;
  website: string | null;
  claimed_org_id: string | null;
};

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default function OrgListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const styles = makeStyles(C, isDesktopWeb);
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<Listing | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.rpc('directory_listed_org', { p_id: id });
      const r = (Array.isArray(data) ? data[0] : data) as Listing | undefined;
      if (r?.claimed_org_id) {
        router.replace({ pathname: '/org-profile', params: { id: r.claimed_org_id } } as any);
        return;
      }
      setRow(r ?? null);
      setLoading(false);
    })();
  }, [id]);

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orgs' as any);
  }

  const body = (() => {
    if (loading) return <View style={styles.center}><ActivityIndicator color={C.gold} /></View>;
    if (!row) return <Text style={styles.muted}>This listing couldn't be found.</Text>;
    const place = [row.city, row.state].filter(Boolean).join(', ');
    const fullAddress = [row.address, place, row.zip].filter(Boolean).join(', ');
    const einDigits = row.ein?.replace(/\D/g, '');
    return (
      <>
        <View style={styles.head}>
          <View style={styles.logo} accessibilityElementsHidden>
            <Icon name="business-outline" size={30} color={C.text3} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={styles.nameRow}>
              <Text style={styles.h1}>{row.name}</Text>
              <UnclaimedBadge />
            </View>
            <Text style={styles.sub}>{[place, ORG_CATEGORY_LABEL[row.category] ?? 'Nonprofit'].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>

        <ClaimNotice entityType="organization" entityId={row.id} name={row.name} compact={!isDesktopWeb} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Public record</Text>
          {fullAddress ? <Fact styles={styles} C={C} icon="location-outline" label="Address" value={fullAddress} /> : null}
          {row.ein ? <Fact styles={styles} C={C} icon="document-text-outline" label="EIN" value={row.ein} /> : null}
          <Fact styles={styles} C={C} icon="pricetag-outline" label="Category" value={`${ORG_CATEGORY_LABEL[row.category] ?? 'Nonprofit'}${row.ntee_code ? ` (NTEE ${row.ntee_code})` : ''}`} />
          {row.website ? (
            <TouchableOpacity onPress={() => Linking.openURL(withProtocol(row.website!))}>
              <Fact styles={styles} C={C} icon="globe-outline" label="Website" value={row.website} link />
            </TouchableOpacity>
          ) : null}
          {einDigits ? (
            <TouchableOpacity onPress={() => Linking.openURL(`https://projects.propublica.org/nonprofits/organizations/${einDigits}`)}>
              <Fact styles={styles} C={C} icon="open-outline" label="Tax filings" value="View on ProPublica Nonprofit Explorer" link />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.small}>From IRS records and public sources. Siqa hasn't verified this information.</Text>
        </View>
      </>
    );
  })();

  return (
    <DesktopShell>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          <View style={styles.page}>
            <TouchableOpacity onPress={back} style={styles.back} accessibilityLabel="Back to organizations">
              <Icon name="chevron-back" size={20} color={C.text} />
              <Text style={styles.backText}>Organizations</Text>
            </TouchableOpacity>
            {body}
          </View>
        </ScrollView>
      </View>
    </DesktopShell>
  );
}

function Fact({ styles, C, icon, label, value, link }: { styles: any; C: AppColors; icon: any; label: string; value: string; link?: boolean }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={C.text2} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={[styles.factValue, link && { color: C.emerald }]} selectable>{value}</Text>
      </View>
    </View>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create(brandStyles({
    page: {
      width: '100%', maxWidth: 760, alignSelf: 'center', gap: 18,
      paddingHorizontal: desktop ? 28 : 16, paddingTop: desktop ? 28 : HEADER_TOP_PADDING,
    },
    center: { paddingVertical: 80, alignItems: 'center' },
    muted: { fontSize: 15, color: C.text2 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 40 },
    backText: { fontSize: 14, fontWeight: '600', color: C.text },
    head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    logo: {
      width: desktop ? 72 : 60, height: desktop ? 72 : 60, borderRadius: 18, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center',
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    h1: { fontSize: desktop ? 28 : 22, fontWeight: '700', color: C.text, letterSpacing: -0.3, flexShrink: 1 },
    sub: { fontSize: 14, color: C.text2 },
    card: {
      gap: 14, padding: desktop ? 22 : 16, borderRadius: Theme.radius.lg, borderWidth: 1,
      borderColor: C.border2, backgroundColor: C.surface,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    fact: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 40 },
    factLabel: { fontSize: 12, color: C.text3, fontWeight: '600' },
    factValue: { fontSize: 15, color: C.text, marginTop: 2 },
    small: { fontSize: 12, color: C.text3, lineHeight: 17 },
  }));
}
