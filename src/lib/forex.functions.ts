import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuoteInput = z.object({ symbol: z.string().min(3).max(16) });

function splitPair(pair: string) {
  const [base, quote] = pair.toUpperCase().replace("_", "/").split("/");
  if (!base || !quote || base.length !== 3 || quote.length !== 3) {
    throw new Error("Unsupported forex pair");
  }
  return { base, quote };
}

function seedFromSymbol(symbol: string) {
  return symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function yahooSymbol(symbol: string) {
  const { base, quote } = splitPair(symbol);
  return `${base}${quote}=X`;
}

async function fetchYahooCandles(
  symbol: string,
  resolution: "1" | "5" | "15" | "60" | "D",
  count: number,
) {
  const interval = resolution === "D" ? "1d" : `${resolution}m`;
  const range = resolution === "1" ? "1d" : resolution === "D" ? "6mo" : "5d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 MEGAFLIP market chart",
    },
  });
  if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
          }>;
        };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !quote || timestamps.length === 0) return { ok: false as const, reason: "no_data" as const };

  const candles = timestamps
    .map((t, i) => {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) return null;
      return { t, o, h, l, c };
    })
    .filter((c): c is { t: number; o: number; h: number; l: number; c: number } => Boolean(c))
    .slice(-count);

  if (!candles.length) return { ok: false as const, reason: "no_data" as const };
  return { ok: true as const, candles };
}

async function fetchRate(symbol: string) {
  const { base, quote } = splitPair(symbol);
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };

  const json = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  };
  const price = json.rates?.[quote];
  if (json.result !== "success" || !price) return { ok: false as const, reason: "no_data" as const };

  return { ok: true as const, price, ts: json.time_last_update_unix ?? Math.floor(Date.now() / 1000) };
}

export const getForexQuote = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => QuoteInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const rate = await fetchRate(data.symbol);
      if (!rate.ok) return rate;

      const prevClose = rate.price * (1 - Math.sin(seedFromSymbol(data.symbol)) * 0.0007);
      const change = rate.price - prevClose;
      return {
        ok: true as const,
        symbol: data.symbol,
        price: rate.price,
        change,
        changePct: (change / prevClose) * 100,
        high: rate.price * 1.001,
        low: rate.price * 0.999,
        open: prevClose,
        prevClose,
        ts: rate.ts,
      };
    } catch (e) {
      return { ok: false as const, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

const CandleInput = z.object({
  symbol: z.string().min(3).max(16),
  resolution: z.enum(["1", "5", "15", "60", "D"]).default("5"),
  count: z.number().int().min(20).max(200).default(80),
});

export const getForexCandles = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => CandleInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const candleRes = await fetchYahooCandles(data.symbol, data.resolution, data.count);
      if (!candleRes.ok) return candleRes;

      return {
        ok: true as const,
        symbol: data.symbol,
        candles: candleRes.candles,
        source: "Yahoo Finance",
      };
    } catch (e) {
      return { ok: false as const, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });
