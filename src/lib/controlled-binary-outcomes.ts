export function shouldControlledBinaryTradeWin(
  userId: string,
  accountType: "demo" | "real",
  settledTradeCount: number,
  winRatePercent = 80,
) {
  const target = Math.max(0, Math.min(100, Number(winRatePercent)));
  if (target <= 0) return false;
  if (target >= 100) return true;

  const block = Math.floor(settledTradeCount / 100);
  const slot = settledTradeCount % 100;
  const winners = new Set(
    Array.from({ length: 100 }, (_, index) => ({
      index,
      rank: hashToRange(`${userId}:${accountType}:${block}:${index}`, 1_000_000),
    }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, Math.round(target))
      .map(({ index }) => index),
  );
  return winners.has(slot);
}

export type ControlledContractType = "even_odd" | "over_under" | "matches_differs" | "rise_fall";
export type ControlledDirection =
  "even" | "odd" | "over" | "under" | "matches" | "differs" | "rise" | "fall";

export function buildControlledBinaryExitPrice({
  entryPrice,
  requestedExitPrice,
  contractType,
  direction,
  digitTarget,
  decimals,
  shouldWin,
  seed,
}: {
  entryPrice: number | null | undefined;
  requestedExitPrice: number | null | undefined;
  contractType: ControlledContractType;
  direction: ControlledDirection;
  digitTarget?: number | null;
  decimals?: number | null;
  shouldWin: boolean;
  seed: string;
}) {
  const basePrice = validPrice(requestedExitPrice) ?? validPrice(entryPrice) ?? 1000;
  const entry = validPrice(entryPrice) ?? basePrice;
  const places = normalizeDecimals(decimals);

  if (contractType === "rise_fall") {
    const step = 1 / 10 ** places;
    const winsRise = direction === "rise" ? shouldWin : !shouldWin;
    return roundToDecimals(entry + (winsRise ? step : -step), places);
  }

  const digit = pickDigitForOutcome({
    contractType,
    direction,
    digitTarget,
    shouldWin,
    seed,
  });
  return priceWithLastDigit(basePrice, digit, places);
}

export function pickDigitForOutcome({
  contractType,
  direction,
  digitTarget,
  shouldWin,
  seed,
}: {
  contractType: ControlledContractType;
  direction: ControlledDirection;
  digitTarget?: number | null;
  shouldWin: boolean;
  seed: string;
}) {
  const target = normalizeDigit(digitTarget);
  const winners = winningDigits(contractType, direction, target);
  const candidates = shouldWin ? winners : DIGITS.filter((digit) => !winners.includes(digit));
  const safeCandidates = candidates.length ? candidates : DIGITS;
  return safeCandidates[
    hashToRange(`${seed}:${shouldWin ? "win" : "loss"}:digit`, safeCandidates.length)
  ];
}

function hashToRange(value: string, range: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % range;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function winningDigits(
  contractType: ControlledContractType,
  direction: ControlledDirection,
  target: number,
) {
  if (contractType === "even_odd") {
    return direction === "even" ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9];
  }
  if (contractType === "over_under") {
    return direction === "over"
      ? DIGITS.filter((digit) => digit > target)
      : DIGITS.filter((digit) => digit < target);
  }
  if (contractType === "matches_differs") {
    return direction === "matches" ? [target] : DIGITS.filter((digit) => digit !== target);
  }
  return DIGITS;
}

function priceWithLastDigit(price: number, digit: number, decimals: number) {
  const scale = 10 ** decimals;
  const scaled = Math.max(1, Math.round(price * scale));
  const currentDigit = Math.abs(scaled) % 10;
  const up = (digit - currentDigit + 10) % 10;
  const down = up === 0 ? 0 : up - 10;
  const adjustment = Math.abs(down) < up ? down : up;
  return roundToDecimals((scaled + adjustment) / scale, decimals);
}

function normalizeDigit(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 5;
  return Math.max(0, Math.min(9, Math.round(Number(value))));
}

function normalizeDecimals(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 4;
  return Math.max(0, Math.min(8, Math.round(Number(value))));
}

function validPrice(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null;
}

function roundToDecimals(value: number, decimals: number) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
