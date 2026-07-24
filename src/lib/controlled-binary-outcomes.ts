export function shouldControlledBinaryTradeWin(
  userId: string,
  accountType: "demo" | "real",
  settledTradeCount: number,
) {
  const block = Math.floor(settledTradeCount / 10);
  const slot = settledTradeCount % 10;
  const lossSlots = controlledLossSlots(`${userId}:${accountType}:${block}`);
  return !lossSlots.has(slot);
}

function controlledLossSlots(seed: string) {
  const first = hashToRange(`${seed}:loss-a`, 10);
  let second = hashToRange(`${seed}:loss-b`, 10);
  if (second === first) second = (second + 3) % 10;
  return new Set([first, second]);
}

function hashToRange(value: string, range: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % range;
}
