export function normalizeTickCount(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function getTickLabel(tickCount) {
  const normalized = normalizeTickCount(tickCount);
  return `${normalized} tick${normalized === 1 ? "" : "s"}`;
}

export function getProfitRateForContract(type, direction, tickCount = 1) {
  const normalizedTickCount = normalizeTickCount(tickCount);
  const tickPremium =
    normalizedTickCount > 1 ? Math.min(0.08, (normalizedTickCount - 1) * 0.02) : 0;

  if (type === "Buy/Sell" || type === "Even/Odd") return 0.7 + tickPremium;
  if (type === "Matches/Differs") return direction === "MATCH" ? 4 : 0.06;
  return 0.2 + tickPremium;
}

export function resolveContractOutcome({
  type,
  direction,
  entryPrice,
  settlementPrice,
  selectedDigit = 5,
}) {
  const finalDigit = Math.floor(settlementPrice * 10000) % 10;

  if (type === "Buy/Sell") {
    return direction === "BUY" ? settlementPrice > entryPrice : settlementPrice < entryPrice;
  }
  if (type === "Even/Odd") {
    return direction === "EVEN" ? finalDigit % 2 === 0 : finalDigit % 2 === 1;
  }
  if (type === "Over/Under") {
    return direction === "OVER" ? finalDigit > selectedDigit : finalDigit < selectedDigit;
  }
  return direction === "MATCH" ? finalDigit === selectedDigit : finalDigit !== selectedDigit;
}
