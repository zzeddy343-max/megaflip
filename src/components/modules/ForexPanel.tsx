import { useEffect, useState } from "react";
import { CandleChart } from "@/components/CandleChart";
import { Plus, Minus, Radio, ChevronDown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade } from "@/lib/trades.functions";
import { getForexQuote, getForexCandles } from "@/lib/forex.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";
import { OpenPositionLines, OpenPositionsPanel } from "@/components/OpenPositionsPanel";

const PAIRS = [
  { sym: "EUR/USD", flag: "🇪🇺🇺🇸", base: 1.14066, spread: 0.0002 },
  { sym: "GBP/USD", flag: "🇬🇧🇺🇸", base: 1.27412, spread: 0.0003 },
  { sym: "USD/JPY", flag: "🇺🇸🇯🇵", base: 155.84, spread: 0.02 },
  { sym: "AUD/USD", flag: "🇦🇺🇺🇸", base: 0.6643, spread: 0.0002 },
  { sym: "USD/CHF", flag: "🇺🇸🇨🇭", base: 0.8912, spread: 0.0002 },
  { sym: "USD/CAD", flag: "🇺🇸🇨🇦", base: 1.3694, spread: 0.0003 },
  { sym: "NZD/USD", flag: "🇳🇿🇺🇸", base: 0.6042, spread: 0.0003 },
  { sym: "EUR/JPY", flag: "🇪🇺🇯🇵", base: 177.72, spread: 0.03 },
  { sym: "GBP/JPY", flag: "🇬🇧🇯🇵", base: 198.56, spread: 0.04 },
];

const RESOLUTIONS: { label: string; value: "1" | "5" | "15" | "60" }[] = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
];

