import { useEffect, useState } from "react";
import { CandleChart } from "@/components/CandleChart";
import { Plus, Minus, Radio, ChevronDown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade } from "@/lib/trades.functions";
import { getCryptoQuote, getCryptoCandles } from "@/lib/crypto.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";
import { OpenPositionLines, OpenPositionsPanel } from "@/components/OpenPositionsPanel";

const COINS = [
  { sym: "BTC", name: "Bitcoin", mark: "₿", color: "#F7931A" },
  { sym: "ETH", name: "Ethereum", mark: "Ξ", color: "#627EEA" },
  { sym: "SOL", name: "Solana", mark: "◎", color: "#14F195" },
  { sym: "BNB", name: "BNB", mark: "BNB", color: "#F3BA2F" },
  { sym: "XRP", name: "XRP", mark: "XRP", color: "#0085c0" },
  { sym: "DOGE", name: "Dogecoin", mark: "Ð", color: "#C2A633" },
  { sym: "ADA", name: "Cardano", mark: "₳", color: "#0033AD" },
  { sym: "AVAX", name: "Avalanche", mark: "A", color: "#E84142" },
];

export function CryptoPanel() {
  const [coin, setCoin] = useState(COINS[0]);
  const [stake, setStake] = useState(50);
  const [lev, setLev] = useState(10);
  const INDICATOR_OPTIONS = [
    "SMA",
    "EMA",
    "Bollinger",
    "RSI",
    "MACD",
    "ATR",
    "VWAP",
    "Stochastic",
    "Momentum",
    "OBV",
    "ADX",
    "CCI",
  ] as const;
  type IndicatorOption = (typeof INDICATOR_OPTIONS)[number];

  const [pickerOpen, setPickerOpen] = useState(false);
  const [chartOptionsOpen, setChartOptionsOpen] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<IndicatorOption[]>([
    "SMA",
    "EMA",
    "Bollinger",
  ]);

  const quoteFn = useServerFn(getCryptoQuote);
  const candlesFn = useServerFn(getCryptoCandles);
  const place = useServerFn(placeTrade);
  const qc = useQueryClient();
  const [displayPrice, setDisplayPrice] = useState(0);

  const { data: quote } = useQuery({
    queryKey: ["crypto-quote", coin.sym],
    queryFn: () => quoteFn({ data: { symbol: coin.sym } }),
    refetchInterval: 8000,
  });
  const { data: candleRes } = useQuery({
    queryKey: ["crypto-candles", coin.sym],
    queryFn: () => candlesFn({ data: { symbol: coin.sym, days: 1 } }),
    refetchInterval: 60_000,
  });

  const live = quote?.ok ? quote : null;
  const price = displayPrice || live?.price || 0;
  const change = live?.changePct ?? 0;
  const candles = candleRes?.ok ? candleRes.candles : [];

  useEffect(() => {
    setDisplayPrice(live?.price ?? 0);
  }, [live?.price]);

  useEffect(() => {
    const id = setInterval(() => {
      setDisplayPrice((prev) => {
        const anchor = live?.price ?? prev;
        if (!anchor) return prev;
        const scale = Math.max(0.00002, anchor * 0.00018);
        const pull = (anchor - prev) * 0.12;
        const wave = Math.sin(Date.now() / 780) * scale * 0.55;
        const jitter = (Math.random() - 0.5) * scale;
        return Math.max(0, prev + pull + wave + jitter);
      });
    }, 750);
    return () => clearInterval(id);
  }, [live?.price]);

  async function submit(direction: "LONG" | "SHORT") {
    logDebugEvent("info", "crypto.trade", "Placing crypto trade", {
      coin: coin.sym,
      direction,
      stake,
      leverage: lev,
      price,
    });
    if (!price) {
      logDebugEvent("warn", "crypto.trade", "Crypto trade blocked because price is unavailable", {
        coin: coin.sym,
      });
      toast.error("Price not available");
      return;
    }
    try {
      const trade = await place({
        data: {
          module: "crypto",
          market: `${coin.sym}/USD`,
          direction,
          stake,
          entry_price: price,
          meta: { leverage: lev },
        },
      });
      logDebugEvent("info", "crypto.trade", "Crypto trade placed", {
        tradeId: trade.id,
        coin: coin.sym,
        direction,
      });
      toast.success(`${direction} ${coin.sym} ${lev}x @ $${price.toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) {
      logDebugEvent("error", "crypto.trade", "Crypto trade failed", serializeError(e));
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-2.5">
      <button
        onClick={() => setPickerOpen(!pickerOpen)}
        className="w-full flex items-center justify-between bg-card border border-border rounded-xl p-2.5"
      >
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-full grid place-items-center text-white font-bold text-xs"
            style={{ background: coin.color }}
          >
            {coin.mark}
          </div>
          <div className="text-left">
            <div className="font-bold text-sm">{coin.sym}/USD</div>
            <div className={"text-[10px] " + (change >= 0 ? "text-bull" : "text-bear")}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}% · $
              {price > 0
                ? price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 5 : 2 })
                : "—"}{" "}
              <Radio className="inline h-2.5 w-2.5 ml-0.5" />
            </div>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">change ▾</span>
      </button>

      {pickerOpen && (
        <div className="bg-card border border-border rounded-xl divide-y divide-border max-h-72 overflow-auto">
          {COINS.map((c) => (
            <button
              key={c.sym}
              onClick={() => {
                setCoin(c);
                setPickerOpen(false);
              }}
              className="w-full text-left p-2.5 hover:bg-accent flex items-center gap-2 text-sm"
            >
              <span
                className="h-6 w-6 rounded-full grid place-items-center text-white text-[10px] font-bold"
                style={{ background: c.color }}
              >
                {c.mark}
              </span>
              <span className="font-semibold flex-1">{c.name}</span>
              <span className="text-muted-foreground text-xs">{c.sym}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold">
              Chart controls
            </div>
            <div className="text-sm font-semibold">Indicators</div>
          </div>
          <button
            type="button"
            onClick={() => setChartOptionsOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground"
          >
            <span>{chartOptionsOpen ? "Hide" : "Show"} indicators</span>
            <ChevronDown
              className={"h-4 w-4 transition " + (chartOptionsOpen ? "rotate-180" : "")}
            />
          </button>
        </div>
        {chartOptionsOpen && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {INDICATOR_OPTIONS.map((indicator) => {
              const active = selectedIndicators.includes(indicator);
              return (
                <button
                  key={indicator}
                  type="button"
                  onClick={() =>
                    setSelectedIndicators((prev) =>
                      prev.includes(indicator)
                        ? prev.filter((item) => item !== indicator)
                        : [...prev, indicator],
                    )
                  }
                  className={
                    "rounded-xl border px-2 py-2 text-[11px] font-semibold transition " +
                    (active
                      ? "bg-primary/15 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground")
                  }
                >
                  {indicator}
                </button>
              );
            })}
          </div>
        )}
        <div className="bg-card border border-border rounded-xl p-2 h-56">
          <div className="relative h-full">
            <CandleChart
              candles={candles}
              livePrice={price}
              indicators={selectedIndicators}
              className="h-full"
            />
            <OpenPositionLines
              module="crypto"
              market={`${coin.sym}/USD`}
              livePrice={price}
              digits={price < 1 ? 5 : 2}
            />
          </div>
        </div>
      </div>

      <OpenPositionsPanel
        module="crypto"
        market={`${coin.sym}/USD`}
        livePrice={price}
        digits={price < 1 ? 5 : 2}
      />

      <div className="bg-card border border-border rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
              Amount to trade
            </div>
            <div className="text-xs text-muted-foreground">Margin amount in USD</div>
          </div>
          <div className="flex items-center bg-surface border border-border rounded-xl px-2 py-1.5 min-w-32">
            <span className="text-sm font-bold text-muted-foreground mr-1">$</span>
            <input
              type="number"
              value={stake}
              min={5}
              onChange={(e) => setStake(Math.max(5, Number(e.target.value) || 5))}
              className="w-full bg-transparent outline-none text-right font-extrabold text-lg tabular-nums"
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[10, 25, 50, 100].map((value) => (
            <button
              key={value}
              onClick={() => setStake(value)}
              className={
                "py-1.5 rounded-lg border text-xs font-bold " +
                (stake === value
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-surface border-border text-muted-foreground")
              }
            >
              ${value}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => submit("LONG")}
          className="py-3 rounded-xl bg-bull text-bull-foreground font-extrabold glow-bull text-sm"
        >
          LONG ${stake}
        </button>
        <button
          onClick={() => submit("SHORT")}
          className="py-3 rounded-xl bg-bear text-bear-foreground font-extrabold glow-bear text-sm"
        >
          SHORT ${stake}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <div className="bg-card border border-border rounded-lg p-2">
          <div className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">
            Leverage
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setLev(Math.max(1, lev - 1))}
              className="h-5 w-5 rounded bg-surface grid place-items-center"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span className="font-bold text-sm tabular-nums">{lev}x</span>
            <button
              onClick={() => setLev(Math.min(100, lev + 1))}
              className="h-5 w-5 rounded bg-surface grid place-items-center"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground text-center">
        Notional: ${(stake * lev).toLocaleString()} · Liquidation buffer ~{(100 / lev).toFixed(1)}%
      </div>
    </div>
  );
}
