// One place for turning cents into a display price, so every screen
// shows money the same way. Stripe stores currency codes lowercase
// ("usd"), so the code is normalized before it's used.
export function formatPrice(cents: number | null | undefined, currency?: string | null): string {
  const code = (currency || 'USD').toUpperCase();
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown currency code or no Intl support: fall back to a plain format.
    return (code === 'USD' ? '$' : code + ' ') + amount.toFixed(2);
  }
}
