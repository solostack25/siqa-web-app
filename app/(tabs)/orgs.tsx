import { Redirect } from 'expo-router';
import { IS_MARKETPLACE_SITE } from '../../lib/site';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme, HEADER_TOP_PADDING } from '../../constants/theme';
import { Icon } from '../../components/Icon';
import { useIsDesktopWeb } from '../../components/DesktopShell';
import { useSearchContext } from '../../contexts/SearchContext';
import {
  ORG_CATEGORY_LABEL, ORG_FILTERS, categoryFromOrgType, type OrgCategory,
} from '../../lib/orgCategories';
import { MobileBrandBar } from '../../components/MobileBrandBar';
import { brandStyles, font, buttonStyles, dsStatic } from '../../lib/ds';
import { guardTabSwipe } from '../../components/useTabSwipe';

/**
 * Organizations directory.
 *  - On Siqa: organizations that run their own page here (verified, can take
 *    donations, run Seeds).
 *  - Listed: US Islamic organizations from public records (crawl_islamic_orgs,
 *    read through the directory_listed_* functions). Unclaimed until someone
 *    from the organization claims them.
 */

type Org = {
  id: string;
  org_name: string;
  org_type: string | null;
  city: string | null;
  state: string | null;
  tagline: string | null;
  mission: string | null;
  is_verified: boolean | null;
  ein_verified: boolean | null;
  logo_url: string | null;
  banner_url: string | null;
  stripe_onboarded: boolean | null;
  payment_method_url: string | null;
};

type Seed = {
  id: string;
  title: string;
  goal_amount: number | null;
  raised_amount: number | null;
  donor_count: number | null;
  cause_category: string | null;
  org_id: string | null;
  organizations: { org_name: string | null } | null;
};

type Listed = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  ein: string | null;
  category: OrgCategory;
  website: string | null;
  total_count: number;
};

type Scope = 'all' | 'siqa' | 'listed';
const PAGE = 20;
const SIDEBAR_WIDTH = 220;
const MAX_WIDTH = 1180;
const BANNER_TINTS = ['#1B6B4A', '#2E5D7A', '#7E6330', '#8A4B2E', '#4B4F86', '#3E6B5E'];

