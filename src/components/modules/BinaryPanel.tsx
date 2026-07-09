import { useEffect, useRef, useState } from "react";
import { LiveChart } from "@/components/LiveChart";
import { Plus, Minus, Bot, User, Square, ChevronDown, CandlestickChart, LineChart } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade, settleTrade, getMyProfile } from "@/lib/trades.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";
import { getProfitRateForContract, getTickLabel, normalizeTickCount, resolveContractOutcome } from "@/lib/binary-simulation";

const VOL_INDICES = [
  {
    label: "Volatility 10 Index",
    value: "Vol 10",
    basePrice: 1000,
    volatility: 0.00024,
    tickMs: 1400,
    rhythm: [2100, 1800, 1200, 2200, 900],
    volatilityLabel: "Low",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 25 Index",
    value: "Vol 25",
    basePrice: 1000,
    volatility: 0.00038,
    tickMs: 1200,
    rhythm: [1800, 1300, 900, 1600, 520],
    volatilityLabel: "Low-Medium",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 50 Index",
    value: "Vol 50",
    basePrice: 1000,
    volatility: 0.00058,
    tickMs: 1000,
    rhythm: [1500, 880, 620, 1200, 420],
    volatilityLabel: "Medium",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 75 Index",
    value: "Vol 75",
    basePrice: 1000,
    volatility: 0.00078,
    tickMs: 850,
    rhythm: [1200, 640, 420, 900, 320],
    volatilityLabel: "High",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 100 Index",
    value: "Vol 100",
    basePrice: 1000,
    volatility: 0.001,
    tickMs: 750,
    rhythm: [980, 520, 360, 740, 260],
    volatilityLabel: "Very High",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 10 (1s) Index",
    value: "Vol 10 (1s)",
    basePrice: 1000,
    volatility: 0.00036,
    tickMs: 1000,
    rhythm: [2000, 1400, 650, 420, 250],
    volatilityLabel: "Low",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 25 (1s) Index",
    value: "Vol 25 (1s)",
    basePrice: 1000,
    volatility: 0.00054,
    tickMs: 1000,
    rhythm: [1600, 900, 500, 300, 220],
    volatilityLabel: "Low-Medium",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 50 (1s) Index",
    value: "Vol 50 (1s)",
    basePrice: 1000,
    volatility: 0.00072,
    tickMs: 1000,
    rhythm: [1300, 760, 440, 260, 190],
    volatilityLabel: "Medium",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 75 (1s) Index",
    value: "Vol 75 (1s)",
    basePrice: 1000,
    volatility: 0.00094,
    tickMs: 1000,
    rhythm: [1100, 620, 340, 220, 170],
    volatilityLabel: "High",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 100 (1s) Index",
    value: "Vol 100 (1s)",
    basePrice: 1000,
    volatility: 0.00115,
    tickMs: 1000,
    rhythm: [900, 500, 280, 190, 150],
    volatilityLabel: "Very High",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Crash 500 Index",
    value: "Crash 500",
    basePrice: 500,
    volatility: 0.00066,
    tickMs: 520,
    rhythm: [1900, 1450, 900, 520, 760],
  },
  {
    label: "Boom 500 Index",
    value: "Boom 500",
    basePrice: 500,
    volatility: 0.00066,
    tickMs: 520,
    rhythm: [760, 520, 900, 1450, 1900],
  },
] as const;
const TYPES = ["Buy/Sell", "Even/Odd", "Matches/Differs", "Over/Under"] as const;
type TradeType = (typeof TYPES)[number];
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
const QUICK = [1, 5, 10, 25, 50, 100];

type Tick = { d: number; tone: "neutral" | "bull" | "bear" };

