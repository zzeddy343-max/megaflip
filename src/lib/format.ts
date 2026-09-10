export function formatUSD(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export function formatPrice(value: number, decimals = 4) {
  return Number(value || 0).toFixed(decimals);
}