function money(cents: number | null | undefined) {
  const d = (cents ?? 0) / 100;
  if (d >= 1000000) return '$' + (d / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return '$' + Math.round(d).toLocaleString();
}

function initialsOf(name: string) {
  const words = name.split(/\s+/).filter(w => w.length > 2 || /^[A-Z]{2,}$/.test(w));
  const s = (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  return s;
}

function tintFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BANNER_TINTS[h % BANNER_TINTS.length];
}

function OrgsScreenInner() {
  const { colors: C } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const { width: windowWidth } = useWindowDimensions();
  const pad = isDesktopWeb ? 28 : 16;
  const contentWidth = Math.min((isDesktopWeb ? windowWidth - SIDEBAR_WIDTH : windowWidth), MAX_WIDTH) - pad * 2;
  const styles = makeStyles(C, isDesktopWeb);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [endorseCount, setEndorseCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [category, setCategory] = useState<OrgCategory | 'all'>('all');
  const [stateCode, setStateCode] = useState<string>('');
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [onlyDonations, setOnlyDonations] = useState(false);

  const [listed, setListed] = useState<Listed[]>([]);
  const [listedTotal, setListedTotal] = useState(0);
  const [listedLoading, setListedLoading] = useState(false);
  const [stateCounts, setStateCounts] = useState<{ state: string; n: number }[]>([]);
  const [allListedTotal, setAllListedTotal] = useState(0);
  const reqId = useRef(0);

  // Top-bar search on desktop drives the same query.
  const { registerSearch, unregisterSearch } = useSearchContext();
  useFocusEffect(
    useCallback(() => {
      if (!isDesktopWeb) return;
      registerSearch({ placeholder: 'Search organizations...', value: query, onChangeText: setQuery });
      return () => unregisterSearch();
    }, [isDesktopWeb, query]),
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { loadSiqa(); loadStats(); }, []);

  async function loadSiqa() {
    const [orgRes, seedRes, endRes] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, org_name, org_type, city, state, tagline, mission, is_verified, ein_verified, logo_url, banner_url, stripe_onboarded, payment_method_url')
        .eq('approval_status', 'approved')
        .order('org_name'),
      supabase
        .from('fundraisers')
        .select('id, title, goal_amount, raised_amount, donor_count, cause_category, org_id, organizations(org_name)')
        .eq('status', 'active')
        .order('raised_amount', { ascending: false })
        .limit(50),
      supabase.from('org_endorsements').select('org_id').limit(5000),
    ]);
    setOrgs((orgRes.data as Org[]) ?? []);
    setSeeds((seedRes.data as any as Seed[]) ?? []);
    const counts: Record<string, number> = {};
    ((endRes.data as { org_id: string }[]) ?? []).forEach(r => { counts[r.org_id] = (counts[r.org_id] ?? 0) + 1; });
    setEndorseCount(counts);
    setLoading(false);
  }

  async function loadStats() {
    const { data } = await supabase.rpc('directory_listed_stats');
    const byState: Record<string, number> = {};
    let total = 0;
    ((data as { category: string; state: string | null; n: number }[]) ?? []).forEach(r => {
      total += Number(r.n);
      if (r.state) byState[r.state] = (byState[r.state] ?? 0) + Number(r.n);
    });
    setAllListedTotal(total);
    setStateCounts(Object.entries(byState).map(([state, n]) => ({ state, n })).sort((a, b) => b.n - a.n));
  }

  const loadListed = useCallback(async (append: boolean) => {
    const id = ++reqId.current;
    setListedLoading(true);
    const offset = append ? listed.length : 0;
    const { data } = await supabase.rpc('directory_listed_orgs', {
      p_query: debounced || null,
      p_state: stateCode || null,
      p_category: category === 'all' ? null : category,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (id !== reqId.current) return; // a newer search started
    const rows = (data as Listed[]) ?? [];
    setListed(prev => (append ? [...prev, ...rows] : rows));
    setListedTotal(rows.length ? Number(rows[0].total_count) : (append ? listedTotal : 0));
    setListedLoading(false);
  }, [debounced, stateCode, category, listed.length, listedTotal]);

  useEffect(() => { loadListed(false); }, [debounced, stateCode, category]);

  // ---- Derived ----
  const seedCountByOrg = useMemo(() => {
    const m: Record<string, number> = {};
    seeds.forEach(s => { if (s.org_id) m[s.org_id] = (m[s.org_id] ?? 0) + 1; });
    return m;
  }, [seeds]);

  const siqaFiltered = useMemo(() => {
    const q = debounced.toLowerCase();
    return orgs.filter(o =>
      (!stateCode || o.state === stateCode) &&
      (category === 'all' || categoryFromOrgType(o.org_type) === category) &&
      (!onlyDonations || Boolean(o.stripe_onboarded || o.payment_method_url)) &&
      (!q || [o.org_name, o.city, o.tagline, o.mission].some(v => v?.toLowerCase().includes(q))),
    );
  }, [orgs, debounced, stateCode, category, onlyDonations]);

  const showSiqa = scope !== 'listed';
  const showListed = scope !== 'siqa' && !onlyDonations;
  const showSeeds = showSiqa && !debounced && category === 'all' && !stateCode && seeds.length > 0;
  const filtersActive = Boolean(debounced || stateCode || category !== 'all' || onlyDonations);

  const cols = contentWidth >= 900 ? 3 : contentWidth >= 580 ? 2 : 1;
  const GAP = 16;
  const cardW = (contentWidth - GAP * (cols - 1)) / cols;
  const seedCols = contentWidth >= 900 ? 3 : contentWidth >= 580 ? 2 : 1;
  const seedW = (contentWidth - GAP * (seedCols - 1)) / seedCols;

  function openOrg(o: Org, tab?: string) {
    router.push({ pathname: '/org-profile', params: { id: o.id, ...(tab ? { tab } : {}) } } as any);
  }

  function clearFilters() {
    setQuery(''); setCategory('all'); setStateCode(''); setOnlyDonations(false);
  }

  // ---- Render ----
  const Chip = ({ active, label, onPress, icon }: { active: boolean; label: string; onPress: () => void; icon?: any }) => (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={guardTabSwipe(onPress)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon ? <Icon name={icon} size={15} color={active ? C.bg : C.text2} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 72 }} keyboardShouldPersistTaps="handled">
        <MobileBrandBar />
        <View style={[styles.page, { paddingHorizontal: pad }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.h1}>Organizations</Text>
              <Text style={styles.lede}>
                Nonprofits, masjids, schools and relief groups serving Muslim communities across the US.
                {isDesktopWeb ? ' Give directly to the ones on Siqa, or find one near you.' : ''}
              </Text>
              <View style={styles.statsRow}>
                <Text style={styles.stat}><Text style={styles.statVal}>{(orgs.length + allListedTotal).toLocaleString()}</Text> organizations</Text>
                <Text style={styles.stat}><Text style={styles.statVal}>{orgs.length}</Text> on Siqa</Text>
                {seeds.length > 0 && <Text style={styles.stat}><Text style={styles.statVal}>{seeds.length}</Text> active Seeds</Text>}
              </View>
            </View>
            <View style={styles.headerBtns}>
              {isDesktopWeb && (
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setScope('listed')}>
                  <Text style={styles.ghostBtnText}>Claim your organization</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/org-register' as any)} accessibilityLabel="Register an organization">
                <Icon name="add" size={18} color={dsStatic().c.onPrimary} />
                <Text style={styles.primaryBtnText}>{isDesktopWeb ? 'Register an organization' : 'Register'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search + filters */}
          <View style={styles.filterCard}>
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Icon name="search-outline" size={18} color={C.text3} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Name, city or EIN"
                  placeholderTextColor={C.text3}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  returnKeyType="search"
                  accessibilityLabel="Search organizations"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search" style={styles.clearBtn}>
                    <Icon name="close-circle" size={18} color={C.text3} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[styles.stateBtn, stateCode ? styles.stateBtnActive : null]}
                onPress={() => setStatePickerOpen(o => !o)}
                accessibilityState={{ expanded: statePickerOpen }}
              >
                <Icon name="location-outline" size={18} color={stateCode ? C.gold : C.text2} />
                <Text style={[styles.stateBtnText, stateCode ? { color: C.gold, ...font(700) } : null]}>
                  {stateCode || 'All states'}
                </Text>
                <Icon name={statePickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
              </TouchableOpacity>
            </View>

            {statePickerOpen && (
              <View style={styles.statePanel}>
                <Chip active={!stateCode} label="All states" onPress={() => { setStateCode(''); setStatePickerOpen(false); }} />
                {stateCounts.map(s => (
                  <Chip
                    key={s.state}
                    active={stateCode === s.state}
                    label={`${s.state} · ${s.n.toLocaleString()}`}
                    onPress={() => { setStateCode(s.state); setStatePickerOpen(false); }}
                  />
                ))}
              </View>
            )}

            <View style={styles.scopeRow}>
              <View style={styles.segment} accessibilityRole="tablist">
                {([
                  ['all', isDesktopWeb ? `All · ${(orgs.length + allListedTotal).toLocaleString()}` : 'All'],
                  ['siqa', isDesktopWeb ? `On Siqa · ${orgs.length}` : 'On Siqa'],
                  ['listed', isDesktopWeb ? `Listed · ${allListedTotal.toLocaleString()}` : 'Listed'],
                ] as [Scope, string][]).map(([k, label]) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.segBtn, scope === k && styles.segBtnActive]}
                    onPress={() => setScope(k)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: scope === k }}
                  >
                    <Text numberOfLines={1} style={[styles.segText, scope === k && styles.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.toggle, onlyDonations && styles.toggleOn]}
                onPress={() => setOnlyDonations(v => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: onlyDonations }}
              >
                <Icon name={onlyDonations ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={onlyDonations ? C.gold : C.text3} />
                <Text style={[styles.toggleText, onlyDonations && { color: C.gold, ...font(700) }]}>Takes donations on Siqa</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal={!isDesktopWeb} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {ORG_FILTERS.map(f => (
                <Chip key={f.key} active={category === f.key} label={f.label} onPress={() => setCategory(f.key)} />
              ))}
            </ScrollView>
          </View>

          {loading ? (
            <View style={styles.centered}><ActivityIndicator color={C.gold} size="large" /></View>
          ) : (
            <>
              {/* Seeds */}
              {showSeeds && (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.h2}>Seeds happening now</Text>
                    <TouchableOpacity onPress={guardTabSwipe(() => router.push('/(tabs)/seeds' as any))}>
                      <Text style={styles.link}>See all {seeds.length} Seeds</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.grid, { gap: GAP }]}>
                    {seeds.slice(0, seedCols === 1 ? 2 : 3).map(s => {
                      const pct = s.goal_amount ? Math.min(100, Math.round(((s.raised_amount ?? 0) / s.goal_amount) * 100)) : 0;
                      return (
                        <TouchableOpacity key={s.id} style={[styles.seedCard, { width: seedW }]} onPress={guardTabSwipe(() => router.push(`/seed/${s.id}` as any))}>
                          <View style={styles.seedMeta}>
                            {s.cause_category ? <Text style={styles.causePill}>{s.cause_category}</Text> : null}
                            {s.organizations?.org_name ? <Text style={styles.small} numberOfLines={1}>by {s.organizations.org_name}</Text> : null}
                          </View>
                          <Text style={styles.seedTitle} numberOfLines={2}>{s.title}</Text>
                          <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` as any }]} /></View>
                          <View style={styles.seedFoot}>
                            <Text style={styles.small}><Text style={styles.strong}>{money(s.raised_amount)}</Text> of {money(s.goal_amount)}</Text>
                            <Text style={styles.small}>{(s.donor_count ?? 0).toLocaleString()} donors</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* On Siqa */}
              {showSiqa && (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <View style={{ flexShrink: 1, gap: 4 }}>
                      <Text style={styles.h2}>On Siqa</Text>
                      <Text style={styles.small}>Run by the organization itself. Reviewed by Siqa and able to take donations here.</Text>
                    </View>
                    <Text style={styles.small}>{siqaFiltered.length} organization{siqaFiltered.length === 1 ? '' : 's'}</Text>
                  </View>
                  {siqaFiltered.length === 0 ? (
                    <Text style={styles.empty}>No organizations on Siqa match these filters.</Text>
                  ) : (
                    <View style={[styles.grid, { gap: GAP }]}>
                      {siqaFiltered.map(o => {
                        const tint = tintFor(o.id);
                        const nSeeds = seedCountByOrg[o.id] ?? 0;
                        const nEnd = endorseCount[o.id] ?? 0;
                        const trust = [
                          o.ein_verified ? 'EIN verified' : null,
                          nSeeds ? `${nSeeds} active Seed${nSeeds === 1 ? '' : 's'}` : null,
                          nEnd ? `Endorsed by ${nEnd} speaker${nEnd === 1 ? '' : 's'}` : null,
                        ].filter(Boolean) as string[];
                        const place = [o.city, o.state].filter(Boolean).join(', ');
                        return (
                          <View key={o.id} style={[styles.orgCard, { width: cardW }]}>
                            <TouchableOpacity activeOpacity={0.9} onPress={guardTabSwipe(() => openOrg(o))} accessibilityLabel={`${o.org_name} profile`}>
                              <View style={[styles.banner, { backgroundColor: tint }]}>
                                {o.banner_url ? <Image source={{ uri: o.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                                {o.is_verified ? (
                                  <View style={styles.verified}>
                                    <Icon name="checkmark" size={13} color="#14523A" />
                                    <Text style={styles.verifiedText}>Verified</Text>
                                  </View>
                                ) : null}
                              </View>
                              <View style={styles.orgBody}>
                                <View style={styles.logo}>
                                  {o.logo_url
                                    ? <Image source={{ uri: o.logo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                    : <Text style={[styles.logoText, { color: tint }]}>{initialsOf(o.org_name)}</Text>}
                                </View>
                                <Text style={styles.orgName} numberOfLines={2}>{o.org_name}</Text>
                                <Text style={styles.small}>
                                  {[place, categoryFromOrgType(o.org_type) !== 'other' ? ORG_CATEGORY_LABEL[categoryFromOrgType(o.org_type)] : null].filter(Boolean).join(' · ')}
                                </Text>
                                {o.tagline || o.mission ? <Text style={styles.tagline} numberOfLines={2}>{o.tagline || o.mission}</Text> : null}
                                {trust.length > 0 && (
                                  <View style={styles.trustRow}>
                                    {trust.map(t => <Text key={t} style={styles.trustPill}>{t}</Text>)}
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                            <View style={styles.orgActions}>
                              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={guardTabSwipe(() => openOrg(o, 'seeds'))}>
                                <Text style={styles.primaryBtnText}>Donate</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.ghostBtn, { flex: 1 }]} onPress={guardTabSwipe(() => openOrg(o))}>
                                <Text style={styles.ghostBtnText}>View</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Listed */}
              {showListed && (
                <>
                  <View style={styles.claimBand}>
                    <Icon name="shield-checkmark-outline" size={26} color={C.goldDim} />
                    <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
                      <Text style={styles.claimTitle}>Is your organization listed below?</Text>
                      <Text style={styles.claimBody}>
                        Siqa listed these from public records (IRS filings, maps and websites). Claim yours to update your details,
                        take donations and launch Seeds. We check every claim by hand.
                      </Text>
                    </View>
                    {isDesktopWeb && <Text style={styles.claimHint}>Use “Claim” on your listing</Text>}
                  </View>

                  <View style={styles.section}>
                    <View style={styles.sectionHead}>
                      <View style={{ flexShrink: 1, gap: 4 }}>
                        <Text style={styles.h2}>Listed organizations</Text>
                        <Text style={styles.small}>From public records. Not yet claimed, so details may be out of date and they can't take donations on Siqa.</Text>
                      </View>
                      <Text style={styles.small}>{listedTotal.toLocaleString()} organization{listedTotal === 1 ? '' : 's'}</Text>
                    </View>

                    <View style={styles.listCard}>
                      {listed.length === 0 && !listedLoading ? (
                        <View style={styles.emptyBox}>
                          <Text style={styles.empty}>No listed organizations match these filters.</Text>
                          {filtersActive && (
                            <TouchableOpacity style={styles.ghostBtn} onPress={clearFilters}>
                              <Text style={styles.ghostBtnText}>Clear filters</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : listed.map(l => (
                        <View key={l.id} style={styles.listRow}>
                          <TouchableOpacity style={styles.listMain} onPress={guardTabSwipe(() => router.push(`/org-listing/${l.id}` as any))}>
                            <View style={styles.listIcon}>
                              <Icon name={l.category === 'masjid' ? 'moon-outline' : l.category === 'education' ? 'school-outline' : 'business-outline'} size={19} color={C.text2} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                              <View style={styles.listNameRow}>
                                <Text style={styles.listName} numberOfLines={2}>{l.name}</Text>
                                <Text style={styles.unclaimed}>Unclaimed</Text>
                              </View>
                              <Text style={styles.small} numberOfLines={1}>
                                {[[l.city, l.state].filter(Boolean).join(', '), ORG_CATEGORY_LABEL[l.category] ?? 'Nonprofit', l.ein && isDesktopWeb ? `EIN ${l.ein}` : null].filter(Boolean).join(' · ')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.claimLink}
                            onPress={guardTabSwipe(() => router.push({ pathname: '/claim', params: { type: 'organization', id: l.id } } as any))}
                            accessibilityLabel={`Claim ${l.name}`}
                          >
                            <Text style={styles.claimLinkText}>Claim</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      {(listed.length > 0 || listedLoading) && (
                        <View style={styles.listFoot}>
                          <Text style={styles.small}>Showing {listed.length.toLocaleString()} of {listedTotal.toLocaleString()}</Text>
                          {listedLoading ? (
                            <ActivityIndicator color={C.gold} />
                          ) : listed.length < listedTotal ? (
                            <TouchableOpacity style={styles.ghostBtn} onPress={() => loadListed(true)}>
                              <Text style={styles.ghostBtnText}>Load more</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(C: AppColors, desktop: boolean) {
  return StyleSheet.create(brandStyles({
    container: { flex: 1, backgroundColor: C.bg },
    page: {
      width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 26,
      paddingTop: desktop ? 32 : 8,
    },
    centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },

    header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: desktop ? 'flex-end' : 'flex-start', justifyContent: 'space-between', gap: 16 },
    headerText: { flexGrow: 1, flexShrink: 1, flexBasis: desktop ? 480 : 200, gap: 8 },
    h1: { fontSize: desktop ? 34 : 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
    lede: { fontSize: desktop ? 16 : 14, lineHeight: desktop ? 24 : 20, color: C.text2, maxWidth: 640 },
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 2 },
    stat: { fontSize: 14, color: C.text2 },
    statVal: { fontWeight: '700', color: C.text },
    headerBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    primaryBtn: buttonStyles('primary', 'md').box,
    primaryBtnText: buttonStyles('primary', 'md').text,
    ghostBtn: buttonStyles('secondary', 'md').box,
    ghostBtnText: buttonStyles('secondary', 'md').text,

    filterCard: {
      gap: 14, padding: desktop ? 18 : 14, borderRadius: 18, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface,
    },
    searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    searchBox: {
      flexGrow: 3, flexShrink: 1, flexBasis: 260, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border,
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    },
    searchInput: {
      flex: 1, minWidth: 0, fontSize: 15, color: C.text, paddingVertical: 10,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
    },
    clearBtn: { padding: 6 },
    stateBtn: {
      flexGrow: 1, flexBasis: 150, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border,
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
    },
    stateBtnActive: { borderColor: C.gold, backgroundColor: C.goldBg },
    stateBtnText: { flex: 1, fontSize: 15, color: C.text },
    statePanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
    scopeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    segment: {
      flexDirection: 'row', padding: 4, gap: 2, borderRadius: 999, backgroundColor: C.surface2,
      // Mobile: take the full row so the donations toggle wraps below. Without a
      // basis, the flex:1 buttons collapse to ~0 and labels wrap per-letter on iOS.
      ...(desktop ? {} : { width: '100%' }),
    },
    segBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', ...(desktop ? {} : { flex: 1 }) },
    segBtnActive: { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    segText: { fontSize: 14, color: C.text2, fontWeight: '500' },
    segTextActive: { color: C.text, fontWeight: '700' },
    toggle: {
      minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    toggleOn: { borderColor: C.gold, backgroundColor: C.goldBg },
    toggleText: { fontSize: 13, color: C.text2, fontWeight: '500' },
    chipRow: { flexDirection: 'row', flexWrap: desktop ? 'wrap' : 'nowrap', gap: 8 },
    chip: {
      minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    chipActive: { backgroundColor: C.text, borderColor: C.text },
    chipText: { fontSize: 13, color: C.text, fontWeight: '500' },
    chipTextActive: { color: C.bg, fontWeight: '700' },

    section: { gap: 14 },
    sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
    h2: { fontSize: desktop ? 20 : 18, fontWeight: '700', color: C.text },
    link: { fontSize: 14, fontWeight: '600', color: C.gold },
    small: { fontSize: 13, color: C.text2, lineHeight: 18 },
    strong: { fontWeight: '700', color: C.text },
    empty: { fontSize: 14, color: C.text2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },

    seedCard: {
      gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface,
    },
    seedMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    causePill: {
      fontSize: 12, fontWeight: '700', color: C.goldDim, backgroundColor: C.goldBg,
      paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden',
    },
    seedTitle: { fontSize: 16, fontWeight: '700', color: C.text, lineHeight: 21 },
    track: { height: 8, borderRadius: 999, backgroundColor: C.surface2, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 999, backgroundColor: C.emerald },
    seedFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },

    orgCard: { borderRadius: 18, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface, overflow: 'hidden' },
    banner: { height: desktop ? 96 : 80, overflow: 'hidden' },
    verified: {
      position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#FFFFFF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    },
    verifiedText: { fontSize: 12, fontWeight: '700', color: '#14523A' },
    orgBody: { paddingHorizontal: 18, paddingBottom: 4, gap: 6 },
    logo: {
      width: 56, height: 56, borderRadius: 14, marginTop: -28, marginBottom: 4, backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.border2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    logoText: { fontSize: 17, fontWeight: '800' },
    orgName: { fontSize: 17, fontWeight: '700', color: C.text },
    tagline: { fontSize: 14, lineHeight: 20, color: C.text, opacity: 0.85, marginTop: 2 },
    trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    trustPill: {
      fontSize: 12, fontWeight: '600', color: C.text2, backgroundColor: C.surface2,
      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden',
    },
    orgActions: { flexDirection: 'row', gap: 8, padding: 18, paddingTop: 12 },

    claimBand: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: desktop ? 20 : 16,
      borderRadius: 18, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldSoft,
    },
    claimTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    claimBody: { fontSize: 14, lineHeight: 20, color: C.text2 },
    claimHint: { fontSize: 13, color: C.goldDim, fontWeight: '600' },

    listCard: { borderRadius: 18, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface, overflow: 'hidden' },
    listRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: desktop ? 12 : 4,
      borderBottomWidth: 1, borderBottomColor: C.border2,
    },
    listMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingLeft: desktop ? 18 : 14 },
    listIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
    listNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    listName: { fontSize: 15, fontWeight: '700', color: C.text, flexShrink: 1 },
    unclaimed: {
      fontSize: 11, fontWeight: '700', color: C.text2, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden',
    },
    claimLink: { minHeight: 44, minWidth: 56, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
    claimLinkText: { fontSize: 14, fontWeight: '700', color: C.gold },
    listFoot: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: 14, backgroundColor: C.bg2,
    },
    emptyBox: { padding: 24, alignItems: 'center', gap: 12 },
  }));
}

// Not part of the Marketplace site: go to the Shop.
export default function OrgsScreen() {
  if (IS_MARKETPLACE_SITE) return <Redirect href={'/marketplace' as any} />;
  return <OrgsScreenInner />;
}
