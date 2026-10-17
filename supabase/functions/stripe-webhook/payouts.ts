// Pure money math for splitting one marketplace checkout between sellers.
// No Stripe or database calls here, so it can be unit-tested on its own.
//
// Etsy-style fees: Siqa keeps 6.5% of each seller's items, and the seller
// also covers their share of Stripe's processing fee for the charge. Every
// split is done with largest-remainder rounding so the parts always add up
// to the whole, to the cent.

export const SIQA_FEE_RATE = 0.065;

export type OrderLine = {
  id: string;
  seller_id: string;
  total_cents: number;
  quantity: number;
};

export type LineSplit = {
  id: string;
  siqa_fee_cents: number;
  processing_fee_cents: number;
  seller_payout_cents: number;
};

export type SellerSplit = {
  seller_id: string;
  order_ids: string[];
  item_count: number;
  gross_cents: number;
  siqa_fee_cents: number;
  processing_fee_cents: number;
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

/**
 * Split a paid checkout between its sellers.
 * @param lines          the checkout's order rows (one per product)
 * @param stripeFeeCents Stripe's actual processing fee on the charge
 * @param feeRate        Siqa's cut of item revenue (default 6.5%)
 */
export function splitCheckout(lines: OrderLine[], stripeFeeCents: number, feeRate = SIQA_FEE_RATE): SellerSplit[] {
  const sellers: string[] = [];
  const bySeller = new Map<string, OrderLine[]>();
  for (const line of lines) {
    if (!bySeller.has(line.seller_id)) { bySeller.set(line.seller_id, []); sellers.push(line.seller_id); }
    bySeller.get(line.seller_id)!.push(line);
  }

  const grosses = sellers.map(s => bySeller.get(s)!.reduce((sum, l) => sum + l.total_cents, 0));
  const processingShares = allocate(Math.max(0, stripeFeeCents), grosses);

  return sellers.map((sellerId, idx) => {
    const sellerLines = bySeller.get(sellerId)!;
    const gross = grosses[idx];
    const siqaFee = Math.round(gross * feeRate);
    const processing = processingShares[idx];
    const payout = Math.max(0, gross - siqaFee - processing);

    // Spread the seller's fees across their lines for the per-order breakdown.
    const weights = sellerLines.map(l => l.total_cents);
    const lineSiqa = allocate(siqaFee, weights);
    const lineProcessing = allocate(processing, weights);
    // Each line's payout is what's left of that line, so every line adds up
    // on its own (price = Siqa fee + processing + seller payout). Only if
    // fees exceed the seller's total (tiny orders) is it clamped to zero.
    const linePayout = payout === 0
      ? sellerLines.map(() => 0)
      : sellerLines.map((l, i) => l.total_cents - lineSiqa[i] - lineProcessing[i]);

    return {
      seller_id: sellerId,
      order_ids: sellerLines.map(l => l.id),
      item_count: sellerLines.reduce((n, l) => n + l.quantity, 0),
      gross_cents: gross,
      siqa_fee_cents: siqaFee,
      processing_fee_cents: processing,
      payout_cents: payout,
      lines: sellerLines.map((l, i) => ({
        id: l.id,
        siqa_fee_cents: lineSiqa[i],
        processing_fee_cents: lineProcessing[i],
        seller_payout_cents: linePayout[i],
      })),
    };
  });
}
