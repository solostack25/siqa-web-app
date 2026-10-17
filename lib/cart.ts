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
  product: { id: string; is_digital?: boolean | null; inventory_count?: number | null },
  quantity = 1,
): Promise<AddToCartResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, reason: 'signed_out' };

  const cap = product.is_digital ? Infinity : Math.max(0, product.inventory_count ?? Infinity);
  if (cap <= 0) return { ok: false, reason: 'sold_out' };

  const { data: existing, error: readError } = await supabase
    .from('marketplace_cart_items')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('product_id', product.id)
    .maybeSingle();
  if (readError) return { ok: false, reason: 'error' };

  const next = Math.min((existing?.quantity ?? 0) + quantity, cap);
  const { error } = existing
    ? await supabase.from('marketplace_cart_items').update({ quantity: next }).eq('id', existing.id)
    : await supabase.from('marketplace_cart_items').insert({ user_id: userId, product_id: product.id, quantity: next });
  if (error) return { ok: false, reason: 'error' };

  notifyCartChanged();
  return { ok: true, quantity: next };
}
