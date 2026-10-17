// Pure money math for splitting one marketplace checkout between sellers.
// No Stripe or database calls here, so it can be unit-tested on its own.
//
// Etsy-style fees: Siqa keeps 6.5% of each seller's items + shipping, and
// the seller also covers their share of Stripe's processing fee for the
// charge and of the Stripe Tax fee. Sales tax itself goes to Siqa to remit.
// Every
// split is done with largest-remainder rounding so the parts always add up
// to the whole, to the cent.

export const SIQA_FEE_RATE = 0.065;
/** Stripe Tax pay-as-you-go: $0.50 per recorded tax transaction (includes 10 calculations). */
export const STRIPE_TAX_FEE_CENTS = 50;

export type OrderLine = {
  id: string;
  seller_id: string;
  total_cents: number;
  quantity: number;
};

export type LineSplit = {
  id: string;
  shipping_cents: number;       // this line's share of its shop's shipping
  siqa_fee_cents: number;
  processing_fee_cents: number;
  tax_fee_cents: number;        // this line's share of the Stripe Tax fee
  seller_payout_cents: number;
};

export type SellerSplit = {
  seller_id: string;
  order_ids: string[];
  item_count: number;
  items_cents: number;
  shipping_cents: number;
  gross_cents: number;          // items + shipping
  siqa_fee_cents: number;
  processing_fee_cents: number;
  tax_fee_cents: number;
  payout_cents: number;
  lines: LineSplit[];
};

/** Split `total` into integer parts proportional to `weights`, summing exactly to `total`. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map(w => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) floors[order[k].i] += 1;
  return floors;
}

export type SplitOptions = {
  /** Flat shipping each shop charged on this checkout, by seller id. */
  shippingBySeller?: Record<string, number>;
  /** Stripe's actual processing fee on the whole charge (covers tax too). */
  stripeFeeCents: number;
  /** Stripe Tax fee for this checkout (0 if no tax transaction recorded). */
  taxFeeCents?: number;
  /** Siqa's cut of items + shipping (default 6.5%). */
  feeRate?: number;
};

/**
 * Split a paid checkout between its sellers. Sales tax is not part of any
 * seller's money (Siqa remits it), but the processing and Stripe Tax fees
 * that come with it are passed to sellers in proportion to their sales.
 */
export function splitCheckout(lines: OrderLine[], opts: SplitOptions): SellerSplit[] {
  const feeRate = opts.feeRate ?? SIQA_FEE_RATE;
  const shippingBySeller = opts.shippingBySeller ?? {};
  const sellers: string[] = [];
  const bySeller = new Map<string, OrderLine[]>();
  for (const line of lines) {
    if (!bySeller.has(line.seller_id)) { bySeller.set(line.seller_id, []); sellers.push(line.seller_id); }
    bySeller.get(line.seller_id)!.push(line);
  }

  const items = sellers.map(s => bySeller.get(s)!.reduce((sum, l) => sum + l.total_cents, 0));
  const shipping = sellers.map(s => Math.max(0, shippingBySeller[s] ?? 0));
  const grosses = sellers.map((_, i) => items[i] + shipping[i]);
  const processingShares = allocate(Math.max(0, opts.stripeFeeCents), grosses);
  const taxFeeShares = allocate(Math.max(0, opts.taxFeeCents ?? 0), grosses);

  return sellers.map((sellerId, idx) => {
    const sellerLines = bySeller.get(sellerId)!;
    const gross = grosses[idx];
    const siqaFee = Math.round(gross * feeRate);
    const processing = processingShares[idx];
    const taxFee = taxFeeShares[idx];
    const payout = Math.max(0, gross - siqaFee - processing - taxFee);

    // Per-line breakdown: each line carries a share of the shop's shipping,
    // then a share of each fee, and its payout is what's left — so every
    // line adds up on its own and the lines add up to the seller's totals.
    const lineShipping = allocate(shipping[idx], sellerLines.map(l => l.total_cents));
    const lineGross = sellerLines.map((l, i) => l.total_cents + lineShipping[i]);
    const lineSiqa = allocate(siqaFee, lineGross);
    const lineProcessing = allocate(processing, lineGross);
    const lineTaxFee = allocate(taxFee, lineGross);
    const linePayout = payout === 0
      ? sellerLines.map(() => 0)
      : sellerLines.map((_, i) => lineGross[i] - lineSiqa[i] - lineProcessing[i] - lineTaxFee[i]);

    return {
      seller_id: sellerId,
      order_ids: sellerLines.map(l => l.id),
      item_count: sellerLines.reduce((n, l) => n + l.quantity, 0),
      items_cents: items[idx],
      shipping_cents: shipping[idx],
      gross_cents: gross,
      siqa_fee_cents: siqaFee,
      processing_fee_cents: processing,
      tax_fee_cents: taxFee,
      payout_cents: payout,
      lines: sellerLines.map((l, i) => ({
        id: l.id,
        shipping_cents: lineShipping[i],
        siqa_fee_cents: lineSiqa[i],
        processing_fee_cents: lineProcessing[i],
        tax_fee_cents: lineTaxFee[i],
        seller_payout_cents: linePayout[i],
      })),
    };
  });
}
