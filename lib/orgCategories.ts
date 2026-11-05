// Directory categories. Listed (crawled) organizations get these from their
// IRS NTEE code via public.org_category(); Siqa organizations from org_type.

export type OrgCategory =
  | 'masjid' | 'relief' | 'education' | 'youth_family' | 'food_housing'
  | 'health' | 'community' | 'arts_culture' | 'other';

export const ORG_CATEGORY_LABEL: Record<OrgCategory, string> = {
  masjid: 'Masjid & Islamic center',
  relief: 'Relief & humanitarian',
  education: 'School & education',
  youth_family: 'Youth & family',
  food_housing: 'Food & housing',
  health: 'Health',
  community: 'Community & civic',
  arts_culture: 'Arts & culture',
  other: 'Nonprofit',
};

/** Filter chips, in display order. */
export const ORG_FILTERS: { key: OrgCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'masjid', label: 'Masjids & Islamic centers' },
  { key: 'relief', label: 'Relief & humanitarian' },
  { key: 'education', label: 'Schools & education' },
  { key: 'youth_family', label: 'Youth & family' },
  { key: 'food_housing', label: 'Food & housing' },
  { key: 'health', label: 'Health' },
  { key: 'community', label: 'Community & civic' },
];

/** Siqa organizations only have a coarse org_type today. */
export function categoryFromOrgType(t: string | null | undefined): OrgCategory {
  switch (String(t || '').toLowerCase()) {
    case 'masjid': return 'masjid';
    case 'school': return 'education';
    case 'relief': return 'relief';
    default: return 'other';
  }
}

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN',
  'MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
];
