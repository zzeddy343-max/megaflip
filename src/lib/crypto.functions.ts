import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const COIN_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
};

const QuoteInput = z.object({ symbol: z.string().min(2).max(8) });

export const getCryptoQuote = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => QuoteInput.parse(d))
  .handler(async ({ data }) => {
    const id = COIN_MAP[data.symbol.toUpperCase()];
    if (!id) return { ok: false as const, reason: "unknown_symbol" as const };
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };
      const j = (await res.json()) as Record<
        string,
        { usd: number; usd_24h_change?: number; usd_24h_vol?: number }
      >;
      const row = j[id];
      if (!row?.usd) return { ok: false as const, reason: "no_data" as const };
      return {
        ok: true as const,
        symbol: data.symbol.toUpperCase(),
        price: row.usd,
        changePct: row.usd_24h_change ?? 0,
        vol24h: row.usd_24h_vol ?? 0,
      };
    } catch (e) {
      return {
        ok: false as const,
        reason: "error" as const,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

const CandleInput = z.object({
  symbol: z.string().min(2).max(8),
  days: z.number().int().min(1).max(30).default(1),
});

export const getCryptoCandles = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => CandleInput.parse(d))
  .handler(async ({ data }) => {
    const id = COIN_MAP[data.symbol.toUpperCase()];
    if (!id) return { ok: false as const, reason: "unknown_symbol" as const };
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${data.days}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };
      const arr = (await res.json()) as [number, number, number, number, number][];
      if (!arr?.length) return { ok: false as const, reason: "no_data" as const };
      const candles = arr.map(([t, o, h, l, c]) => ({ t: Math.floor(t / 1000), o, h, l, c }));
      return { ok: true as const, symbol: data.symbol.toUpperCase(), candles };
    } catch (e) {
      return {
        ok: false as const,
        reason: "error" as const,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });
