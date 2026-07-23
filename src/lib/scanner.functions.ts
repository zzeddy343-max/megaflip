import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  category: z.enum(["Buy/Sell", "Even/Odd", "Matches/Differs", "Over/Under"]),
});

type ScannerCategory = z.infer<typeof InputSchema>["category"];
type ScannerBias = "BUY" | "SELL" | "OVER" | "UNDER" | "EVEN" | "ODD" | "MATCH" | "DIFFER";

const MARKETS = [
  "Vol 10",
  "Vol 25",
  "Vol 50",
  "Vol 75",
  "Vol 100",
  "Vol 10 (1s)",
  "Vol 25 (1s)",
  "Vol 50 (1s)",
  "Vol 75 (1s)",
  "Vol 100 (1s)",
  "Crash 500",
  "Boom 500",
];

export const deepScanMarket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => scriptedScan(data.category));

function scriptedScan(category: ScannerCategory) {
  const minute = Math.floor(Date.now() / 60000);
  const scored = MARKETS.map((market, index) => {
    const momentum = wave(minute + index * 7, 19);
    const volatility = wave(minute + index * 11, 29);
    const pressure = wave(minute + index * 5, 13);
    const score = Math.round(45 + momentum * 22 + volatility * 18 + pressure * 15);
    return { market, score: clamp(score, 1, 99), momentum, volatility, pressure };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  const bias = pickBias(category, top.momentum, top.pressure, minute);
  const edge = clamp(
    Math.round(54 + top.score * 0.38 + Math.abs(top.momentum - top.pressure) * 10),
    58,
    91,
  );
  const buyCount = clamp(Math.round(6 + top.momentum * 4 + top.volatility * 2), 0, 12);
  const sellCount = clamp(
    12 -
      buyCount +
      (bias === "SELL" || bias === "UNDER" || bias === "ODD" || bias === "DIFFER" ? 1 : -1),
    0,
    12,
  );

  return {
    bestMarket: top.market,
    recommendation: `${top.market} - trade ${formatBias(bias)}`,
    bias,
    edge,
    buyCount,
    sellCount,
    rationale: `Scripted scanner favors ${top.market} over ${second.market} from momentum, volatility, and pressure readings.`,
  };
}

function pickBias(
  category: ScannerCategory,
  momentum: number,
  pressure: number,
  minute: number,
): ScannerBias {
  const bullish = momentum + pressure + wave(minute, 17) > 0;
  if (category === "Buy/Sell") return bullish ? "BUY" : "SELL";
  if (category === "Over/Under") return bullish ? "OVER" : "UNDER";
  if (category === "Even/Odd") return bullish ? "EVEN" : "ODD";
  return bullish ? "MATCH" : "DIFFER";
}

function wave(seed: number, cycle: number) {
  return Math.sin(((seed % cycle) / cycle) * Math.PI * 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatBias(bias: ScannerBias) {
  return bias[0] + bias.slice(1).toLowerCase();
}
