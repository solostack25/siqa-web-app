// Local business directory categories (business_listings.category).

export type BusinessCategory =
  | 'lessons' | 'food_catering' | 'home_services' | 'events' | 'beauty_wellness' | 'professional'
  | 'health' | 'childcare' | 'restaurants' | 'grocery' | 'shops' | 'other';

export const BUSINESS_CATEGORIES: { key: BusinessCategory; label: string; hint: string; icon: string }[] = [
  { key: 'lessons', label: 'Lessons & tutoring', hint: 'Quran, Arabic, school subjects', icon: 'book-outline' },
  { key: 'food_catering', label: 'Food & catering', hint: 'Home cooks, bakers, caterers', icon: 'restaurant-outline' },
  { key: 'home_services', label: 'Home services', hint: 'Repairs, cleaning, movers', icon: 'hammer-outline' },
  { key: 'events', label: 'Events & weddings', hint: 'Henna, photo, decor, DJs', icon: 'sparkles-outline' },
  { key: 'beauty_wellness', label: 'Beauty & wellness', hint: 'Salons, barbers, hijama', icon: 'flower-outline' },
  { key: 'professional', label: 'Professional', hint: 'Accounting, legal, real estate', icon: 'briefcase-outline' },
  { key: 'health', label: 'Health', hint: 'Doctors, dentists, therapists', icon: 'medkit-outline' },
  { key: 'childcare', label: 'Childcare', hint: 'Daycares, nannies', icon: 'happy-outline' },
  { key: 'restaurants', label: 'Halal restaurants', hint: 'Dine in and takeout', icon: 'fast-food-outline' },
  { key: 'grocery', label: 'Halal grocery & butchers', hint: 'Meat, groceries, sweets', icon: 'basket-outline' },
  { key: 'shops', label: 'Shops & Islamic goods', hint: 'Books, clothing, gifts', icon: 'storefront-outline' },
  { key: 'other', label: 'Other', hint: 'Everything else', icon: 'ellipsis-horizontal-circle-outline' },
];

export function categoryLabel(key: string | null | undefined) {
  return BUSINESS_CATEGORIES.find(c => c.key === key)?.label ?? 'Business';
}

export type BusinessService = { name: string; description?: string; price?: string };

export type BusinessListing = {
  id: string;
  owner_id: string | null;
  name: string;
  category: BusinessCategory;
  tagline: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  lat?: number | null;
  lon?: number | null;
  service_area: string | null;
  is_online: boolean;
  is_home_based: boolean;
  women_owned: boolean;
  sisters_only: boolean;
  halal_status: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  booking_url: string | null;
  price_text: string | null;
  hours_text: string | null;
  languages: string[];
  services: BusinessService[];
  logo_url: string | null;
  cover_url: string | null;
  status: 'draft' | 'published' | 'hidden';
  is_claimed: boolean;
  is_verified: boolean;
  featured_until: string | null;
  source: 'owner' | 'crawl';
  created_at: string;
};

export const LISTING_CARD_FIELDS =
  'id, owner_id, name, category, tagline, city, state, service_area, is_online, is_home_based, women_owned, sisters_only, halal_status, phone, price_text, logo_url, cover_url, status, is_claimed, is_verified, featured_until, source';

const TINTS = ['#1B6B4A', '#2E5D7A', '#7E6330', '#8A4B2E', '#4B4F86', '#3E6B5E', '#6B3F5E', '#2F6A73'];
export function tintFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function initialsOf(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export function placeLine(l: Pick<BusinessListing, 'city' | 'state' | 'service_area' | 'is_online'>) {
  const where = l.service_area || [l.city, l.state].filter(Boolean).join(', ');
  if (l.is_online && where) return `Online · or ${where}`;
  if (l.is_online) return 'Online';
  return where || 'Location not listed';
}

export function isFeatured(l: Pick<BusinessListing, 'featured_until'>) {
  return Boolean(l.featured_until && new Date(l.featured_until).getTime() > Date.now());
}

export function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
