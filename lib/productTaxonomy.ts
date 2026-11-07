// Marketplace categories, item details and variations (Etsy-style).
//
// Category path: top category › subcategory › type (type is optional).
// The top category names are the ones stored in marketplace_products.category
// and used by the Shop's filter chips, so don't rename them without a data
// migration.

export type Subcategory = { name: string; types?: string[] };
export type TopCategory = { name: string; icon: string; subs: Subcategory[] };

export const PRODUCT_CATEGORIES: TopCategory[] = [
  {
    name: 'Clothing & Accessories',
    icon: 'shirt-outline',
    subs: [
      { name: "Women's clothing", types: ['Abayas', 'Dresses', 'Jilbabs', 'Tops & tunics', 'Skirts', 'Pants', 'Prayer outfits', 'Sets', 'Activewear', 'Outerwear', 'Sleepwear'] },
      { name: "Men's clothing", types: ['Thobes', 'Kurtas', 'Shirts', 'Pants', 'Sets', 'Prayer wear', 'Activewear', 'Outerwear'] },
      { name: "Kids' clothing", types: ['Girls’ abayas & dresses', 'Boys’ thobes', 'Tops', 'Bottoms', 'Sets', 'Baby clothing'] },
      { name: 'Hijabs & head coverings', types: ['Hijabs', 'Instant hijabs', 'Underscarves', 'Niqabs', 'Kufis & caps', 'Turbans', 'Shemaghs'] },
      { name: 'Shoes', types: ["Women's shoes", "Men's shoes", "Kids' shoes", 'Slippers'] },
      { name: 'Bags & purses', types: ['Handbags', 'Totes', 'Backpacks', 'Wallets', 'Prayer mat bags'] },
      { name: 'Accessories', types: ['Hijab pins & magnets', 'Belts', 'Hair accessories', 'Socks', 'Sunglasses', 'Watches'] },
    ],
  },
  {
    name: 'Jewelry',
    icon: 'diamond-outline',
    subs: [
      { name: 'Necklaces', types: ['Name necklaces', 'Ayat & calligraphy', 'Pendants', 'Chains'] },
      { name: 'Rings' },
      { name: 'Bracelets' },
      { name: 'Earrings' },
      { name: 'Anklets' },
      { name: "Men's jewelry" },
      { name: 'Jewelry sets' },
    ],
  },
  {
    name: 'Home Decor',
    icon: 'home-outline',
    subs: [
      { name: 'Wall decor', types: ['Calligraphy', 'Wall art', 'Mirrors', 'Clocks', 'Shelves'] },
      { name: 'Prayer & worship', types: ['Prayer rugs', 'Tasbih', 'Quran stands', 'Prayer corners', 'Qibla compasses'] },
      { name: 'Ramadan & Eid decor', types: ['Lanterns', 'Banners & garlands', 'Advent calendars', 'Table decor'] },
      { name: 'Lighting', types: ['Lanterns', 'Lamps', 'Candles & holders'] },
      { name: 'Textiles', types: ['Pillows', 'Throws', 'Rugs', 'Curtains'] },
      { name: 'Kitchen & dining', types: ['Serveware', 'Dates & sweets trays', 'Mugs', 'Linens'] },
      { name: 'Decor accents', types: ['Vases', 'Figurines & sculptures', 'Incense & bakhoor burners', 'Plants & planters'] },
    ],
  },
  {
    name: 'Art & Prints',
    icon: 'color-palette-outline',
    subs: [
      { name: 'Calligraphy' },
      { name: 'Prints & posters' },
      { name: 'Paintings' },
      { name: 'Photography' },
      { name: 'Custom portraits' },
    ],
  },
  {
    name: 'Books & Media',
    icon: 'book-outline',
    subs: [
      { name: 'Quran & mushafs' },
      { name: 'Islamic studies', types: ['Aqeedah', 'Fiqh', 'Hadith', 'Seerah', 'Tafsir', 'Spirituality'] },
      { name: "Children's books" },
      { name: 'Arabic learning' },
      { name: 'Fiction & poetry' },
      { name: 'Journals & planners' },
      { name: 'Audio & video' },
    ],
  },
  {
    name: 'Beauty & Fragrance',
    icon: 'flower-outline',
    subs: [
      { name: 'Attar & perfume oils' },
      { name: 'Bakhoor & oud' },
      { name: 'Skincare' },
      { name: 'Hair care' },
      { name: 'Miswak & oral care' },
      { name: 'Henna' },
    ],
  },
  {
    name: 'Gifts',
    icon: 'gift-outline',
    subs: [
      { name: 'Eid gifts' },
      { name: 'Ramadan gifts' },
      { name: 'Wedding & nikah' },
      { name: 'New baby & aqiqah' },
      { name: 'Hajj & Umrah' },
      { name: 'Gift boxes & hampers' },
      { name: 'Personalized gifts' },
    ],
  },
  {
    name: 'Digital Downloads',
    icon: 'cloud-download-outline',
    subs: [
      { name: 'Printables' },
      { name: 'Planners & trackers' },
      { name: 'Ebooks & courses' },
      { name: 'Art & wallpapers' },
      { name: 'Templates' },
    ],
  },
  { name: 'Other', icon: 'ellipsis-horizontal', subs: [] },
];

