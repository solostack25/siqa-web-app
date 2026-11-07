import { supabase } from './supabase';

// One add-to-cart path for every screen (Marketplace cards, product page),
// so quantity capping and the cart badge refresh behave the same everywhere.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to cart changes (e.g. to refresh a cart-count badge). Returns an unsubscribe. */
export function onCartChanged(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyCartChanged() {
  listeners.forEach(l => {
    try { l(); } catch { /* a badge failing to refresh shouldn't break the add */ }
  });
}

export type AddToCartResult =
  | { ok: true; quantity: number }
  | { ok: false; reason: 'signed_out' | 'sold_out' | 'error' };

/**
 * Adds `quantity` of a product to the signed-in user's cart. There's one
 * row per (user, product), so an existing row has its quantity bumped
 * instead of a duplicate line being inserted. Physical items are capped at
 * the product's inventory.
 */
export async function addToCart(
  product: {
    id: string;
    is_digital?: boolean | null;
    inventory_count?: number | null;
    variations?: { quantity_varies?: boolean; variants?: { key: string; inventory: number }[] } | null;
  },
  quantity = 1,
  variantKey = '',
): Promise<AddToCartResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, reason: 'signed_out' };

  // Stock: the chosen option's when stock varies by option, else the product's.
  const variant = variantKey ? product.variations?.variants?.find((v) => v.key === variantKey) : null;
  const stock = product.variations?.quantity_varies && variant ? variant.inventory : product.inventory_count;
  const cap = product.is_digital ? Infinity : Math.max(0, stock ?? Infinity);
  if (cap <= 0) return { ok: false, reason: 'sold_out' };

  // One row per (user, product, option), so the same shirt in S and M are two lines.
  const { data: existing, error: readError } = await supabase
    .from('marketplace_cart_items')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('product_id', product.id)
    .eq('variant_key', variantKey)
    .maybeSingle();
  if (readError) return { ok: false, reason: 'error' };

  const next = Math.min((existing?.quantity ?? 0) + quantity, cap);
  const { error } = existing
    ? await supabase.from('marketplace_cart_items').update({ quantity: next }).eq('id', existing.id)
    : await supabase.from('marketplace_cart_items').insert({ user_id: userId, product_id: product.id, quantity: next, variant_key: variantKey });
  if (error) return { ok: false, reason: 'error' };

  notifyCartChanged();
  return { ok: true, quantity: next };
}