export function ForexPanel() {
  const [pair, setPair] = useState(PAIRS[0]);
  const [amount, setAmount] = useState(10);
  const [size, setSize] = useState(0.1);
  const [sl, setSl] = useState(25);
  const [tp, setTp] = useState(45);
  const [resolution, setResolution] = useState<"1" | "5" | "15" | "60">("5");
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

  const place = useServerFn(placeTrade);
  const quoteFn = useServerFn(getForexQuote);
  const candlesFn = useServerFn(getForexCandles);
  const qc = useQueryClient();
  const [displayPrice, setDisplayPrice] = useState(pair.base);

  const { data: quote } = useQuery({
    queryKey: ["fx-quote", pair.sym],
    queryFn: () => quoteFn({ data: { symbol: pair.sym } }),
    refetchInterval: 5000,
  });

  const { data: candleRes } = useQuery({
    queryKey: ["fx-candles", pair.sym, resolution],
    queryFn: () => candlesFn({ data: { symbol: pair.sym, resolution, count: 80 } }),
    refetchInterval: 30000,
  });

  const live = quote?.ok ? quote : null;
  const price = displayPrice || live?.price || pair.base;
  const digits = pair.sym.includes("JPY") ? 2 : 5;
  const bid = (price - pair.spread / 2).toFixed(digits);
  const ask = (price + pair.spread / 2).toFixed(digits);
  const rr = (tp / sl).toFixed(2);
  const change = live?.changePct ?? 0;
  const candles = candleRes?.ok ? candleRes.candles : [];

  useEffect(() => {
    setDisplayPrice(live?.price ?? pair.base);
  }, [live?.price, pair.base]);

  useEffect(() => {
    const pip = pair.sym.includes("JPY") ? 0.01 : 0.0001;
    const id = setInterval(() => {
      setDisplayPrice((prev) => {
        const anchor = live?.price ?? pair.base;
        const pull = (anchor - prev) * 0.16;
        const wave = Math.sin(Date.now() / 900) * pip * 0.35;
        const jitter = (Math.random() - 0.5) * pip * 0.5;
        return Math.max(pip, prev + pull + wave + jitter);
      });
    }, 850);
    return () => clearInterval(id);
  }, [live?.price, pair.base, pair.sym]);

  async function submit(direction: "BUY" | "SELL") {
    logDebugEvent("info", "forex.trade", "Placing forex trade", {
      pair: pair.sym,
      direction,
      amount,
      size,
      sl,
      tp,
      price,
    });
    try {
      const trade = await place({
        data: {
          module: "forex",
          market: pair.sym,
          direction,
          stake: amount,
          entry_price: price,
          meta: { sl, tp, lot: size, amount_usd: amount },
        },
      });
      logDebugEvent("info", "forex.trade", "Forex trade placed", {
        tradeId: trade.id,
        pair: pair.sym,
        direction,
      });
      toast.success(`${direction} ${pair.sym} $${amount} @ ${price.toFixed(digits)}`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) {
      logDebugEvent("error", "forex.trade", "Forex trade failed", serializeError(e));
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
          <div className="h-8 w-8 rounded-full bg-primary/10 grid place-items-center text-base leading-none">
            {pair.flag}
          </div>
          <div className="text-left">
            <div className="font-bold text-sm">{pair.sym}</div>
            <div className={"text-[10px] " + (change >= 0 ? "text-bull" : "text-bear")}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}% <Radio className="inline h-2.5 w-2.5 ml-0.5" />
            </div>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">change</span>
      </button>

      {pickerOpen && (
        <div className="bg-card border border-border rounded-xl divide-y divide-border max-h-60 overflow-auto">
          {PAIRS.map((p) => (
            <button
              key={p.sym}
              onClick={() => {
                setPair(p);
                setPickerOpen(false);
              }}
              className="w-full text-left p-2.5 hover:bg-accent flex justify-between text-sm"
            >
              <span className="flex items-center gap-2 font-semibold">
                <span className="text-base">{p.flag}</span>
                {p.sym}
              </span>
              <span className="text-muted-foreground tabular-nums">{p.base}</span>
            </button>
          ))}
        </div>
      )}

      {candleRes && !candleRes.ok && (
        <div className="bg-bear/10 border border-bear/30 text-bear text-[10px] rounded-lg p-1.5 text-center">
          Live chart source unavailable. Try again in a moment.
        </div>
      )}

      <div className="flex gap-1.5">
        {RESOLUTIONS.map((r) => (
          <button
            key={r.value}
            onClick={() => setResolution(r.value)}
            className={
              "flex-1 py-1 rounded-md text-[11px] font-bold " +
              (resolution === r.value
                ? "bg-primary/20 text-primary border border-primary/40"
                : "bg-surface border border-border text-muted-foreground")
            }
          >
            {r.label}
          </button>
        ))}
      </div>

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
            <OpenPositionLines module="forex" market={pair.sym} livePrice={price} digits={digits} />
          </div>
        </div>
      </div>

      <OpenPositionsPanel module="forex" market={pair.sym} livePrice={price} digits={digits} />

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
              value={amount}
              min={1}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
              className="w-full bg-transparent outline-none text-right font-extrabold text-lg tabular-nums"
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[10, 25, 50, 100].map((value) => (
            <button
              key={value}
              onClick={() => setAmount(value)}
              className={
                "py-1.5 rounded-lg border text-xs font-bold " +
                (amount === value
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
          onClick={() => submit("BUY")}
          className="py-3 rounded-xl bg-bull text-bull-foreground font-extrabold glow-bull text-sm"
        >
          BUY ${amount}
          <div className="text-[10px] font-mono opacity-80">{ask}</div>
        </button>
        <button
          onClick={() => submit("SELL")}
          className="py-3 rounded-xl bg-bear text-bear-foreground font-extrabold glow-bear text-sm"
        >
          SELL ${amount}
          <div className="text-[10px] font-mono opacity-80">{bid}</div>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Field
          label="Size"
          value={`${size.toFixed(2)}`}
          onMinus={() => setSize(Math.max(0.01, +(size - 0.01).toFixed(2)))}
          onPlus={() => setSize(+(size + 0.01).toFixed(2))}
        />
        <Field
          label="SL"
          value={`${sl}p`}
          onMinus={() => setSl(Math.max(1, sl - 5))}
          onPlus={() => setSl(sl + 5)}
        />
        <Field
          label="TP"
          value={`${tp}p`}
          onMinus={() => setTp(Math.max(1, tp - 5))}
          onPlus={() => setTp(tp + 5)}
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-2.5 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-muted-foreground">Risk : Reward</div>
          <div className="font-bold text-sm">1 : {rr}</div>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="text-bear">-${(size * sl * 10).toFixed(0)}</span>
          <span className="text-bull">+${(size * tp * 10).toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-1.5">
      <div className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">
        {label}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onMinus} className="h-5 w-5 rounded bg-surface grid place-items-center">
          <Minus className="h-2.5 w-2.5" />
        </button>
        <span className="font-bold text-xs tabular-nums">{value}</span>
        <button onClick={onPlus} className="h-5 w-5 rounded bg-surface grid place-items-center">
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}