export const CATEGORY_NAMES = PRODUCT_CATEGORIES.map((c) => c.name);

export function topCategory(name: string | null | undefined) {
  return PRODUCT_CATEGORIES.find((c) => c.name === name);
}

/** "Clothing & Accessories › Women's clothing › Abayas" */
export function categoryPath(category?: string | null, sub?: string | null, type?: string | null) {
  return [category, sub, type].filter(Boolean).join(' › ');
}

// ── Item details (shown for the chosen top category) ──────────────────
export type DetailField = { name: string; options?: string[]; placeholder?: string };

const COLORS = ['Black', 'White', 'Beige', 'Brown', 'Gray', 'Navy', 'Blue', 'Green', 'Olive', 'Red', 'Maroon', 'Pink', 'Purple', 'Yellow', 'Orange', 'Gold', 'Silver', 'Multicolor'];
const WHO_MADE = ['I made it', 'A member of my shop', 'Another company or person'];

export const DETAIL_FIELDS: Record<string, DetailField[]> = {
  'Clothing & Accessories': [
    { name: "Who it's for", options: ['Women', 'Men', 'Girls', 'Boys', 'Unisex adults', 'Unisex kids', 'Babies'] },
    { name: 'Material', options: ['Cotton', 'Chiffon', 'Jersey', 'Crepe', 'Nida', 'Linen', 'Silk', 'Satin', 'Polyester', 'Wool', 'Denim', 'Leather', 'Other'] },
    { name: 'Primary color', options: COLORS },
    { name: 'Occasion', options: ['Everyday', 'Prayer', 'Eid', 'Wedding', 'Work', 'Formal', 'Sports'] },
    { name: 'Who made it', options: WHO_MADE },
  ],
  Jewelry: [
    { name: 'Material', options: ['Gold', 'Solid gold', 'Gold-plated', 'Sterling silver', 'Silver-plated', 'Stainless steel', 'Brass', 'Copper', 'Other'] },
    { name: 'Gemstone', options: ['None', 'Pearl', 'Diamond', 'Cubic zirconia', 'Turquoise', 'Agate', 'Opal', 'Other'] },
    { name: "Who it's for", options: ['Women', 'Men', 'Unisex', 'Kids'] },
    { name: 'Personalization', options: ['Not personalized', 'Name or text', 'Initials'] },
    { name: 'Who made it', options: WHO_MADE },
  ],
  'Home Decor': [
    { name: 'Material', options: ['Wood', 'Metal', 'Glass', 'Ceramic', 'Fabric', 'Acrylic', 'Canvas', 'Resin', 'Other'] },
    { name: 'Primary color', options: COLORS },
    { name: 'Dimensions', placeholder: 'e.g. 16 x 20 in' },
    { name: 'Who made it', options: WHO_MADE },
  ],
  'Art & Prints': [
    { name: 'Medium', options: ['Ink', 'Acrylic', 'Oil', 'Watercolor', 'Gold leaf', 'Digital', 'Mixed media'] },
    { name: 'Script', options: ['Thuluth', 'Naskh', 'Kufic', 'Diwani', 'Nastaliq', 'Modern', 'Not calligraphy'] },
    { name: 'Framing', options: ['Framed', 'Unframed', 'Canvas wrap', 'Digital file'] },
    { name: 'Dimensions', placeholder: 'e.g. 12 x 16 in' },
    { name: 'Who made it', options: WHO_MADE },
  ],
  'Books & Media': [
    { name: 'Language', options: ['English', 'Arabic', 'Urdu', 'Bilingual Arabic/English', 'Other'] },
    { name: 'Format', options: ['Hardcover', 'Paperback', 'Board book', 'Spiral', 'Audio', 'Video', 'Digital'] },
    { name: 'Age range', options: ['Babies & toddlers', '3–5', '6–8', '9–12', 'Teens', 'Adults'] },
    { name: 'Author', placeholder: 'Author or publisher' },
  ],
  'Beauty & Fragrance': [
    { name: 'Scent family', options: ['Oud', 'Musk', 'Floral', 'Rose', 'Amber', 'Woody', 'Citrus', 'Fresh', 'Unscented'] },
    { name: 'Alcohol-free', options: ['Yes', 'No'] },
    { name: 'Size', placeholder: 'e.g. 12 ml' },
    { name: 'Who made it', options: WHO_MADE },
  ],
  Gifts: [
    { name: "Who it's for", options: ['Her', 'Him', 'Kids', 'Family', 'Anyone'] },
    { name: 'Personalization', options: ['Not personalized', 'Name or text', 'Photo'] },
    { name: 'Who made it', options: WHO_MADE },
  ],
  'Digital Downloads': [
    { name: 'File type', options: ['PDF', 'PNG/JPG', 'Canva template', 'Video', 'Audio', 'ZIP'] },
    { name: 'Language', options: ['English', 'Arabic', 'Urdu', 'Bilingual'] },
  ],
  Other: [{ name: 'Who made it', options: WHO_MADE }],
};

