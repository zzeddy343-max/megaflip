export type MarketId =
  | "V10_1S"
  | "V25_1S"
  | "V50_1S"
  | "V75_1S"
  | "V100_1S"
  | "V10"
  | "V25"
  | "V50"
  | "V75"
  | "V100";

export type ContractType = "even_odd" | "over_under" | "matches_differs" | "rise_fall";
export type Direction = "even" | "odd" | "over" | "under" | "matches" | "differs" | "rise" | "fall";

type MarketSpec = {
  id: MarketId;
  label: string;
  base: number;
  volatility: number;
  intervalMs: number;
  decimals: number;
};

export const MARKETS: Record<MarketId, MarketSpec> = {
  V10_1S: { id: "V10_1S", label: "Volatility 10 (1s)", base: 1000, volatility: 0.55, intervalMs: 1000, decimals: 4 },
  V25_1S: { id: "V25_1S", label: "Volatility 25 (1s)", base: 1000, volatility: 0.72, intervalMs: 1000, decimals: 4 },
  V50_1S: { id: "V50_1S", label: "Volatility 50 (1s)", base: 1000, volatility: 0.92, intervalMs: 1000, decimals: 4 },
  V75_1S: { id: "V75_1S", label: "Volatility 75 (1s)", base: 1000, volatility: 1.14, intervalMs: 1000, decimals: 4 },
  V100_1S: { id: "V100_1S", label: "Volatility 100 (1s)", base: 1000, volatility: 1.35, intervalMs: 1000, decimals: 4 },
  V10: { id: "V10", label: "Volatility 10", base: 1000, volatility: 0.38, intervalMs: 1400, decimals: 4 },
  V25: { id: "V25", label: "Volatility 25", base: 1000, volatility: 0.54, intervalMs: 1200, decimals: 4 },
  V50: { id: "V50", label: "Volatility 50", base: 1000, volatility: 0.76, intervalMs: 1000, decimals: 4 },
  V75: { id: "V75", label: "Volatility 75", base: 1000, volatility: 0.98, intervalMs: 850, decimals: 4 },
  V100: { id: "V100", label: "Volatility 100", base: 1000, volatility: 1.18, intervalMs: 750, decimals: 4 },
};

export const MARKET_LIST = Object.values(MARKETS);

export const CONTRACTS = [
  {
    type: "even_odd",
    needsDigit: false,
    directions: [
      { key: "even", label: "Even" },
      { key: "odd", label: "Odd" },
    ],
  },
  {
    type: "over_under",
    needsDigit: true,
    directions: [
      { key: "over", label: "Over" },
      { key: "under", label: "Under" },
    ],
  },
  {
    type: "matches_differs",
    needsDigit: true,
    directions: [
      { key: "matches", label: "Matches" },
      { key: "differs", label: "Differs" },
    ],
  },
  {
    type: "rise_fall",
    needsDigit: false,
    directions: [
      { key: "rise", label: "Rise" },
      { key: "fall", label: "Fall" },
    ],
  },
] as const;

export function contractFor(type: ContractType) {
  return CONTRACTS.find((contract) => contract.type === type) ?? CONTRACTS[0];
}

export function payoutMultiplier(type: ContractType, direction: Direction) {
  if (type === "matches_differs") return direction === "matches" ? 9.1 : 1.12;
  if (type === "over_under") return 1.78;
  return 1.95;
}

export function priceAt(marketId: MarketId, timestamp: number) {
  const spec = MARKETS[marketId];
  const tick = Math.floor(timestamp / spec.intervalMs);
  const slow = Math.sin(tick / 19 + spec.volatility) * spec.volatility;
  const medium = Math.sin(tick / 7.3 + spec.base) * spec.volatility * 0.42;
  const fast = Math.sin(tick * 1.618 + spec.volatility * 11) * spec.volatility * 0.16;
  const drift = Math.sin(tick / 173) * spec.volatility * 1.8;
  return spec.base + slow + medium + fast + drift;
}

export function lastDigit(price: number, decimals: number) {
  return Math.abs(Math.round(price * 10 ** decimals)) % 10;
}
