-- Etsy-style listings: a deeper category path, item details, and up to two
-- variations (e.g. Size and Color) with optional per-option price and stock.
-- Additive only: existing products, carts and orders keep working.

alter table public.marketplace_products
  add column if not exists subcategory text,
  add column if not exists item_type text,
  -- Item details for the category, e.g. {"Who it's for": "Women", "Material": "Chiffon"}
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  -- null = no variations. Otherwise:
  -- { "attributes": [{ "name": "Size", "options": ["S","M"] }, { "name": "Color", "options": ["Black"] }],
  --   "price_varies": bool, "quantity_varies": bool,
  --   "variants": [{ "key": "S / Black", "values": ["S","Black"], "price_cents": 2500, "inventory": 3, "sku": null }] }
  add column if not exists variations jsonb;

-- A cart can hold the same product in different sizes/colors.
alter table public.marketplace_cart_items
  add column if not exists variant_key text not null default '';
alter table public.marketplace_cart_items
  drop constraint if exists marketplace_cart_items_user_id_product_id_key;
drop index if exists public.marketplace_cart_items_user_id_product_id_key;
alter table public.marketplace_cart_items
  add constraint marketplace_cart_items_user_product_variant_key unique (user_id, product_id, variant_key);

-- What the buyer picked, so the seller knows what to ship.
alter table public.marketplace_orders
  add column if not exists variant_key text,
  add column if not exists variant_label text;