// ── Variations ────────────────────────────────────────────────────────
export const MAX_VARIATIONS = 2;

/** Variation types a seller can add, with option presets for the category. */
export function variationTypesFor(category: string | null, sub?: string | null): { name: string; presets: string[] }[] {
  const shoe = sub === 'Shoes';
  const kids = sub === "Kids' clothing";
  const clothingSizes = kids
    ? ['0–6 mo', '6–12 mo', '12–18 mo', '2T', '3T', '4T', '5', '6', '7', '8', '10', '12', '14']
    : ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  const shoeSizes = ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12', '13'];
  const sizes =
    category === 'Clothing & Accessories' ? (shoe ? shoeSizes : clothingSizes)
    : category === 'Jewelry' ? ['5', '6', '7', '8', '9', '10', '11', '12']
    : category === 'Art & Prints' || category === 'Home Decor' ? ['5 x 7 in', '8 x 10 in', '11 x 14 in', '12 x 16 in', '16 x 20 in', '18 x 24 in', '24 x 36 in']
    : category === 'Beauty & Fragrance' ? ['3 ml', '6 ml', '12 ml', '30 ml', '50 ml', '100 ml']
    : [];
  const list: { name: string; presets: string[] }[] = [
    { name: 'Size', presets: sizes },
    { name: 'Color', presets: COLORS },
  ];
  if (category === 'Clothing & Accessories') list.push({ name: 'Length', presets: ['50', '52', '54', '56', '58', '60', '62'] });
  if (category === 'Jewelry') list.push({ name: 'Chain length', presets: ['14 in', '16 in', '18 in', '20 in', '22 in', '24 in'] }, { name: 'Metal', presets: ['Gold', 'Rose gold', 'Silver'] });
  if (category === 'Beauty & Fragrance') list.push({ name: 'Scent', presets: [] });
  if (category === 'Art & Prints' || category === 'Home Decor') list.push({ name: 'Frame', presets: ['No frame', 'Black frame', 'White frame', 'Wood frame', 'Gold frame'] });
  list.push({ name: 'Material', presets: [] }, { name: 'Style', presets: [] });
  return list;
}

export type VariationAttr = { name: string; options: string[] };
export type Variant = { key: string; values: string[]; price_cents: number; inventory: number; sku?: string | null };
export type Variations = {
  attributes: VariationAttr[];
  price_varies: boolean;
  quantity_varies: boolean;
  variants: Variant[];
};

export function variantKey(values: string[]) {
  return values.join(' / ');
}

/** Every combination of the options, keeping prices/stock already entered. */
export function buildVariants(attrs: VariationAttr[], prev: Variant[], basePrice: number, baseStock: number): Variant[] {
  const live = attrs.filter((a) => a.options.length > 0);
  if (!live.length) return [];
  let combos: string[][] = [[]];
  for (const a of live) combos = combos.flatMap((c) => a.options.map((o) => [...c, o]));
  return combos.map((values) => {
    const key = variantKey(values);
    const old = prev.find((v) => v.key === key);
    return old ?? { key, values, price_cents: basePrice, inventory: baseStock, sku: null };
  });
}

/** Price range for a product, accounting for variations. */
export function priceRange(p: { price_cents: number; variations?: Variations | null }) {
  const vs = p.variations?.price_varies ? p.variations.variants : null;
  if (!vs?.length) return { min: p.price_cents, max: p.price_cents };
  const prices = vs.map((v) => v.price_cents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// ── Pricing / stock for a chosen option (cart, checkout) ─────────────
type Priced = { price_cents: number; inventory_count: number; is_digital?: boolean | null; variations?: Variations | null };

export function findVariant(p: Priced, key?: string | null) {
  return key ? p.variations?.variants?.find((v) => v.key === key) ?? null : null;
}
export function unitPriceFor(p: Priced, key?: string | null) {
  const v = findVariant(p, key);
  return v && p.variations?.price_varies ? v.price_cents : p.price_cents;
}
export function stockFor(p: Priced, key?: string | null) {
  if (p.is_digital) return Infinity;
  const v = findVariant(p, key);
  return v && p.variations?.quantity_varies ? v.inventory : p.inventory_count;
}