export function BinaryPanel() {
  const [index, setIndex] = useState("Vol 25");
  const [type, setType] = useState<TradeType>("Buy/Sell");
  const [marketOpen, setMarketOpen] = useState(false);
  const [chartMode, setChartMode] = useState<"line" | "candles">("candles");
  const [stake, setStake] = useState(10);
  const [selectedDigit, setSelectedDigit] = useState(5);
  const [tickProgression, setTickProgression] = useState(4);
  const [selectedIndicators, setSelectedIndicators] = useState<IndicatorOption[]>(["SMA", "RSI", "MACD"]);
  const [chartOptionsOpen, setChartOptionsOpen] = useState(false);
  const [botMode, setBotMode] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [target, setTarget] = useState(200);
  const [stop, setStop] = useState(50);
  const [martingale, setMartingale] = useState(2);
  const [price, setPrice] = useState(1000);
  const [pendingTrade, setPendingTrade] = useState<{
    tradeId: string;
    direction: string;
    stake: number;
    type: TradeType;
    market: string;
    entryPrice: number;
    status: "open" | "settled";
    result?: "win" | "loss";
    pnl?: number;
  } | null>(null);
  const [settleNote, setSettleNote] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [tickTrail, setTickTrail] = useState<Tick[]>([]);
  const [digitHistory, setDigitHistory] = useState<number[]>([]);

  const place = useServerFn(placeTrade);
  const settle = useServerFn(settleTrade);
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 20_000,
  });
  const qc = useQueryClient();

  // refs for bot loop
  const botRunningRef = useRef(false);
  const sessionPnLRef = useRef(0);
  const currentStakeRef = useRef(stake);
  const activeDirectionRef = useRef<string | null>(null);
  const indexRef = useRef(index);
  const typeRef = useRef<TradeType>(type);
  const selectedDigitRef = useRef(selectedDigit);
  const priceRef = useRef(price);
  const digitHistoryRef = useRef<number[]>([]);
  const priceTickCountRef = useRef(0);
  const autoSignalConsumedRef = useRef(false);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    typeRef.current = type;
  }, [type]);
  useEffect(() => {
    selectedDigitRef.current = selectedDigit;
  }, [selectedDigit]);
  useEffect(() => {
    priceRef.current = price;
  }, [price]);
  useEffect(() => {
    digitHistoryRef.current = digitHistory;
  }, [digitHistory]);
  const market = VOL_INDICES.find((m) => m.value === index) ?? VOL_INDICES[1];
  const hour = new Date().getHours();
  const intradayPace = 0.76 + ((Math.sin((hour / 24) * Math.PI * 2 + 0.7) + 1) / 2) * 0.72;
  const chartTickMs = Math.max(
    market.tickMs < 280 ? 260 : 140,
    Math.round(market.tickMs / intradayPace),
  );
  const chartCandleMs = Math.max(1600, Math.min(3600, Math.round(chartTickMs * 4.5)));
  const chartVolatility = market.volatility * (0.88 + intradayPace * 0.22);
  const settlementTicks = normalizeTickCount(tickProgression);
  const settlementTickLabel = getTickLabel(settlementTicks);
  const showDigitStats = type !== "Buy/Sell";
  const showDigitPicker = type === "Over/Under" || type === "Matches/Differs";

  useEffect(() => {
    if (autoSignalConsumedRef.current) return;
    const raw = window.sessionStorage.getItem("tronix-scanner-bot");
    if (!raw) return;
    autoSignalConsumedRef.current = true;
    window.sessionStorage.removeItem("tronix-scanner-bot");
    try {
      const signal = JSON.parse(raw) as { category?: TradeType; market?: string; bias?: string };
      if (signal.category && TYPES.includes(signal.category)) {
        typeRef.current = signal.category;
        setType(signal.category);
      }
      if (signal.market && VOL_INDICES.some((m) => m.value === signal.market)) {
        indexRef.current = signal.market;
        setIndex(signal.market);
      }
      setBotMode(true);
      toast.success("Scanner bot loaded and auto trade started");
      window.setTimeout(() => startBot("AUTO"), 450);
    } catch {
      toast.error("Could not load scanner bot signal");
    }
  }, []);

  // Track last digit + paint trail, then color active digit contracts by win/loss.
  useEffect(() => {
    priceTickCountRef.current += 1;
    const d = Math.floor(price * 10000) % 10;
    setDigitHistory((prev) => [...prev.slice(-99), d]);
    setTickTrail((prev) => {
      const dir = activeDirectionRef.current;
      const ty = typeRef.current;
      const sel = selectedDigitRef.current;
      let tone: "neutral" | "bull" | "bear" = "neutral";
      if (dir && ty !== "Buy/Sell") {
        let winning = false;
        if (ty === "Even/Odd") winning = dir === "EVEN" ? d % 2 === 0 : d % 2 === 1;
        else if (ty === "Over/Under") winning = dir === "OVER" ? d > sel : d < sel;
        else winning = dir === "MATCH" ? d === sel : d !== sel;
        tone = winning ? "bull" : "bear";
      }
      return [...prev.slice(-19), { d, tone }];
    });
  }, [price]);

  const digitStats = Array.from({ length: 10 }, (_, d) => {
    const c = digitHistory.filter((x) => x === d).length;
    return { d, pct: digitHistory.length ? (c / digitHistory.length) * 100 : 10 };
  });
  const maxPct = Math.max(...digitStats.map((s) => s.pct));
  const minPct = Math.min(...digitStats.map((s) => s.pct));
  const currentDigit = digitHistory[digitHistory.length - 1] ?? 0;
  const isDemoAccount = profile?.active_account === "demo";
  const overRate = getProfitRateForContract({ type, direction: "OVER", digit: selectedDigit, ticks: settlementTicks });
  const underRate = getProfitRateForContract({ type, direction: "UNDER", digit: selectedDigit, ticks: settlementTicks });
  const payoutOver = (stake * (1 + overRate / 100)) || 0;
  const payoutUnder = (stake * (1 + underRate / 100)) || 0;
  const chartNote = pendingTrade
    ? pendingTrade.status === "open"
      ? `Open ${pendingTrade.direction} ${pendingTrade.type} $${pendingTrade.stake} · ${settlementTickLabel}`
      : settleNote
    : settleNote ?? `Settles on ${settlementTickLabel}`;
  const chartNoteTone = pendingTrade
    ? pendingTrade.status === "open"
      ? "neutral"
      : pendingTrade.result === "win"
      ? "bull"
      : "bear"
    : "neutral";
  useEffect(() => {
    if (pendingTrade?.status !== "settled") return;
    const timeout = window.setTimeout(() => {
      setPendingTrade(null);
      setSettleNote(null);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [pendingTrade?.status]);

  async function placeAndSettle(direction: string, useStake: number): Promise<boolean> {
    const ty = typeRef.current;
    const sel = selectedDigitRef.current;
    const entryPrice = priceRef.current;
    const neededTicks = settlementTicks;
    activeDirectionRef.current = direction;
    let trade;
    logDebugEvent("info", "binary.trade", "Placing binary trade", {
      market: indexRef.current,
      type: ty,
      direction,
      stake: useStake,
      selectedDigit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
      price: priceRef.current,
    });
    setPlacing(true);
    setSettleNote(null);
    try {
      trade = await place({
        data: {
          module: "binary",
          market: indexRef.current,
          direction,
          stake: useStake,
          entry_price: priceRef.current,
          meta: {
            type: ty,
            digit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
          },
        },
      });
      const id = trade.id ?? `pending-${Date.now()}`;
      setPendingTrade({
        tradeId: id,
        direction,
        stake: useStake,
        type: ty,
        market: indexRef.current,
        entryPrice: priceRef.current,
        status: "open",
      });
      toast.success("Contract placed and open — waiting for result");
      logDebugEvent("info", "binary.trade", "Binary trade placed", {
        tradeId: trade.id,
        direction,
        stake: useStake,
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      logDebugEvent("error", "binary.trade", "Binary trade placement failed", serializeError(e));
      toast.error(e instanceof Error ? e.message : "Failed");
      activeDirectionRef.current = null;
      setPendingTrade(null);
      throw e;
    }
    const priceCursor = priceTickCountRef.current;
    while (priceTickCountRef.current - priceCursor < neededTicks) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const settlementPrice = priceRef.current;
    const finalDigit = Math.floor(settlementPrice * 10000) % 10;
    const won = resolveContractOutcome({
      type: ty,
      direction,
      entryPrice,
      settlementPrice,
      selectedDigit: sel,
    });

    const winProfitRate = getProfitRateForContract(ty, direction, neededTicks);
    try {
      await settle({
        data: {
          trade_id: trade.id,
          won,
          exit_price: settlementPrice,
          multiplier: 1 + winProfitRate,
        },
      });
      const pnl = won ? useStake * winProfitRate : -useStake;
      setPendingTrade((prev) =>
        prev
          ? {
              ...prev,
              status: "settled",
              result: won ? "win" : "loss",
              pnl,
            }
          : null,
      );
      setSettleNote(won ? `WIN +$${(useStake * winProfitRate).toFixed(2)}` : `LOSS -$${useStake}`);
      logDebugEvent("info", "binary.trade", "Binary trade settled", {
        tradeId: trade.id,
        won,
        finalDigit,
        exitPrice: settlementPrice,
      });
    } catch (e) {
      logDebugEvent("error", "binary.trade", "Binary trade settlement failed", serializeError(e));
      throw e;
    } finally {
      setPlacing(false);
    }
    activeDirectionRef.current = null;
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["trades"] });

    if (won) {
      const profit = useStake * winProfitRate;
      sessionPnLRef.current += profit;
      toast.success(`WIN +$${profit.toFixed(2)} · session $${sessionPnLRef.current.toFixed(2)}`);
    } else {
      sessionPnLRef.current -= useStake;
      toast.error(`LOSS -$${useStake} · session $${sessionPnLRef.current.toFixed(2)}`);
    }
    return won;
  }

  async function fireManual(direction: string) {
    if (botRunningRef.current) return;
    try {
      await placeAndSettle(direction, stake);
    } catch {
      // The trade function already shows the failure toast.
    }
  }

  function autoDirection() {
    const ty = typeRef.current;
    const activeMarket = VOL_INDICES.find((m) => m.value === indexRef.current) ?? VOL_INDICES[1];
    const lastDigits = digitHistoryRef.current.slice(-24);
    const even = lastDigits.filter((d) => d % 2 === 0).length;
    const avg = lastDigits.length ? lastDigits.reduce((sum, d) => sum + d, 0) / lastDigits.length : 4.5;
    const current = priceRef.current;
    if (ty === "Buy/Sell") return current >= activeMarket.basePrice ? "SELL" : "BUY";
    if (ty === "Even/Odd") return even > lastDigits.length / 2 ? "ODD" : "EVEN";
    if (ty === "Over/Under") return avg >= selectedDigitRef.current ? "UNDER" : "OVER";
    return avg >= selectedDigitRef.current ? "DIFFER" : "MATCH";
  }

  async function startBot(direction: string) {
    if (botRunningRef.current) return;
    logDebugEvent("info", "binary.bot", "Binary bot started", {
      direction,
      stake,
      target,
      stop,
      martingale,
      type,
      market: indexRef.current,
    });
    botRunningRef.current = true;
    setBotRunning(true);
    sessionPnLRef.current = 0;
    currentStakeRef.current = stake;
    toast.success(`Bot started — ${direction} · target $${target} · stop -$${stop}`);
    while (botRunningRef.current) {
      try {
        const nextDirection = direction === "AUTO" ? autoDirection() : direction;
        const won = await placeAndSettle(nextDirection, currentStakeRef.current);
        if (won) {
          currentStakeRef.current = stake; // reset on win
        } else {
          currentStakeRef.current = +(currentStakeRef.current * martingale).toFixed(2);
        }
        if (sessionPnLRef.current >= target) {
          toast.success(`Target hit +$${sessionPnLRef.current.toFixed(2)}`);
          break;
        }
        if (sessionPnLRef.current <= -stop) {
          toast.error(`Stop hit -$${(-sessionPnLRef.current).toFixed(2)}`);
          break;
        }
        await new Promise((r) => setTimeout(r, 800));
      } catch (e) {
        logDebugEvent(
          "error",
          "binary.bot",
          "Binary bot stopped after trade error",
          serializeError(e),
        );
        break;
      }
    }
    botRunningRef.current = false;
    setBotRunning(false);
  }

  function stopBot() {
    logDebugEvent("info", "binary.bot", "Binary bot stop requested", {
      sessionPnL: sessionPnLRef.current,
    });
    botRunningRef.current = false;
    setBotRunning(false);
    toast("Bot stopped");
  }

  const actions = {
    "Buy/Sell": [
      ["BUY", "bull"],
      ["SELL", "bear"],
    ],
    "Even/Odd": [
      ["EVEN", "bull"],
      ["ODD", "bear"],
    ],
    "Matches/Differs": [
      ["MATCH", "bull"],
      ["DIFFER", "bear"],
    ],
    "Over/Under": [
      ["OVER", "bull"],
      ["UNDER", "bear"],
    ],
  }[type] as [string, "bull" | "bear"][];

  // For chart badge tone
  const activeDir = activeDirectionRef.current;
  let badgeTone: "neutral" | "bull" | "bear" = "neutral";
  if (activeDir && type !== "Buy/Sell") {
    let winning = false;
    if (type === "Even/Odd")
      winning = activeDir === "EVEN" ? currentDigit % 2 === 0 : currentDigit % 2 === 1;
    else if (type === "Over/Under")
      winning = activeDir === "OVER" ? currentDigit > selectedDigit : currentDigit < selectedDigit;
    else
      winning =
        activeDir === "MATCH" ? currentDigit === selectedDigit : currentDigit !== selectedDigit;
    badgeTone = winning ? "bull" : "bear";
  }

  return (
    <div className="space-y-3">
      <div className="lg:grid lg:grid-cols-12 lg:gap-4">
        {/* Left / Main column: chart + chart controls */}
        <div className="lg:col-span-9 space-y-3">
          {/* Trade type tabs */}
          <div className="grid grid-cols-4 gap-1">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  "py-1.5 px-1 rounded-lg text-[10px] font-bold border transition " +
                  (type === t
                    ? "bg-primary/20 border-primary text-primary glow-primary"
                    : "bg-surface border-border text-muted-foreground")
                }
              >
                {t === "Matches/Differs" ? "Match/Diff" : t}
              </button>
            ))}
          </div>

          {/* Index header moved into chart overlay on desktop; keep toggle for mobile */}
          <div className="lg:hidden relative">
            <button
              onClick={() => setMarketOpen(!marketOpen)}
              className="w-full bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 text-left min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/20 text-primary grid place-items-center font-extrabold text-xs shrink-0">
                  V
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{market.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {market.volatilityLabel} · {market.tickSpeedLabel}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold tabular-nums">{price.toFixed(5)}</div>
                <div className="text-xs text-muted-foreground">
                  last digit <span className="text-primary font-bold tabular-nums">{currentDigit}</span>{" "}
                  <span className="live-dot ml-1" />
                </div>
              </div>
              <ChevronDown
                className={
                  "h-4 w-4 text-muted-foreground shrink-0 transition " +
                  (marketOpen ? "rotate-180" : "")
                }
              />
            </button>

            {marketOpen && (
              <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-xl divide-y divide-border max-h-72 overflow-auto shadow-xl">
                {VOL_INDICES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => {
                      setIndex(m.value);
                      setMarketOpen(false);
                    }}
                    className="w-full text-left p-2.5 hover:bg-accent flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-semibold truncate">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {m.volatilityLabel} · {m.tickSpeedLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chart mode + controls */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setChartMode("line")}
              className={
                "py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 " +
                (chartMode === "line"
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-card border-border text-muted-foreground")
              }
            >
              <LineChart className="h-3.5 w-3.5" /> Line
            </button>
            <button
              onClick={() => setChartMode("candles")}
              className={
                "py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 " +
                (chartMode === "candles"
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-card border-border text-muted-foreground")
              }
            >
              <CandlestickChart className="h-3.5 w-3.5" /> Candles
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold">
                  Chart controls
                </div>
                <div className="text-sm font-semibold">Indicators & tick progression</div>
              </div>
              <button
                type="button"
                onClick={() => setChartOptionsOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground"
              >
                <span>{chartOptionsOpen ? "Hide" : "Show"} options</span>
                <ChevronDown className={"h-4 w-4 transition " + (chartOptionsOpen ? "rotate-180" : "")} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border bg-surface px-2 py-1">Indicators: {selectedIndicators.length}</span>
              <span className="rounded-full border border-border bg-surface px-2 py-1">Progression: {settlementTicks} tick{settlementTicks === 1 ? "" : "s"}</span>
              {showDigitPicker && (
                <span className="rounded-full border border-border bg-surface px-2 py-1">Selected digit: {selectedDigit}</span>
              )}
            </div>
            {chartOptionsOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold mb-2">
                    Chart indicators
                  </div>
                  <div className="grid grid-cols-3 gap-2">
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
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold mb-2">
                    Tick progression
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: 5 }, (_, i) => i + 1).map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setTickProgression(count)}
                        className={
                          "rounded-xl py-2 text-xs font-bold transition " +
                          (tickProgression === count
                            ? "bg-primary text-primary-foreground border border-primary"
                            : "bg-card border border-border text-muted-foreground")
                        }
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
                {showDigitPicker && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold mb-2">
                      Select digit
                    </div>
                    <div className="grid grid-cols-10 gap-1">
                      {Array.from({ length: 10 }).map((_, d) => (
                        <button
                          key={d}
                          onClick={() => setSelectedDigit(d)}
                          className={
                            "h-9 rounded-full font-bold text-sm border-2 " +
                            (selectedDigit === d
                              ? "bg-primary text-primary-foreground border-primary glow-primary"
                              : "bg-surface border-border")
                          }
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chart container */}
          <div className="bg-card border border-border rounded-xl p-2 relative lg:min-h-[60vh] lg:h-[calc(100vh-6rem)] overflow-hidden">
            {/* Chart overlays: market header (desktop) */}
            <div className="hidden lg:block absolute left-4 top-4 z-30 w-[320px]">
              <button
                onClick={() => setMarketOpen(!marketOpen)}
                className="w-full bg-card/90 border border-border rounded-xl p-3 flex items-center justify-between gap-3 backdrop-blur"
              >
                <div className="flex items-center gap-2 text-left min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/20 text-primary grid place-items-center font-extrabold text-xs shrink-0">V</div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{market.label}</div>
                    <div className="text-[10px] text-muted-foreground">{market.volatilityLabel} · {market.tickSpeedLabel}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold tabular-nums">{price.toFixed(5)}</div>
                  <div className="text-xs text-muted-foreground">last digit <span className="text-primary font-bold tabular-nums">{currentDigit}</span> <span className="live-dot ml-1" /></div>
                </div>
                <ChevronDown className={"h-4 w-4 text-muted-foreground shrink-0 transition " + (marketOpen ? "rotate-180" : "")} />
              </button>

              {marketOpen && (
                <div className="mt-1 w-full bg-card border border-border rounded-xl divide-y divide-border max-h-72 overflow-auto shadow-xl">
                  {VOL_INDICES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setIndex(m.value);
                        setMarketOpen(false);
                      }}
                      className="w-full text-left p-2.5 hover:bg-accent flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-semibold truncate">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{m.volatilityLabel} · {m.tickSpeedLabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Ticks / progression overlay (desktop) */}
            <div className="hidden lg:block absolute right-6 top-20 z-30 w-56">
              <div className="bg-card/90 border border-border rounded-xl p-3 backdrop-blur">
                <div className="text-[10px] uppercase text-muted-foreground font-bold mb-2">Ticks</div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <div className="text-xs text-muted-foreground">{settlementTicks} tick{settlementTicks === 1 ? '' : 's'}</div>
                  <div className="text-xs text-muted-foreground">{market.tickSpeedLabel}</div>
                </div>
                <div className="w-full bg-surface rounded-xl h-2 relative">
                  <div className="absolute left-0 top-0 bottom-0 flex items-center justify-between px-1">
                    {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => setTickProgression(n)}
                        className={
                          "h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold transition " +
                          (tickProgression === n
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border text-muted-foreground")
                        }
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <LiveChart
              basePrice={market.basePrice}
              volatility={chartVolatility}
              tickMs={chartTickMs}
              candleMs={chartCandleMs}
              onPrice={setPrice}
              badge={`${currentDigit}`}
              badgeTone={badgeTone}
              note={chartNote ?? undefined}
              noteTone={chartNote ? chartNoteTone : "neutral"}
              indicators={selectedIndicators}
              mode={chartMode}
              className="h-full"
              digitStats={digitStats}
              currentDigit={currentDigit}
            />
          </div>

          {/* Tick trail */}
          <div className="bg-card border border-border rounded-xl px-2 py-2 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider shrink-0 mr-1">
              Ticks
            </span>
            {tickTrail.length === 0 && <span className="text-xs text-muted-foreground">waiting…</span>}
            {tickTrail.map((t, i) => {
              const highlightCount = tickProgression + 1;
              const isRecent = i >= tickTrail.length - highlightCount;
              return (
                <span
                  key={i}
                  className={
                    "shrink-0 h-7 w-7 grid place-items-center rounded-full text-xs font-extrabold tabular-nums border transition-all " +
                    (isRecent ? "scale-110 shadow-lg" : "") +
                    (t.tone === "bull"
                      ? " bg-bull text-bull-foreground border-bull glow-bull"
                      : t.tone === "bear"
                        ? " bg-bear text-bear-foreground border-bear glow-bear"
                        : " bg-surface border-border text-muted-foreground")
                  }
                >
                  {t.d}
                </span>
              );
            })}
          </div>

          {/* Digit stats */}
          {showDigitStats && (
            <div className="bg-card border border-border rounded-xl p-3 space-y-3">
              <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
                Last 100 digits
              </div>
              <div className="grid grid-cols-10 gap-1">
                {digitStats.map(({ d, pct }) => {
                  const isMax = pct === maxPct;
                  const isMin = pct === minPct;
                  const isCurrent = d === currentDigit;
                  return (
                    <div key={d} className="flex flex-col items-center gap-1">
                      <div
                        className={
                          "h-9 w-9 rounded-full grid place-items-center text-sm font-extrabold border-2 transition-all " +
                          (isCurrent ? "ring-2 ring-primary digit-pop " : "") +
                          (isMax
                            ? "bg-bull/20 border-bull text-bull"
                            : isMin
                              ? "bg-bear/15 border-bear/60 text-bear"
                              : "bg-surface border-border text-foreground")
                        }
                      >
                        {d}
                      </div>
                      <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              {type === "Even/Odd" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-bull/10 border border-bull/30 p-2 text-center">
                    <div className="text-[10px] uppercase text-bull font-bold">Even</div>
                    <div className="text-lg font-extrabold tabular-nums">
                      {digitStats
                        .filter((s) => s.d % 2 === 0)
                        .reduce((sum, s) => sum + s.pct, 0)
                        .toFixed(1)}
                      %
                    </div>
                  </div>
                  <div className="rounded-lg bg-bear/10 border border-bear/30 p-2 text-center">
                    <div className="text-[10px] uppercase text-bear font-bold">Odd</div>
                    <div className="text-lg font-extrabold tabular-nums">
                      {digitStats
                        .filter((s) => s.d % 2 === 1)
                        .reduce((sum, s) => sum + s.pct, 0)
                        .toFixed(1)}
                      %
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: trade controls, stake, bot, actions */}
        <div className="lg:col-span-3 space-y-3 lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)] lg:overflow-auto lg:flex lg:flex-col lg:justify-between">
          {(placing || pendingTrade?.status === "open" || settleNote) && (
            <div className="bg-card border border-border rounded-xl p-3 text-sm space-y-1 text-foreground">
              {placing && <div className="text-muted-foreground">Placing trade… please wait.</div>}
              {pendingTrade?.status === "open" && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-primary font-semibold">
                  Contract placed: {pendingTrade.direction} {pendingTrade.type} ${pendingTrade.stake} — waiting for result.
                </div>
              )}
              {pendingTrade?.status === "settled" && settleNote && (
                <div className={
                  "rounded-xl px-3 py-2 font-semibold " +
                  (pendingTrade.result === "win"
                    ? "bg-bull/10 text-bull border border-bull/30"
                    : "bg-bear/10 text-bear border border-bear/30")
                }>
                  {settleNote} · settled on digit {currentDigit}
                </div>
              )}
            </div>
          )}

          {/* Mode */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setBotMode(false)}
              disabled={botRunning}
              className={
                "py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 " +
                (!botMode
                  ? "bg-primary text-primary-foreground glow-primary"
                  : "bg-card border border-border text-muted-foreground")
              }
            >
              <User className="h-4 w-4" /> Manual
            </button>
            <button
              onClick={() => setBotMode(true)}
              disabled={botRunning}
              className={
                "py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 " +
                (botMode
                  ? "bg-primary text-primary-foreground glow-primary"
                  : "bg-card border border-border text-muted-foreground")
              }
            >
              <Bot className="h-4 w-4" /> Bot
            </button>
          </div>

          {/* Stake */}
          {/* Last Digit Prediction (move into right column) */}
          {showDigitPicker && (
            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
              <div className="text-[10px] uppercase text-muted-foreground font-bold text-center">Last Digit Prediction</div>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }).map((_, d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDigit(d)}
                    className={
                      "h-9 rounded-lg font-bold text-sm border-2 " +
                      (selectedDigit === d
                        ? "bg-primary text-primary-foreground border-primary glow-primary"
                        : "bg-surface border-border text-muted-foreground")
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStake(Math.max(1, stake - 1))}
              className="h-12 w-12 rounded-xl bg-surface border border-border grid place-items-center"
            >
              <Minus />
            </button>
            <div className="flex-1 bg-card border-2 border-primary rounded-xl py-2 text-center">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Stake $</div>
              <div className="text-2xl font-extrabold tabular-nums">{stake}</div>
            </div>
            <button
              onClick={() => setStake(stake + 1)}
              className="h-12 w-12 rounded-xl bg-surface border border-border grid place-items-center"
            >
              <Plus />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => setStake(q)}
                className={
                  "py-1.5 rounded-lg border text-xs font-bold " +
                  (stake === q
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground")
                }
              >
                ${q}
              </button>
            ))}
          </div>

          {botMode && (
            <div className="space-y-2">
              <BotField label="Target" prefix="$" value={target} onChange={setTarget} accent="text-bull" />
              <BotField label="Stop" prefix="$" value={stop} onChange={setStop} accent="text-bear" />
              <BotField label="Mult" prefix="x" value={martingale} onChange={setMartingale} accent="text-primary" />
            </div>
          )}

          {/* Action buttons - keep at bottom on desktop */}
          <div className="pt-1">
            {/* Payout blocks */}
            <div className="space-y-2">
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Payout</div>
                <div className="mt-2 text-sm font-semibold">{payoutOver.toFixed(2)} AUD</div>
                <div className="mt-2 text-xs text-muted-foreground">Over · {overRate.toFixed(2)}%</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Payout</div>
                <div className="mt-2 text-sm font-semibold">{payoutUnder.toFixed(2)} AUD</div>
                <div className="mt-2 text-xs text-muted-foreground">Under · {underRate.toFixed(2)}%</div>
              </div>
            </div>
            {botRunning ? (
              <button
                onClick={stopBot}
                className="w-full py-4 rounded-2xl bg-bear text-bear-foreground font-extrabold text-lg glow-bear flex items-center justify-center gap-2"
              >
                <Square className="h-5 w-5" /> STOP BOT · session ${sessionPnLRef.current.toFixed(2)}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {botMode && (
                  <button
                    onClick={() => startBot("AUTO")}
                    className="col-span-2 py-4 rounded-2xl bg-primary text-primary-foreground font-extrabold text-lg glow-primary"
                  >
                    AUTO TRADE
                  </button>
                )}
                {actions.map(([label, tone]) => (
                  <button
                    key={label}
                    onClick={() => (botMode ? startBot(label) : fireManual(label))}
                    className={
                      "py-4 rounded-2xl font-extrabold text-lg tracking-wide " +
                      (tone === "bull"
                        ? "bg-bull text-bull-foreground glow-bull"
                        : "bg-bear text-bear-foreground glow-bear")
                    }
                  >
                    {botMode ? `BOT ${label}` : label} {tone === "bull" ? "↑" : "↓"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function BotField({
  label,
  prefix,
  value,
  onChange,
  accent,
}: {
  label: string;
  prefix: string;
  value: number;
  onChange: (n: number) => void;
  accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-2">
      <div className={"text-[10px] uppercase font-bold tracking-wider mb-1 " + accent}>{label}</div>
      <div className="flex items-center gap-1">
        <span className={"text-sm font-bold " + accent}>{prefix}</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent text-center font-bold text-lg outline-none tabular-nums"
        />
      </div>
    </div>
  );
}
