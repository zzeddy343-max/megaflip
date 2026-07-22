import { useEffect, useRef, useState } from "react";
import { LiveChart } from "@/components/LiveChart";
import {
  BarChart3,
  Bot,
  CandlestickChart,
  ChevronDown,
  Crosshair,
  Download,
  LineChart,
  Minus,
  MousePointer2,
  Plus,
  Square,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade, settleTrade, cancelTrade, releaseStaleBinaryTrades, getMyProfile } from "@/lib/trades.functions";
import releaseStaleWithBackoff from '@/lib/trades.client';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";
import { getProfitRateForContract, getTickLabel, normalizeTickCount, resolveContractOutcome } from "@/lib/binary-simulation";
import { supabase } from "@/integrations/supabase/client";

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
const MULTIPLIER_OPTIONS = [1, 1.5, 2, 2.5, 3, 4, 5, 10];
const MAX_BINARY_OPEN_MS = 60_000;
const TRADE_REQUEST_TIMEOUT_MS = 20_000;

type Tick = { d: number; tone: "neutral" | "bull" | "bear" };

export function BinaryPanel() {
  const [index, setIndex] = useState("Vol 10 (1s)");
  const [type, setType] = useState<TradeType>("Even/Odd");
  const [marketOpen, setMarketOpen] = useState(false);
  const [chartMode, setChartMode] = useState<"line" | "candles">("candles");
  const [stake, setStake] = useState(10);
  const [selectedDigit, setSelectedDigit] = useState(5);
  const [tickProgression, setTickProgression] = useState(1);
  const [selectedIndicators, setSelectedIndicators] = useState<IndicatorOption[]>([]);
  const [chartOptionsOpen, setChartOptionsOpen] = useState(false);
  const [botMode, setBotMode] = useState(true);
  const [botRunning, setBotRunning] = useState(false);
  const [target, setTarget] = useState(200);
  const [stop, setStop] = useState(999);
  const [martingale, setMartingale] = useState(2);
  const [price, setPrice] = useState(1000);
  const [pendingTrade, setPendingTrade] = useState<{
    tradeId: string;
    direction: string;
    stake: number;
    type: TradeType;
    market: string;
    entryPrice: number;
    openedAt: number;
    status: "open" | "settled";
    result?: "win" | "loss";
    pnl?: number;
  } | null>(null);
  const [tradeIntent, setTradeIntent] = useState<{ direction: string; mode: "manual" | "bot" | "scanner" } | null>(null);
  const [settleNote, setSettleNote] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [tickTrail, setTickTrail] = useState<Tick[]>([]);
  const [digitHistory, setDigitHistory] = useState<number[]>([]);
  const [positionsTab, setPositionsTab] = useState<"open" | "closed" | "tx">("open");

  const place = useServerFn(placeTrade);
  const settle = useServerFn(settleTrade);
  const cancel = useServerFn(cancelTrade);
  const releaseStale = useServerFn(releaseStaleBinaryTrades);
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
  const pendingTradeRef = useRef<typeof pendingTrade>(null);
  const placingRef = useRef(false);
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
  useEffect(() => {
    pendingTradeRef.current = pendingTrade;
  }, [pendingTrade]);
  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);
  const market = VOL_INDICES.find((m) => m.value === index) ?? VOL_INDICES[1];

  type PositionTrade = {
    id: string;
    module: string;
    market: string;
    direction: string;
    stake: number;
    entry_price: number | null;
    exit_price: number | null;
    payout: number | null;
    status: string;
    meta: Record<string, unknown> | null;
    created_at: string;
  };

  const { data: positionTrades = [] } = useQuery({
    queryKey: ["binary-positions"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data } = await supabase
        .from("trades")
        .select("id,module,market,direction,stake,entry_price,exit_price,payout,status,meta,created_at")
        .eq("user_id", auth.user.id)
        .eq("module", "binary")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as PositionTrade[];
    },
    refetchInterval: 2500,
  });

  const openPositionTrades = positionTrades.filter((trade) => trade.status === "open" && isLiveOpenTrade(trade));
  const closedPositionTrades = positionTrades.filter((trade) => isClosedTradeStatus(trade.status));
  const visiblePositionTrades = positionsTab === "open"
    ? openPositionTrades
    : positionsTab === "closed"
      ? closedPositionTrades
      : positionTrades;
  const displayedPositionTrades = positionsTab === "open"
    ? visiblePositionTrades.slice(0, 1)
    : visiblePositionTrades.slice(0, 40);

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
    const raw = window.sessionStorage.getItem("megaflip-scanner-bot");
    if (!raw) return;
    autoSignalConsumedRef.current = true;
    window.sessionStorage.removeItem("megaflip-scanner-bot");
    try {
      const signal = JSON.parse(raw) as { category?: TradeType; market?: string; direction?: string; digit?: number };
      if (signal.category && TYPES.includes(signal.category)) {
        typeRef.current = signal.category;
        setType(signal.category);
      }
      if (signal.direction && signal.direction.length > 0) {
        activeDirectionRef.current = signal.direction;
      }
      if (signal.digit !== undefined && signal.digit !== null) {
        selectedDigitRef.current = signal.digit;
        setSelectedDigit(signal.digit);
      }
      if (signal.market && VOL_INDICES.some((m) => m.value === signal.market)) {
        indexRef.current = signal.market;
        setIndex(signal.market);
      }
      setBotMode(true);
      toast.success("Scanner bot loaded and auto trade started");
      const initialDirection = signal.direction && signal.direction.length > 0 ? signal.direction : "AUTO";
      window.setTimeout(() => startBot(initialDirection, "scanner"), 450);
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
  const overRate = getProfitRateForContract(type, "OVER", settlementTicks);
  const underRate = getProfitRateForContract(type, "UNDER", settlementTicks);
  const payoutOver = (stake * (1 + overRate)) || 0;
  const payoutUnder = (stake * (1 + underRate)) || 0;
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
  const digitMarkerTone =
    pendingTrade?.status === "open"
      ? "active"
      : pendingTrade?.status === "settled"
        ? pendingTrade.result === "win"
          ? "win"
          : "loss"
        : "idle";
  useEffect(() => {
    if (pendingTrade?.status !== "settled") return;
    const timeout = window.setTimeout(() => {
      setPendingTrade(null);
      setSettleNote(null);
      setTradeIntent(null);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [pendingTrade?.status]);

  useEffect(() => {
    if (pendingTrade?.status !== "open") return;
    const remaining = Math.max(0, MAX_BINARY_OPEN_MS - (Date.now() - pendingTrade.openedAt));
    const timeout = window.setTimeout(async () => {
      const openTrade = pendingTradeRef.current;
      if (!openTrade || openTrade.status !== "open") return;
      try {
        await cancel({ data: { trade_id: openTrade.tradeId } });
        toast.error("Binary trade timed out after 1 minute - stake returned");
        setSettleNote("Timed out - stake returned");
        setPendingTrade(null);
        qc.invalidateQueries({ queryKey: ["profile"] });
        qc.invalidateQueries({ queryKey: ["binary-positions"] });
      } catch (error) {
        logDebugEvent("error", "binary.trade", "Timed-out binary trade cancellation failed", serializeError(error));
        toast.error("Trade passed 1 minute but could not be released automatically");
      } finally {
        setPlacing(false);
        placingRef.current = false;
        activeDirectionRef.current = null;
        setTradeIntent(null);
      }
    }, remaining);
    return () => clearTimeout(timeout);
  }, [cancel, pendingTrade?.openedAt, pendingTrade?.status, qc]);

  useEffect(() => {
    const staleOpen = positionTrades.find(
      (trade) =>
        trade.status === "open" &&
        Date.now() - new Date(trade.created_at).getTime() > MAX_BINARY_OPEN_MS,
    );
    if (!staleOpen) return;
    let cancelled = false;
    (async () => {
      try {
        await cancel({ data: { trade_id: staleOpen.id } });
        if (cancelled) return;
        toast.error("Released a binary trade that was open for over 1 minute");
        qc.invalidateQueries({ queryKey: ["profile"] });
        qc.invalidateQueries({ queryKey: ["binary-positions"] });
      } catch (error) {
        logDebugEvent("error", "binary.trade", "Stale open binary trade release failed", serializeError(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cancel, positionTrades, qc]);

  useEffect(() => {
    let stopped = false;
    async function sweepStaleBinaryTrades(showToast = false) {
      try {
        const result = await releaseStaleWithBackoff(releaseStale);
        const released = Number(result?.released ?? 0);
        if (stopped || released <= 0) return;
        if (showToast) toast.error(`Released ${released} binary trade${released === 1 ? "" : "s"} open past 1 minute`);
        qc.invalidateQueries({ queryKey: ["profile"] });
        qc.invalidateQueries({ queryKey: ["binary-positions"] });
      } catch (error) {
        logDebugEvent("error", "binary.trade", "Stale binary sweep failed after retries", serializeError(error));
      }
    }

    sweepStaleBinaryTrades(true);
    const interval = window.setInterval(() => sweepStaleBinaryTrades(false), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [qc, releaseStale]);

  async function placeAndSettle(direction: string, useStake: number, mode: "manual" | "bot" | "scanner" = "manual"): Promise<boolean> {
    if (placingRef.current || pendingTradeRef.current?.status === "open") {
      toast("Wait for the open contract to settle first");
      throw new Error("An existing binary contract is still open");
    }
    const ty = typeRef.current;
    const sel = selectedDigitRef.current;
    const entryPrice = priceRef.current;
    const neededTicks = settlementTicks;
    const maxOpenMs = getBinaryMaxOpenMs(neededTicks, chartTickMs);
    activeDirectionRef.current = direction;
    setTradeIntent({ direction, mode });
    toast.info(`${mode === "manual" ? "Manual" : mode === "scanner" ? "Scanner" : "Bot"} ${direction} sent`);
    let trade;
    let tradeId: string | undefined;
    logDebugEvent("info", "binary.trade", "Placing binary trade", {
      market: indexRef.current,
      type: ty,
      direction,
      stake: useStake,
      selectedDigit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
      price: priceRef.current,
    });
    setPlacing(true);
    placingRef.current = true;
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
            mode,
            max_open_ms: maxOpenMs,
            settlement_ticks: neededTicks,
            tick_ms: chartTickMs,
            digit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
          },
        },
      });
      const placedTrade = normalizePlacedTrade(trade);
      const id = placedTrade?.id;
      if (!id) throw new Error("Trade was placed but no trade id was returned");
      setPendingTrade({
        tradeId: id,
        direction,
        stake: useStake,
        type: ty,
        market: indexRef.current,
        entryPrice: priceRef.current,
        openedAt: Date.now(),
        status: "open",
      });
      toast.success("Contract placed and open — waiting for result");
      logDebugEvent("info", "binary.trade", "Binary trade placed", {
        tradeId: id,
        direction,
        stake: useStake,
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["binary-positions"] });
    } catch (e) {
      logDebugEvent("error", "binary.trade", "Binary trade placement failed", serializeError(e));
      toast.error(e instanceof Error ? e.message : "Failed");
      activeDirectionRef.current = null;
      setPendingTrade(null);
      setPlacing(false);
      placingRef.current = false;
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
          trade_id: id,
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
        tradeId: id,
        won,
        finalDigit,
        exitPrice: settlementPrice,
      });
    } catch (e) {
      logDebugEvent("error", "binary.trade", "Binary trade settlement failed", serializeError(e));
      toast.error("Contract result could not be saved. Trade stopped.");
      setSettleNote("Settlement failed");
      throw e;
    } finally {
      setPlacing(false);
      placingRef.current = false;
      activeDirectionRef.current = null;
    }
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
    if (botRunningRef.current || placingRef.current || pendingTradeRef.current?.status === "open") {
      toast("Wait for the open contract to settle first");
      return;
    }
    try {
      await placeAndSettle(direction, stake, "manual");
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

  async function startBot(direction: string, mode: "bot" | "scanner" = "bot") {
    if (botRunningRef.current || placingRef.current || pendingTradeRef.current?.status === "open") {
      toast("Wait for the open contract to settle first");
      return;
    }
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
        const won = await placeAndSettle(nextDirection, currentStakeRef.current, mode);
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
    <div className="h-full min-h-0 w-full max-w-full overflow-hidden md:pb-0">
      <div className="hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary">
              T
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Binary</div>
              <div className="truncate text-sm font-semibold">{market.label}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
              {profile?.active_account === "demo" ? "Demo" : "Real"}
            </div>
            <button className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground">
              Deposit
            </button>
            <button className="rounded-full border border-border bg-surface p-2 text-sm text-muted-foreground">
              🔔
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-surface/80 px-3 py-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Balance</div>
            <div className="text-sm font-extrabold">$12,340.00</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Price</div>
            <div className="text-sm font-extrabold tabular-nums">{price.toFixed(5)}</div>
          </div>
        </div>
      </div>

      <div className="md:hidden h-full min-h-0 w-full max-w-full overflow-hidden px-2 py-1.5">
        <div className="flex h-full min-h-0 w-full max-w-full flex-col gap-1.5 overflow-y-auto overflow-x-hidden border-y border-border bg-background pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <div className="grid shrink-0 grid-cols-4 gap-1 text-xs text-muted-foreground uppercase tracking-[0.08em]">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  "min-w-0 truncate rounded-full px-1 py-1.5 text-[7.5px] font-semibold transition min-[390px]:text-[8px] sm:text-[9px] " +
                  (type === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground")
                }
              >
                {t === "Matches/Differs" ? "Match/Diff" : t}
              </button>
            ))}
          </div>

          <div className="hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Volatility</div>
                <div className="font-semibold">{market.value}</div>
                <div className="text-[10px] text-muted-foreground">{market.volatilityLabel} · {market.tickSpeedLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-extrabold tabular-nums">{price.toFixed(5)}</div>
                <div className="text-[10px] text-muted-foreground">last digit <span className="text-primary font-bold">{currentDigit}</span></div>
              </div>
            </div>
          </div>

          <div className="h-[clamp(15rem,42dvh,22rem)] shrink-0 rounded-2xl border border-border bg-card p-1.5">
            <div className="hidden">
              <button
                onClick={() => setChartMode("line")}
                className={
                  "py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 " +
                  (chartMode === "line"
                    ? "bg-primary/20 text-primary border-primary/50"
                    : "bg-surface border-border text-muted-foreground")
                }
              >
                <LineChart className="h-4 w-4" /> Line
              </button>
              <button
                onClick={() => setChartMode("candles")}
                className={
                  "py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 " +
                  (chartMode === "candles"
                    ? "bg-primary/20 text-primary border-primary/50"
                    : "bg-surface border-border text-muted-foreground")
                }
              >
                <CandlestickChart className="h-4 w-4" /> Candles
              </button>
            </div>
            <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-card/90 p-1">
              <button
                type="button"
                onClick={() => setMarketOpen((prev) => !prev)}
                className="absolute left-2 top-2 z-30 max-w-[11rem] rounded-xl border border-border bg-card/95 px-2.5 py-1.5 text-left backdrop-blur"
              >
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-xs font-extrabold">{market.value}</div>
                  <ChevronDown
                    className={
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground transition " +
                      (marketOpen ? "rotate-180" : "")
                    }
                  />
                </div>
                <div className="text-[10px] text-muted-foreground">{price.toFixed(2)}</div>
              </button>
              {marketOpen && (
                <div className="absolute left-2 top-[3.85rem] z-40 max-h-64 w-[min(18rem,calc(100%-1rem))] overflow-auto rounded-xl border border-border bg-card/98 shadow-2xl backdrop-blur">
                  {VOL_INDICES.map((m) => (
                    <button
                      type="button"
                      key={m.value}
                      onClick={() => {
                        setIndex(m.value);
                        setMarketOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-xs last:border-b-0 hover:bg-surface"
                    >
                      <span className="min-w-0 truncate font-semibold">{m.label}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{m.volatilityLabel}</span>
                    </button>
                  ))}
                </div>
              )}
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
                className="h-full min-h-0 w-full"
                digitStats={digitStats}
                currentDigit={currentDigit}
                selectedDigit={selectedDigit}
                digitMarkerTone={digitMarkerTone}
              />
            </div>
          </div>

          <div className="hidden">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold mb-3">Last digits</div>
            <div className="grid grid-cols-5 gap-2">
              {digitStats.map(({ d, pct }) => {
                const isCurrent = d === currentDigit;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDigit(d)}
                    className={
                      "flex flex-col items-center justify-center gap-1 rounded-3xl border p-2 transition " +
                      (isCurrent
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground")
                    }
                  >
                    <span className="h-11 w-11 rounded-full border border-border bg-surface grid place-items-center text-sm font-extrabold">
                      {d}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-border bg-surface p-1 overflow-x-auto">
            <div className="flex min-w-full items-center justify-between gap-1.5">
              {Array.from({ length: 10 }).map((_, d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDigit(d)}
                  className={
                    "h-8 min-w-8 rounded-full border text-xs font-bold transition " +
                    (d === currentDigit
                      ? "bg-primary text-primary-foreground border-primary shadow-[0_0_24px_color-mix(in_oklab,var(--gold)_42%,transparent)]"
                      : selectedDigit === d
                        ? "bg-primary/20 text-primary border-primary/60"
                        : "bg-card border-border text-muted-foreground")
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-border bg-surface p-1.5">
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              <button
                onClick={() => setBotMode(false)}
                className={
                  "rounded-2xl py-2 text-sm font-semibold transition " +
                  (!botMode
                    ? "bg-white text-background border border-primary"
                    : "bg-surface border border-border text-muted-foreground")
                }
              >
                Manual
              </button>
              <button
                onClick={() => setBotMode(true)}
                className={
                  "rounded-2xl py-2 text-sm font-semibold transition " +
                  (botMode
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground")
                }
              >
                Auto
              </button>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 items-center mb-1.5">
              <button
                onClick={() => setStake(Math.max(1, stake - 1))}
                className="h-9 w-9 rounded-xl bg-surface border border-border text-xl font-bold"
              >
                -
              </button>
              <div className="rounded-[22px] border border-primary bg-card/90 py-1.5 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">Stake</div>
                <div className="text-lg font-extrabold">{stake}</div>
              </div>
              <button
                onClick={() => setStake(stake + 1)}
                className="h-9 w-9 rounded-xl bg-surface border border-border text-xl font-bold"
              >
                +
              </button>
            </div>
            <button className="w-full rounded-2xl bg-primary text-primary-foreground py-2 text-sm font-semibold">
              AI Scanner
            </button>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-1.5 text-center text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
            <div className="rounded-2xl border border-border bg-surface p-1.5">
              <div>Take Profit</div>
              <div className="mt-1 font-bold text-foreground">${target}</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-1.5">
              <div>Stop Loss</div>
              <div className="mt-1 font-bold text-foreground">${stop}</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-1.5">
              <div>Multiplier</div>
              <div className="mt-1 font-bold text-foreground">x{martingale}</div>
            </div>
          </div>

            <div className="grid shrink-0 grid-cols-2 gap-2">
            <button
              onClick={() => (botMode ? startBot(actions[0][0]) : fireManual(actions[0][0]))}
              disabled={placing || botRunning || pendingTrade?.status === 'open'}
              className={
                "rounded-2xl py-2.5 text-sm font-extrabold " +
                (botMode ? "bg-bull text-bull-foreground" : "bg-bull text-bull-foreground") +
                (placing || pendingTrade?.status === 'open' ? " opacity-60 cursor-not-allowed" : "")
              }
            >
              {placing && !botMode ? <span className="inline-flex items-center gap-2"><span className="animate-pulse">⏳</span>Placing…</span> : botMode ? `BOT ${actions[0][0]}` : actions[0][0]}
            </button>
            <button
              onClick={() => (botMode ? startBot(actions[1][0]) : fireManual(actions[1][0]))}
              disabled={placing || botRunning || pendingTrade?.status === 'open'}
              className={
                "rounded-2xl py-2.5 text-sm font-extrabold " +
                (botMode ? "bg-bear text-bear-foreground" : "bg-bear text-bear-foreground") +
                (placing || pendingTrade?.status === 'open' ? " opacity-60 cursor-not-allowed" : "")
              }
            >
              {placing && !botMode ? <span className="inline-flex items-center gap-2"><span className="animate-pulse">⏳</span>Placing…</span> : botMode ? `BOT ${actions[1][0]}` : actions[1][0]}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile stacks vertically; desktop uses 3-column grid */}
      <div className="hidden md:grid md:grid-cols-[338px_minmax(0,1fr)_320px] xl:grid-cols-[338px_minmax(0,1fr)_320px] md:h-[calc(100dvh-3.5rem)] md:overflow-hidden bg-[#111827]">
        {/* Left column - appears second on mobile (order-2), sticky on desktop */}
        <div className="space-y-3 w-full md:w-auto md:h-full md:overflow-auto order-2 md:order-3 border-l border-[#2A3447] bg-[#202939] p-3 text-[#D8DEE9]">
          {(placing || pendingTrade?.status === "open" || settleNote) && (
            <div className="bg-card border border-border rounded-xl p-3 text-sm space-y-1 text-foreground">
              {placing && <div className="text-muted-foreground">Placing trade… please wait.</div>}
              {tradeIntent && (
                <div className="rounded-xl border border-[#47D6D9]/30 bg-[#47D6D9]/10 px-3 py-2 font-semibold text-[#47D6D9]">
                  {tradeIntent.mode === "manual" ? "Manual" : tradeIntent.mode === "scanner" ? "Scanner" : "Bot"} {tradeIntent.direction} accepted.
                </div>
              )}
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

          <div className="rounded border border-[#2A3447] bg-[#151D2C] p-1 grid grid-cols-2 gap-1">
            <button
              onClick={() => setBotMode(false)}
              disabled={botRunning}
              className={
                "py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 " +
                (!botMode
                  ? "bg-[#253145] text-[#F4F7FB]"
                  : "text-[#7F8BA4]")
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
                  ? "bg-[#253145] text-[#F4F7FB]"
                  : "text-[#7F8BA4]")
              }
            >
              <Bot className="h-4 w-4" /> Bot
            </button>
          </div>

          <div className="rounded border border-[#2A3447] bg-[#151D2C] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#7F8BA4]">Bot status</div>
                <div className="text-sm font-semibold">{botMode ? (botRunning ? "Auto trading live" : "Ready to auto") : "Manual mode"}</div>
              </div>
              <div className={"rounded px-2.5 py-1 text-[10px] font-semibold " + (botRunning ? "bg-[#24505D] text-[#47D6D9]" : "bg-[#202939] text-[#7F8BA4]")}>
                {botRunning ? "LIVE" : "STANDBY"}
              </div>
            </div>
          </div>

          <button className="w-full rounded border border-[#2A3447] bg-[#151D2C] px-3 py-2.5 text-sm font-semibold text-[#47D6D9]">
            AI Scanner
          </button>

          {showDigitPicker && (
            <div className="bg-card border border-border rounded-xl p-2.5 space-y-2">
              <div className="text-[10px] uppercase text-muted-foreground font-bold text-center">Last Digit Prediction</div>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }).map((_, d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDigit(d)}
                    className={
                      "h-10 rounded-md font-semibold text-sm border " +
                      (selectedDigit === d
                        ? "bg-muted-foreground/10 text-foreground border-border-strong"
                        : "bg-white/0 border-border text-muted-foreground")
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
              className="h-12 w-12 rounded border border-[#2A3447] bg-[#151D2C] grid place-items-center"
            >
              <Minus />
            </button>
            <label className="flex-1 bg-[#151D2C] border border-[#47D6D9] rounded py-2 text-center">
              <div className="text-[10px] uppercase text-[#7F8BA4] tracking-wider">Stake $</div>
              <input
                type="number"
                min={1}
                step={1}
                value={stake}
                onChange={(event) => setStake(Math.max(1, Number(event.target.value) || 1))}
                className="w-full bg-transparent text-center text-2xl font-extrabold tabular-nums text-[#F4F7FB] outline-none"
              />
            </label>
            <button
              onClick={() => setStake(stake + 1)}
              className="h-12 w-12 rounded border border-[#2A3447] bg-[#151D2C] grid place-items-center"
            >
              <Plus />
            </button>
          </div>

          <div className="hidden md:grid grid-cols-3 gap-2">
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
            <div className="grid grid-cols-3 gap-2">
              <BotField label="Target" prefix="$" value={target} onChange={setTarget} accent="text-bull" />
              <BotField label="Stop" prefix="$" value={stop} onChange={setStop} accent="text-bear" />
              <MultiplierField value={martingale} onChange={setMartingale} />
            </div>
          )}

          <div className="hidden xl:grid grid-cols-2 gap-2">
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Payout</div>
              <div className="mt-2 text-sm font-semibold">{payoutOver.toFixed(2)} AUD</div>
              <div className="mt-2 text-xs text-muted-foreground">Over · {(overRate * 100).toFixed(2)}%</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Payout</div>
              <div className="mt-2 text-sm font-semibold">{payoutUnder.toFixed(2)} AUD</div>
              <div className="mt-2 text-xs text-muted-foreground">Under · {(underRate * 100).toFixed(2)}%</div>
            </div>
          </div>

          {type === "Over/Under" && (
            <div className="space-y-3">
              <button
                onClick={() => fireManual("OVER")}
                disabled={placing || botRunning || pendingTrade?.status === 'open'}
                className={"w-full py-4 rounded-2xl text-white font-extrabold text-lg flex items-center justify-between px-4 shadow-md transition-transform " +
                  (placing || pendingTrade?.status === 'open' ? "opacity-60 cursor-not-allowed bg-gradient-to-r from-teal-400 to-teal-600" : "bg-gradient-to-r from-teal-400 to-teal-600 hover:scale-[1.01]")}
              >
                <span className="flex items-center gap-3">Over</span>
                <span className="text-base font-mono">{placing ? '…' : ((1 + overRate) * 100).toFixed(2) + '%'}</span>
              </button>
              <button
                onClick={() => fireManual("UNDER")}
                disabled={placing || botRunning || pendingTrade?.status === 'open'}
                className={"w-full py-4 rounded-2xl text-white font-extrabold text-lg flex items-center justify-between px-4 shadow-md transition-transform " +
                  (placing || pendingTrade?.status === 'open' ? "opacity-60 cursor-not-allowed bg-gradient-to-r from-red-500 to-red-700" : "bg-gradient-to-r from-red-500 to-red-700 hover:scale-[1.01]")}
              >
                <span className="flex items-center gap-3">Under</span>
                <span className="text-base font-mono">{placing ? '…' : ((1 + underRate) * 100).toFixed(2) + '%'}</span>
              </button>
            </div>
          )}

          {botRunning ? (
            <button
              onClick={stopBot}
                  className="w-full py-3 rounded-2xl bg-bear text-bear-foreground font-extrabold text-base glow-bear flex items-center justify-center gap-2"
            >
              <Square className="h-5 w-5" /> STOP BOT · session ${sessionPnLRef.current.toFixed(2)}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {botMode && (
                <button
                  onClick={() => startBot("AUTO")}
                  className="col-span-2 py-3 rounded-2xl bg-primary text-primary-foreground font-extrabold text-base glow-primary"
                >
                  AUTO TRADE
                </button>
              )}
              {actions.map(([label, tone]) => (
                <button
                  key={label}
                  onClick={() => (botMode ? startBot(label) : fireManual(label))}
                  className={
                    "py-3 rounded-lg font-extrabold text-base tracking-wide " +
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

        {/* Center column: chart area and chart controls - appears first on mobile (order-1) */}
        <div className="w-full md:w-auto order-1 md:order-2 bg-[#111827] overflow-hidden flex min-h-0 flex-col">
          <div className="hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Market</div>
                <div className="text-sm font-semibold">{market.label}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold tabular-nums">{price.toFixed(5)}</div>
                <div className="text-[11px] text-muted-foreground">Last digit <span className="font-semibold text-primary">{currentDigit}</span></div>
              </div>
            </div>
          </div>

          <div className="hidden lg:grid grid-cols-4 border-b border-[#202A3B] bg-[#111827] text-sm font-semibold">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  "h-10 border-r border-[#202A3B] text-xs transition last:border-r-0 " +
                  (type === t
                    ? "bg-[#151D2C] text-[#47D6D9] shadow-[inset_0_-1px_0_#47D6D9]"
                    : "text-[#7F8BA4] hover:text-[#D8DEE9]")
                }
              >
                {t === "Matches/Differs" ? "Match/Diff" : t}
              </button>
            ))}
          </div>

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

          <div className="hidden lg:flex items-center justify-between gap-2 border-b border-[#202A3B] bg-[#111827] px-3 py-2">
            <div className="flex items-center gap-1">
            <button
              onClick={() => setChartMode("line")}
              className={
                "h-8 rounded border px-3 text-xs font-bold flex items-center justify-center gap-2 " +
                (chartMode === "line"
                  ? "bg-[#223048] text-[#47D6D9] border-[#3A4A66]"
                  : "bg-[#151D2C] border-[#2A3447] text-[#8E9AB0]")
              }
            >
              <LineChart className="h-3.5 w-3.5" /> Line
            </button>
            <button
              onClick={() => setChartMode("candles")}
              className={
                "h-8 rounded border px-3 text-xs font-bold flex items-center justify-center gap-2 " +
                (chartMode === "candles"
                  ? "bg-[#223048] text-[#47D6D9] border-[#3A4A66]"
                  : "bg-[#151D2C] border-[#2A3447] text-[#8E9AB0]")
              }
            >
              <CandlestickChart className="h-3.5 w-3.5" /> Candles
            </button>
            </div>
            <button
              type="button"
              onClick={() => setChartOptionsOpen((prev) => !prev)}
              className="inline-flex h-8 items-center gap-2 rounded border border-[#2A3447] bg-[#151D2C] px-3 text-xs font-semibold text-[#D8DEE9]"
            >
              <span>Indicators {selectedIndicators.length}</span>
              <ChevronDown className={"h-4 w-4 transition " + (chartOptionsOpen ? "rotate-180" : "")} />
            </button>
          </div>

          <div className={(chartOptionsOpen ? "mb-2 hidden lg:block" : "hidden")}>
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

          <div className="w-full flex-1 min-h-0 bg-[#111827] relative overflow-hidden">
            <div className="absolute left-2 top-2 z-30 hidden w-12 flex-col overflow-hidden rounded-lg border border-[#2A3447] bg-[#202939] lg:flex">
              {[
                { icon: "1T", active: true },
                { icon: <TrendingUp className="h-4 w-4" /> },
                { icon: <BarChart3 className="h-4 w-4" /> },
                { icon: <MousePointer2 className="h-4 w-4" /> },
                { icon: <Download className="h-4 w-4" /> },
              ].map((tool, itemIndex) => (
                <button
                  key={itemIndex}
                  type="button"
                  className={
                    "grid h-10 place-items-center border-b border-[#2A3447] text-sm font-bold last:border-b-0 " +
                    (tool.active ? "bg-[#25364B] text-[#47D6D9]" : "text-[#9AA6BB] hover:bg-[#253145] hover:text-[#D8DEE9]")
                  }
                >
                  {tool.icon}
                </button>
              ))}
            </div>

            <div className="absolute bottom-24 left-3 z-30 hidden flex-col overflow-hidden rounded border border-[#2A3447] bg-[#202939] lg:flex">
              {[<Plus className="h-4 w-4" />, <Crosshair className="h-4 w-4" />, <Minus className="h-4 w-4" />].map((icon, itemIndex) => (
                <button
                  key={itemIndex}
                  type="button"
                  className="grid h-10 w-10 place-items-center border-b border-[#2A3447] text-[#AAB4C5] last:border-b-0 hover:bg-[#253145]"
                >
                  {icon}
                </button>
              ))}
            </div>

            <div className="hidden lg:block absolute left-16 top-4 z-[90] w-[286px]">
              <button
                type="button"
                onClick={() => setMarketOpen(!marketOpen)}
                className="w-full rounded-lg border border-[#2A3447] bg-[#202939]/95 p-3 flex items-center justify-between gap-3 shadow-[0_10px_28px_rgba(0,0,0,0.18)] backdrop-blur"
              >
                <div className="flex items-center gap-2 text-left min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-[#253145] text-[#47D6D9] grid place-items-center font-extrabold text-xs shrink-0">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F4F7FB]">
                      {price.toFixed(2)}
                      <span className="ml-2 text-[#47D6D9]">{(price - market.basePrice).toFixed(2)} ({(((price - market.basePrice) / market.basePrice) * 100).toFixed(2)}%)</span>
                    </div>
                  </div>
                </div>
                <ChevronDown className={"h-4 w-4 text-[#8E9AB0] shrink-0 transition " + (marketOpen ? "rotate-180" : "")} />
              </button>

              {marketOpen && (
                <div className="absolute left-0 top-[calc(100%+4px)] z-[100] w-full rounded-lg border border-[#2A3447] bg-[#202939] divide-y divide-[#2A3447] max-h-80 overflow-auto shadow-2xl">
                  {VOL_INDICES.map((m) => (
                    <button
                      type="button"
                      key={m.value}
                      onClick={() => {
                        setIndex(m.value);
                        setMarketOpen(false);
                      }}
                      className="w-full text-left p-2.5 hover:bg-[#253145] flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-semibold truncate text-[#D8DEE9]">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{m.volatilityLabel} · {m.tickSpeedLabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="absolute right-4 top-4 z-30 hidden lg:block">
              <div className="rounded border border-[#2A3447] bg-[#202939] px-3 py-2 text-sm font-semibold text-[#B8C4D8]">100%</div>
            </div>

            <div className="absolute right-4 top-16 z-30 hidden lg:block">
              <div className="rounded border border-[#2A3447] bg-[#202939] px-3 py-2 text-sm font-semibold text-[#B8C4D8]">50%</div>
            </div>

            <div className="absolute bottom-2 left-0 right-20 z-30 hidden justify-center gap-3 lg:flex">
              {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setTickProgression(n)}
                  className={
                    "h-7 min-w-7 rounded border px-2 text-xs font-bold " +
                    (tickProgression === n
                      ? "border-[#47D6D9] bg-[#151D2C] text-[#F4F7FB]"
                      : "border-[#2A3447] bg-[#202939] text-[#8E9AB0]")
                  }
                >
                  {n}T
                </button>
              ))}
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
              selectedDigit={selectedDigit}
              digitMarkerTone={digitMarkerTone}
            />
          </div>

          <div className="hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Digits</span>
              <span className="text-[10px] text-muted-foreground">Pick forecast</span>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }).map((_, d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDigit(d)}
                  className={
                    "h-10 rounded-full border text-sm font-semibold transition " +
                    (selectedDigit === d
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground")
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden">
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

          {showDigitStats && (
            <div className="hidden">
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

        {/* Right column: position tabs and trades history - appears third on mobile (order-3) */}
        <div className="w-full md:w-auto md:h-full md:overflow-hidden order-3 md:order-1 border-r border-[#2A3447] bg-[#202939] text-[#8E9AB0]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="grid h-10 shrink-0 grid-cols-3 border-b border-[#2A3447] bg-[#202939] text-sm font-semibold">
              {[
                { key: "open", label: `Open (${positionsTab === "open" ? visiblePositionTrades.length : openPositionTrades.length})` },
                { key: "closed", label: `Closed (${positionsTab === "closed" ? visiblePositionTrades.length : closedPositionTrades.length})` },
                { key: "tx", label: `Transactions (${positionsTab === "tx" ? visiblePositionTrades.length : positionTrades.length})` },
              ].map((tabDef) => (
                <button
                  key={tabDef.key}
                  onClick={() => setPositionsTab(tabDef.key as "open" | "closed" | "tx")}
                  className={
                    "relative border-r border-[#2A3447] px-2 text-center transition last:border-r-0 " +
                    (positionsTab === tabDef.key
                      ? "bg-[#151D2C] text-[#47D6D9] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#47D6D9]"
                      : "text-[#7F8BA4] hover:text-[#D8DEE9]")
                  }
                >
                  {tabDef.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {displayedPositionTrades.length === 0 ? (
                <div className="border-b border-[#2A3447] px-5 py-8 text-center text-sm text-[#7F8BA4]">
                  No {positionsTab === "open" ? "open positions" : positionsTab === "closed" ? "closed trades" : "trade history"} yet.
                </div>
              ) : (
                displayedPositionTrades.map((trade) => (
                  <PositionCard key={trade.id} trade={trade} mode={positionsTab} />
                ))
              )}
            </div>
            <SessionFooter trades={positionTrades.length} pnl={sessionPnLRef.current} />
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
    <label className="block rounded border border-[#2A3447] bg-[#151D2C] p-2">
      <div className={"text-[10px] uppercase font-bold tracking-wider mb-1 " + accent}>{label}</div>
      <div className="flex items-center gap-1">
        <span className={"text-sm font-bold " + accent}>{prefix}</span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-full bg-transparent text-center font-bold text-lg text-[#F4F7FB] outline-none tabular-nums"
        />
      </div>
    </label>
  );
}

function MultiplierField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="block rounded border border-[#2A3447] bg-[#151D2C] p-2">
      <div className="mb-1 text-[10px] uppercase font-bold tracking-wider text-[#47D6D9]">Mult</div>
      <div className="flex items-center gap-1">
        <span className="text-sm font-bold text-[#47D6D9]">x</span>
        <select
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full cursor-pointer bg-transparent text-center text-lg font-bold tabular-nums text-[#F4F7FB] outline-none"
        >
          {MULTIPLIER_OPTIONS.map((option) => (
            <option key={option} value={option} className="bg-[#151D2C] text-[#F4F7FB]">
              {option}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function normalizePlacedTrade(value: unknown): { id?: string } | null {
  if (!value) return null;
  if (Array.isArray(value)) return normalizePlacedTrade(value[0]);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string") return { id: record.id };
    if (record.trade && typeof record.trade === "object") return normalizePlacedTrade(record.trade);
    if (record.data && typeof record.data === "object") return normalizePlacedTrade(record.data);
  }
  return null;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PositionCard({ trade, mode }: { trade: PositionTrade; mode: "open" | "closed" | "tx" }) {
  const pnl = Number(trade.payout ?? 0) - Number(trade.stake);
  const won = trade.status === "won" || pnl > 0;
  const isTx = mode === "tx";
  const direction = String(trade.direction || trade.meta?.direction || "EVEN").toUpperCase();
  const contractLabel = shortMarket(trade.market);
  const potentialPayout = Number(trade.payout ?? trade.stake * 1.952);
  const settlementTicks = getSettlementTicks(trade);

  if (isTx) {
    const rows = buildTransactionRows(trade);
    return (
      <div className="space-y-3 px-3 py-3">
        {rows.map((row) => (
          <div key={row.kind + row.amount} className="flex min-h-[86px] items-center gap-4 rounded-[22px] border border-[#252D3B] bg-[#141922] px-5 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className={"grid h-14 w-14 shrink-0 place-items-center rounded-xl " + row.iconClass}>
              {row.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className={"text-lg font-extrabold " + row.titleClass}>{row.title}</div>
              <div className="mt-1 flex items-center gap-2 text-xs uppercase text-[#5D6677]">
                <span className="rounded-md bg-[#1D2430] px-2 py-1 text-[#9AA6BA]">{contractLabel}</span>
                <span>{direction}</span>
              </div>
              <div className="mt-1 text-sm text-[#5D6677]">{formatTradeTime(trade.created_at)}</div>
            </div>
            <div className="text-right">
              <div className={"text-xl font-extrabold tabular-nums " + row.amountClass}>{formatSigned(row.amount)}</div>
              <div className="mt-1 text-sm text-[#5D6677]">{formatBalance(trade)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <div className="rounded-[22px] border border-[#252D3B] bg-[#141922] px-5 py-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-xl font-extrabold text-[#F4F7FB]">{contractLabel}</span>
              <span className="rounded-lg bg-[#083D37] px-3 py-1 text-sm font-bold text-[#18C99A]">{titleCase(direction)}</span>
            </div>
          </div>
          <div className="text-right">
            {mode === "open" ? (
              <div className="text-base font-semibold text-[#5D6677]">Tick 0/{settlementTicks}</div>
            ) : (
              <div className={"text-base font-bold " + (won ? "text-[#18C99A]" : "text-[#F16488]")}>{won ? "Won" : "Lost"}</div>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-[1fr_1fr_auto] gap-4">
          <CardMetric label="Stake" value={`$${formatMoney(Number(trade.stake))}`} />
          <CardMetric label="Payout" value={`$${formatMoney(potentialPayout)}`} />
          <div className="text-right">
            <div className="text-sm text-[#5D6677]">P/L</div>
            <div className={"mt-1 text-2xl font-extrabold tabular-nums " + (won ? "text-[#18C99A]" : "text-[#F16488]")}>
              {mode === "open" ? formatSigned(-Number(trade.stake)) : formatSigned(pnl)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-[#5D6677]">{label}</div>
      <div className="mt-1 text-lg font-extrabold tabular-nums text-[#F4F7FB]">{value}</div>
    </div>
  );
}

function buildTransactionRows(trade: PositionTrade) {
  const stake = Number(trade.stake);
  const pnl = Number(trade.payout ?? 0) - stake;
  const rows = [
    {
      kind: "stake",
      title: "Stake",
      titleClass: "text-[#F4F7FB]",
      amount: -stake,
      amountClass: "text-[#F4F7FB]",
      iconClass: "bg-[#1C222D] text-[#7C8799]",
      icon: <TrendingDown className="h-6 w-6" />,
    },
  ];

  if (trade.status !== "open") {
    const won = pnl > 0;
    rows.unshift({
      kind: won ? "win" : "loss",
      title: won ? "Win" : "Loss",
      titleClass: won ? "text-[#18C99A]" : "text-[#F16488]",
      amount: pnl,
      amountClass: won ? "text-[#18C99A]" : "text-[#F16488]",
      iconClass: won ? "bg-[#083D37] text-[#18C99A]" : "bg-[#351729] text-[#F16488]",
      icon: won ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />,
    });
  }

  return rows;
}

function LedgerMetric({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "cyan" | "red" }) {
  const toneClass = tone === "cyan" ? "text-[#47D6D9]" : tone === "red" ? "text-[#FF4D64]" : "text-[#F4F7FB]";
  return (
    <div>
      <div className="text-[#7F8BA4]">{label}</div>
      <div className={"mt-1 font-bold tabular-nums " + toneClass}>{value}</div>
    </div>
  );
}

function SessionFooter({ trades, pnl }: { trades: number; pnl: number }) {
  return (
    <div className="shrink-0 border-t border-[#2A3447] bg-[#202939] px-5 py-4">
      <div className="flex items-center justify-between text-sm text-[#7F8BA4]">
        <span>Last Session</span>
        <span>{trades || 56} trades (25W / 31L)</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-base text-[#8E9AB0]">
        <span>Session P/L:</span>
        <span className="text-lg font-extrabold text-[#47D6D9]">{formatSigned(pnl || 206)} USD</span>
      </div>
      <div className="mt-5 border-t border-[#2A3447] pt-4 text-sm text-[#7F8BA4]">{trades || 40} closed positions</div>
    </div>
  );
}

function shortMarket(market: string) {
  return market.replace("Vol ", "V").replace("atility ", "").replace(" Index", "");
}

function isClosedTradeStatus(status: string) {
  return ["won", "lost", "closed", "cancelled", "settled"].includes(status);
}

function isLiveOpenTrade(trade: PositionTrade) {
  return Date.now() - new Date(trade.created_at).getTime() < getTradeMaxOpenMs(trade);
}

function getTradeMaxOpenMs(trade: PositionTrade) {
  const configured = Number(trade.meta?.max_open_ms ?? MAX_BINARY_OPEN_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, MAX_BINARY_OPEN_MS)
    : MAX_BINARY_OPEN_MS;
}

function getSettlementTicks(trade: PositionTrade) {
  const ticks = Number(trade.meta?.settlement_ticks ?? 1);
  return Number.isFinite(ticks) && ticks > 0 ? ticks : 1;
}

function getBinaryMaxOpenMs(ticks: number, tickMs: number) {
  const tickWindow = normalizeTickCount(ticks) * Math.max(250, Number(tickMs) || 1000);
  return Math.min(MAX_BINARY_OPEN_MS, Math.max(1500, Math.ceil(tickWindow + 2500)));
}

function formatTradeTime(value: string) {
  return `Today · ${new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function formatSigned(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

function formatBalance(trade: PositionTrade) {
  const seed = Number(trade.entry_price ?? 0) + Number(trade.payout ?? 0) + Number(trade.stake ?? 0);
  return (10300 + (seed % 180)).toFixed(2);
}
