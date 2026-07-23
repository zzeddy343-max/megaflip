import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LineChart as RCLineChart, Line, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, ComposedChart, Bar } from "recharts";
import {
  ChevronDown,
  TrendingUp,
  BarChart3,
  Palette,
  Download,
  Plus,
  Minus,
  Crosshair,
  Target,
  CandlestickChart,
  LineChart as LineIcon,
  Sparkles,
  StopCircle,
} from "lucide-react";


import { useAccountMode } from "@/hooks/use-account-mode";
import {
  MARKETS,
  MARKET_LIST,
  CONTRACTS,
  contractFor,
  payoutMultiplier,
  priceAt,
  lastDigit,
  type MarketId,
  type ContractType,
  type Direction,
} from "@/lib/markets";


import {
  placeTrade,
  settleTrade,
  settleDueTrades,
  getWallet,
  listMyTrades,
  listMyTransactions,
  cancelTrade,
} from "@/lib/trades.functions";
import { formatUSD, formatPrice } from "@/lib/format";

const CHART_POINTS = 240;
const DIGIT_WINDOW = 200; // ticks used to compute digit % distribution

type PendingTrade = {
  id: string;
  settlesAt: number;
  entryTickIndex: number;
  exitTickIndex: number;
  entryPrice: number;
  digitTarget: number | null;
  contractType: ContractType;
  direction: Direction;
  stakeCents: number;
};

type LastOutcome = {
  digit: number;
  won: boolean;
  at: number;
};

// Per-tick outcome during a running contract (used to glow the digit circles as ticks land)
type TickOutcome = { tickIndex: number; digit: number; won: boolean; final: boolean };

type LoadedAutoBot = {
  source: "builder" | "scanner";
  label: string;
  market: MarketId;
  contractType: ContractType;
  direction: Direction;
  digit: number | null;
  stake: string;
  ticks: number;
};


export function BinaryPanel() {
  const qc = useQueryClient();
  const chartShellRef = useRef<HTMLDivElement | null>(null);
  const [marketId, setMarketId] = useState<MarketId>("V10_1S");
  const [contractType, setContractType] = useState<ContractType>("even_odd");
  const [direction, setDirection] = useState<Direction>("even");
  const [ticks, setTicks] = useState(1);
  const [stake, setStake] = useState("10");
  const [digit, setDigit] = useState(5);
  const [placing, setPlacing] = useState(false);
  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null);
  const [tickOutcomes, setTickOutcomes] = useState<TickOutcome[]>([]);
  const [lastOutcome, setLastOutcome] = useState<LastOutcome | null>(null);
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const [stakeMode, setStakeMode] = useState<"stake" | "payout">("stake");
  const [targetProfit, setTargetProfit] = useState("200");
  const [targetLoss, setTargetLoss] = useState("999");
  const [lossMultiple, setLossMultiple] = useState("2");
  const [positionsTab, setPositionsTab] = useState<"open" | "closed" | "txns">("open");
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const [visiblePoints, setVisiblePoints] = useState(CHART_POINTS);
  const [showReference, setShowReference] = useState(true);
  const [showDots, setShowDots] = useState(false);
  const [drawGuide, setDrawGuide] = useState(false);
  const [chartType, setChartType] = useState<"candles" | "line">("candles");
  const [autoBot, setAutoBot] = useState<LoadedAutoBot | null>(null);
  const [autoTrading, setAutoTrading] = useState(false);


  const spec = MARKETS[marketId];
  const contract = contractFor(contractType);

  // Live ticking price
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), Math.min(spec.intervalMs, 400));
    return () => clearInterval(id);
  }, [spec.intervalMs]);

  const currentPrice = useMemo(() => priceAt(marketId, now), [marketId, now]);
  const currentDigit = lastDigit(currentPrice, spec.decimals);
  const seriesEnd = Math.floor(now / spec.intervalMs);

  const series = useMemo(() => {
    const arr: { t: number; p: number }[] = [];
    for (let i = visiblePoints - 1; i >= 0; i--) {
      const tickIndex = seriesEnd - i;
      const t = tickIndex * spec.intervalMs;
      arr.push({ t, p: priceAt(marketId, t) });
    }
    return arr;
  }, [marketId, seriesEnd, spec.intervalMs, visiblePoints]);

  // Candles derived from the series by grouping ticks. ~40 candles visible.
  const candles = useMemo(() => {
    const groupSize = Math.max(1, Math.floor(visiblePoints / 40));
    const out: { t: number; o: number; h: number; l: number; c: number; range: [number, number] }[] = [];
    for (let i = 0; i < series.length; i += groupSize) {
      const slice = series.slice(i, i + groupSize);
      if (!slice.length) continue;
      const o = slice[0].p;
      const cl = slice[slice.length - 1].p;
      const h = Math.max(...slice.map((s) => s.p));
      const l = Math.min(...slice.map((s) => s.p));
      out.push({ t: slice[0].t, o, h, l, c: cl, range: [l, h] });
    }
    return out;
  }, [series, visiblePoints]);


  // Digit distribution over the last DIGIT_WINDOW ticks
  const digitStats = useMemo(() => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < DIGIT_WINDOW; i++) {
      const t = (seriesEnd - i) * spec.intervalMs;
      counts[lastDigit(priceAt(marketId, t), spec.decimals)]++;
    }
    return counts.map((c) => (c / DIGIT_WINDOW) * 100);
  }, [marketId, seriesEnd, spec.intervalMs]);

  const minDigit = digitStats.indexOf(Math.min(...digitStats));
  const maxDigit = digitStats.indexOf(Math.max(...digitStats));

  useEffect(() => {
    if (!contract.directions.some((d) => d.key === direction)) {
      setDirection(contract.directions[0].key);
    }
  }, [contract, direction]);

  const placeFn = useServerFn(placeTrade);
  const settleFn = useServerFn(settleTrade);
  const settleDueFn = useServerFn(settleDueTrades);
  const cancelFn = useServerFn(cancelTrade);
  const walletFn = useServerFn(getWallet);
  const tradesFn = useServerFn(listMyTrades);
  const txnsFn = useServerFn(listMyTransactions);

  const [accountMode] = useAccountMode();

  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: () => walletFn(), refetchInterval: 3000 });
  const { data: trades } = useQuery({ queryKey: ["my-trades"], queryFn: () => tradesFn(), refetchInterval: 2500 });
  const { data: txns } = useQuery({ queryKey: ["my-txns"], queryFn: () => txnsFn(), refetchInterval: 4000 });

  useEffect(() => {
    const loaded = readLoadedAutoBot();
    if (!loaded) return;

    setAutoBot(loaded);
    setAutoTrading(true);
    setMode("auto");
    setMarketId(loaded.market);
    setContractType(loaded.contractType);
    setDirection(loaded.direction);
    setStake(loaded.stake);
    setTicks(loaded.ticks);
    if (loaded.digit != null) setDigit(loaded.digit);
    toast.success(`${loaded.source === "scanner" ? "AI scanner" : "Bot"} loaded for auto trading`);
  }, []);

  // Auto-settle any due open trades (covers bot-placed trades too)
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const r = await settleDueFn();
        if (r?.settled) {
          qc.invalidateQueries({ queryKey: ["wallet"] });
          qc.invalidateQueries({ queryKey: ["my-trades"] });
          qc.invalidateQueries({ queryKey: ["my-txns"] });
          qc.invalidateQueries({ queryKey: ["bots"] });
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [settleDueFn, qc]);

  const openTrades = useMemo(() => (trades ?? []).filter((t: any) => t.status === "open"), [trades]);
  const closedTrades = useMemo(() => (trades ?? []).filter((t: any) => t.status !== "open"), [trades]);

  // Session P/L across closed trades of the current session (last hour)
  const sessionPL = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    let pl = 0;
    for (const t of closedTrades as any[]) {
      const at = new Date(t.settled_at ?? t.opened_at).getTime();
      if (at < cutoff) continue;
      pl += (t.payout_cents ?? 0) - t.stake_cents;
    }
    return pl;
  }, [closedTrades]);

  const sessionCount = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    let w = 0, l = 0;
    for (const t of closedTrades as any[]) {
      const at = new Date(t.settled_at ?? t.opened_at).getTime();
      if (at < cutoff) continue;
      if (t.status === "won") w++;
      else if (t.status === "lost") l++;
    }
    return { w, l, total: w + l };
  }, [closedTrades]);

  const mult = payoutMultiplier(contractType, direction);
  const stakeCents = Math.max(0, Math.round(parseFloat(stake || "0") * 100));
  const potentialPayoutCents = Math.floor(stakeCents * mult);

  useEffect(() => {
    if (!pendingTrade) return;
    const wait = Math.max(0, pendingTrade.settlesAt - Date.now()) + 400;
    const t = setTimeout(async () => {
      try {
        const exitTime = pendingTrade.exitTickIndex * spec.intervalMs;
        const exitPrice = priceAt(marketId, exitTime);
        const exitDigit = lastDigit(exitPrice, spec.decimals);
        const won = contractWon(
          pendingTrade.contractType,
          pendingTrade.direction,
          pendingTrade.entryPrice,
          exitPrice,
          pendingTrade.digitTarget,
          spec.decimals,
        );
        const res = await settleFn({
          data: {
            trade_id: pendingTrade.id,
            won,
            exit_price: exitPrice,
            multiplier: payoutMultiplier(pendingTrade.contractType, pendingTrade.direction),
          },
        });
        setLastOutcome({ digit: exitDigit, won, at: Date.now() });
        const payoutCents = Math.round(Number(res.payout ?? 0) * 100);
        if (won) toast.success(`Won +${formatUSD(payoutCents - pendingTrade.stakeCents)}`);
        else toast.error("Trade lost");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingTrade(null);
        qc.invalidateQueries({ queryKey: ["wallet"] });
        qc.invalidateQueries({ queryKey: ["my-trades"] });
        qc.invalidateQueries({ queryKey: ["my-txns"] });
      }
    }, wait);
    return () => clearTimeout(t);
  }, [pendingTrade, settleFn, qc, spec.decimals, marketId, spec.intervalMs]);

  useEffect(() => {
    if (!pendingTrade) {
      setTickOutcomes([]);
      return;
    }

    const landedTicks = Math.max(
      0,
      Math.min(seriesEnd, pendingTrade.exitTickIndex) - pendingTrade.entryTickIndex,
    );
    const outcomes: TickOutcome[] = [];
    for (let offset = 0; offset <= landedTicks; offset++) {
      const tickIndex = pendingTrade.entryTickIndex + offset;
      const price = priceAt(marketId, tickIndex * spec.intervalMs);
      const isFinal = tickIndex >= pendingTrade.exitTickIndex;
      outcomes.push({
        tickIndex,
        digit: lastDigit(price, spec.decimals),
        won: isFinal
          ? contractWon(
              pendingTrade.contractType,
              pendingTrade.direction,
              pendingTrade.entryPrice,
              price,
              pendingTrade.digitTarget,
              spec.decimals,
            )
          : false,
        final: isFinal,
      });
    }
    setTickOutcomes(outcomes);
  }, [pendingTrade, seriesEnd, marketId, spec.intervalMs, spec.decimals]);

  // Fade the last-outcome glow after 4s
  useEffect(() => {
    if (!lastOutcome) return;
    const t = setTimeout(() => setLastOutcome(null), 4000);
    return () => clearTimeout(t);
  }, [lastOutcome]);

  // (Per-tick digit glow removed — only the final settlement flashes green/red;
  // the orange glow persists on the target digit while the contract is open.)




  async function handlePlace(
    dir: Direction,
    options: { automated?: boolean; tickCount?: number; source?: string } = {},
  ) {
    if (placing || pendingTrade) return;
    if (openTrades.length > 0) {
      if (!options.automated) {
        toast.error("You already have one open binary contract. Wait for it to settle first.");
      }
      return;
    }
    if (stakeCents < 35) { toast.error("Minimum stake is $0.35"); return; }
    setPlacing(true);
    setDirection(dir);
    try {
      const tradeTicks = Math.max(1, Number(options.tickCount ?? ticks));
      const entryTickIndex = seriesEnd;
      const exitTickIndex = seriesEnd + tradeTicks;
      const res = await placeFn({
        data: {
          module: "binary",
          market: marketId,
          direction: dir,
          stake: stakeCents / 100,
          entry_price: currentPrice,
          meta: {
            account_mode: accountMode,
            contract_type: contractType,
            digit_target: contract.needsDigit ? digit : null,
            settlement_ticks: tradeTicks,
            tick_ms: spec.intervalMs,
            entry_tick_index: entryTickIndex,
            exit_tick_index: exitTickIndex,
            automated: !!options.automated,
            automation_source: options.source ?? null,
          },
        },
      });
      const id = normalizePlacedTradeId(res);
      if (!id) throw new Error("Trade was placed but no trade id was returned");
      setTickOutcomes([]);
      setPendingTrade({
        id,
        settlesAt: exitTickIndex * spec.intervalMs,
        entryTickIndex,
        exitTickIndex,
        entryPrice: currentPrice,
        digitTarget: contract.needsDigit ? digit : null,
        contractType,
        direction: dir,
        stakeCents,
      });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["my-trades"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  useEffect(() => {
    if (!autoTrading || !autoBot || pendingTrade || placing || openTrades.length > 0) return;

    const id = window.setTimeout(() => {
      void handlePlace(autoBot.direction, {
        automated: true,
        tickCount: autoBot.ticks,
        source: autoBot.source,
      });
    }, 650);

    return () => window.clearTimeout(id);
  }, [
    autoTrading,
    autoBot,
    pendingTrade,
    placing,
    openTrades.length,
    marketId,
    contractType,
    direction,
    stake,
    digit,
    ticks,
    currentPrice,
    seriesEnd,
  ]);

  async function stopAutoTrading() {
    setAutoTrading(false);
    setAutoBot(null);
    setMode("manual");
    window.sessionStorage.removeItem("megaflip-scanner-bot");

    const cancelIds = new Set<string>(openTrades.map((trade: any) => trade.id).filter(Boolean));
    if (pendingTrade?.id) cancelIds.add(pendingTrade.id);
    setPendingTrade(null);
    if (cancelIds.size === 0) {
      toast.success("Auto trading stopped");
      return;
    }

    const results = await Promise.allSettled(
      [...cancelIds].map((tradeId) => cancelFn({ data: { trade_id: tradeId } })),
    );
    const cancelled = results.filter((result) => result.status === "fulfilled").length;
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["my-trades"] });
    qc.invalidateQueries({ queryKey: ["my-txns"] });
    toast.success(`Auto trading stopped${cancelled ? ` and ${cancelled} open trade${cancelled === 1 ? "" : "s"} cancelled` : ""}`);
  }

  function zoomIn() {
    setVisiblePoints((points) => Math.max(60, Math.round(points * 0.72)));
  }

  function zoomOut() {
    setVisiblePoints((points) => Math.min(420, Math.round(points * 1.35)));
  }

  function resetZoom() {
    setVisiblePoints(CHART_POINTS);
    setDrawGuide(false);
  }

  function saveChart() {
    const svg = chartShellRef.current?.querySelector("svg");
    if (!svg) {
      toast.error("Chart is not ready yet");
      return;
    }
    const copy = svg.cloneNode(true) as SVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${marketId.toLowerCase()}-chart.svg`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Chart saved");
  }

  const priceValues = series.map((s) => s.p);
  const min = Math.min(...priceValues), max = Math.max(...priceValues);
  const priceDelta = series.length > 1 ? currentPrice - series[0].p : 0;
  const pctChange = series[0].p ? (priceDelta / series[0].p) * 100 : 0;
  const isUp = priceDelta >= 0;

  const secondsLeft = pendingTrade ? Math.max(0, Math.ceil((pendingTrade.settlesAt - now) / 1000)) : 0;
  // Zoom scale: max zoom in (~60 visible pts) reads 50%, and upscales as more
  // ticks come into view.
  const zoomPercent = Math.round((visiblePoints / 60) * 50);


  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:gap-3 lg:p-3">
        {/* LEFT — positions (desktop only; mobile has /positions route) */}
        <div className="hidden min-h-0 lg:block">
          <PositionsPanel
            tab={positionsTab}
            onTab={setPositionsTab}
            openTrades={openTrades}
            closedTrades={closedTrades}
            txns={txns ?? []}
            sessionPL={sessionPL}
            sessionCount={sessionCount}
            spec={spec}
          />
        </div>

        {/* Chart column — mobile: 40vh; desktop: 1fr */}
        <div className="flex h-[40vh] shrink-0 flex-col gap-2 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
          <div ref={chartShellRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface">

            {/* Chart toolbar (left) */}
            <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-border bg-background/80 p-1 backdrop-blur">
              <ChartTool label="Candles" active={chartType === "candles"} onClick={() => setChartType("candles")}><CandlestickChart className="h-4 w-4" /></ChartTool>
              <ChartTool label="Line" active={chartType === "line"} onClick={() => setChartType("line")}><LineIcon className="h-4 w-4" /></ChartTool>
              <ChartTool label="Trend line" active={showReference} onClick={() => setShowReference((v) => !v)}><TrendingUp className="h-4 w-4" /></ChartTool>
              <ChartTool label="Tick dots" active={showDots} onClick={() => setShowDots((v) => !v)}><BarChart3 className="h-4 w-4" /></ChartTool>
              <ChartTool label="Guide" active={drawGuide} onClick={() => setDrawGuide((v) => !v)}><Palette className="h-4 w-4" /></ChartTool>
              <ChartTool label="Save chart" onClick={saveChart}><Download className="h-4 w-4" /></ChartTool>
            </div>


            {/* Market picker */}
            <div className="absolute left-16 top-3 z-10">
              <button
                onClick={() => setMarketMenuOpen((v) => !v)}
                className="flex items-center gap-3 rounded-xl border border-border bg-background/85 px-3 py-2 text-left backdrop-blur transition hover:border-primary/60"
              >
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{spec.label} Index</div>
                  <div className="flex items-baseline gap-1.5 font-mono text-xs">
                    <span>{formatPrice(currentPrice, spec.decimals)}</span>
                    <span className={isUp ? "text-bull" : "text-bear"}>
                      {isUp ? "+" : ""}{formatPrice(priceDelta, spec.decimals)} ({pctChange.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {marketMenuOpen && (
                <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
                  {MARKET_LIST.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setMarketId(m.id); setMarketMenuOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface ${
                        m.id === marketId ? "bg-surface text-primary" : ""
                      }`}
                    >
                      <BarChart3 className="h-3.5 w-3.5 opacity-70" />
                      <span className="flex-1">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">{m.intervalMs}ms</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scale badge */}
            <div className="absolute right-3 top-3 z-10 rounded-lg border border-border bg-background/80 px-2 py-1 text-xs font-mono text-muted-foreground backdrop-blur">
              {zoomPercent}%
            </div>

            {/* Chart */}
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "line" ? (
                  <RCLineChart data={series} margin={{ top: 56, right: 48, bottom: 4, left: 0 }}>
                    <defs>
                      <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="1.4" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid stroke="oklch(0.28 0.02 260)" strokeOpacity={0.25} vertical horizontal />
                    <YAxis
                      domain={[min - (max - min) * 0.08, max + (max - min) * 0.08]}
                      orientation="right" tickLine={false} axisLine={false} width={44}
                      tick={{ fill: "oklch(0.72 0.02 255)", fontSize: 10, fontFamily: "JetBrains Mono" }}
                      tickFormatter={(v) => formatPrice(v, spec.decimals)}
                    />
                    {showReference && (
                      <ReferenceLine y={currentPrice} stroke="oklch(0.95 0 0)" strokeDasharray="3 3" strokeOpacity={0.4}
                        label={{ value: formatPrice(currentPrice, spec.decimals), position: "right", fill: "oklch(0.95 0 0)", fontSize: 11 }} />
                    )}
                    {drawGuide && (
                      <ReferenceLine y={(min + max) / 2} stroke="oklch(0.75 0.15 85)" strokeDasharray="6 5" strokeOpacity={0.55} />
                    )}
                    <Line
                      type="stepAfter" dataKey="p" stroke="oklch(0.97 0 0)" strokeWidth={1.5}
                      strokeLinecap="round" strokeLinejoin="round"
                      dot={showDots ? { r: 1.4, strokeWidth: 0, fill: "oklch(0.97 0 0)" } : false}
                      isAnimationActive={false} filter="url(#lineGlow)"
                    />
                  </RCLineChart>
                ) : (
                  <ComposedChart data={candles} margin={{ top: 56, right: 48, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="oklch(0.28 0.02 260)" strokeOpacity={0.25} vertical horizontal />
                    <YAxis
                      domain={[min - (max - min) * 0.08, max + (max - min) * 0.08]}
                      orientation="right" tickLine={false} axisLine={false} width={44}
                      tick={{ fill: "oklch(0.72 0.02 255)", fontSize: 10, fontFamily: "JetBrains Mono" }}
                      tickFormatter={(v) => formatPrice(v, spec.decimals)}
                    />
                    {showReference && (
                      <ReferenceLine y={currentPrice} stroke="oklch(0.95 0 0)" strokeDasharray="3 3" strokeOpacity={0.4}
                        label={{ value: formatPrice(currentPrice, spec.decimals), position: "right", fill: "oklch(0.95 0 0)", fontSize: 11 }} />
                    )}
                    {drawGuide && (
                      <ReferenceLine y={(min + max) / 2} stroke="oklch(0.75 0.15 85)" strokeDasharray="6 5" strokeOpacity={0.55} />
                    )}
                    <Bar dataKey="range" isAnimationActive={false} shape={(props: any) => <CandleShape {...props} />} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>


            {/* Digit strip */}
            <DigitStrip
              currentDigit={currentDigit}
              currentPrice={currentPrice}
              decimals={spec.decimals}
              digitStats={digitStats}
              minDigit={minDigit}
              maxDigit={maxDigit}
              pending={pendingTrade}
              lastOutcome={lastOutcome}
              tickOutcomes={tickOutcomes}
            />

            {/* Zoom controls (always visible) */}
            <div className="absolute bottom-32 left-3 z-10 flex flex-col gap-1 rounded-xl border border-border bg-background/80 p-1 backdrop-blur">

              <button onClick={zoomIn} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground" aria-label="Zoom in">
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button onClick={resetZoom} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground" aria-label="Reset chart zoom">
                <Crosshair className="h-3.5 w-3.5" />
              </button>
              <button onClick={zoomOut} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground" aria-label="Zoom out">
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>

            {pendingTrade && (
              <div className="absolute right-3 top-14 z-10 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs">
                <span className="live-dot" />
                <span>Contract open · {secondsLeft}s</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — trade config (scrolls internally on tight viewports) */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:flex-none">
          {autoBot && (
            <div className="mb-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs text-primary shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_18%,transparent)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-extrabold">
                    <span className="live-dot" />
                    {autoBot.source === "scanner" ? "AI position loaded" : "Bot loaded"}
                  </div>
                  <div className="mt-1 truncate text-muted-foreground">
                    {autoBot.label} / {MARKETS[autoBot.market].label} / {autoBot.direction}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Auto trades: {((autoBot.ticks * MARKETS[autoBot.market].intervalMs) / 1000).toFixed(1)}s each
                  </div>
                </div>
                <button
                  type="button"
                  onClick={stopAutoTrading}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-bear/50 bg-bear/15 px-3 py-2 font-bold text-bear transition hover:bg-bear/25"
                >
                  <StopCircle className="h-4 w-4" />
                  Stop
                </button>
              </div>
            </div>
          )}

          {/* Mobile-only pending/last outcome banner */}
          {(pendingTrade || lastOutcome) && (
            <div className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-2 text-xs lg:hidden ${
              pendingTrade
                ? "border-primary/40 bg-primary/10 text-primary"
                : lastOutcome?.won
                  ? "border-bull/40 bg-bull/10 text-bull"
                  : "border-bear/40 bg-bear/10 text-bear"
            }`}>
              <span className="flex items-center gap-2">
                <span className="live-dot" />
                {pendingTrade
                  ? `Contract running · ${secondsLeft}s`
                  : lastOutcome?.won ? "✓ Won last trade" : "✗ Lost last trade"}
              </span>
              <span className="font-mono">
                {openTrades.length} open · {closedTrades.length} closed
              </span>
            </div>
          )}
          <TradeConfig
            contractType={contractType}
            onContract={setContractType}
            direction={direction}
            onDirection={setDirection}
            mode={mode}
            onMode={setMode}
            stakeMode={stakeMode}
            onStakeMode={setStakeMode}
            stake={stake}
            onStake={setStake}
            targetProfit={targetProfit}
            onTargetProfit={setTargetProfit}
            targetLoss={targetLoss}
            onTargetLoss={setTargetLoss}
            lossMultiple={lossMultiple}
            onLossMultiple={setLossMultiple}
            digit={digit}
            onDigit={setDigit}
            ticks={ticks}
            onTicks={setTicks}
            contract={contract}
            potentialPayoutCents={potentialPayoutCents}
            onPlace={handlePlace}
            placing={placing || !!pendingTrade}
            pending={!!pendingTrade}
            mult={mult}
            contractType_={contractType}
          />
        </div>
      </div>
    </div>
  );
}

function normalizePlacedTradeId(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return normalizePlacedTradeId(value[0]);
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  return normalizePlacedTradeId(record.trade ?? record.data ?? null);
}

function readLoadedAutoBot(): LoadedAutoBot | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem("megaflip-scanner-bot");
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data.autotrade) return null;

    const market = mapLoadedMarket(data.market, data.volatility);
    const contractType = mapLoadedContract(data.category);
    const contract = contractFor(contractType);
    const direction = mapLoadedDirection(data.direction, contractType);
    const fallbackDirection = contract.directions[0].key as Direction;
    const source = data.source === "builder" ? "builder" : "scanner";
    const stake = Math.max(0.35, Number(data.stake ?? 10));
    const digit = Number.isFinite(Number(data.digit)) ? Math.max(0, Math.min(9, Number(data.digit))) : null;

    return {
      source,
      label:
        typeof data.name === "string" && data.name.trim()
          ? data.name.trim()
          : source === "scanner"
            ? "AI scanner setup"
            : "Builder bot",
      market,
      contractType,
      direction: contract.directions.some((item) => item.key === direction)
        ? direction
        : fallbackDirection,
      digit,
      stake: stake.toFixed(2),
      ticks: getAutoTradeTicks(market),
    };
  } catch {
    window.sessionStorage.removeItem("megaflip-scanner-bot");
    return null;
  }
}

function mapLoadedMarket(value: unknown, volatility: unknown): MarketId {
  const text = String(value ?? "").toLowerCase();
  const volText = String(volatility ?? "").toLowerCase();
  const number = text.match(/100|75|50|25|10/)?.[0] ?? "10";
  const wantsOneSecond = text.includes("1s") || volText.includes("1s");
  const candidate = `V${number}${wantsOneSecond ? "_1S" : ""}` as MarketId;
  if (MARKETS[candidate]) return candidate;

  const byLabel = MARKET_LIST.find((market) => market.label.toLowerCase() === text);
  return byLabel?.id ?? "V10_1S";
}

function mapLoadedContract(value: unknown): ContractType {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("buy") || text.includes("sell") || text.includes("rise") || text.includes("fall")) return "rise_fall";
  if (text.includes("over") || text.includes("under")) return "over_under";
  if (text.includes("match") || text.includes("differ")) return "matches_differs";
  return "even_odd";
}

function mapLoadedDirection(value: unknown, contractType: ContractType): Direction {
  const text = String(value ?? "").toLowerCase();
  if (contractType === "rise_fall") return text.includes("sell") || text.includes("fall") ? "fall" : "rise";
  if (contractType === "over_under") return text.includes("under") ? "under" : "over";
  if (contractType === "matches_differs") return text.includes("differ") ? "differs" : "matches";
  return text.includes("odd") ? "odd" : "even";
}

function getAutoTradeTicks(market: MarketId) {
  const interval = MARKETS[market].intervalMs;
  const minTicks = Math.max(1, Math.ceil(2000 / interval));
  const maxTicks = Math.max(minTicks, Math.floor(4000 / interval));
  const targetTicks = Math.max(1, Math.round(3000 / interval));
  return Math.max(minTicks, Math.min(maxTicks, targetTicks));
}

function contractWon(
  type: ContractType,
  direction: Direction,
  entryPrice: number,
  exitPrice: number,
  digitTarget: number | null,
  decimals: number,
) {
  const exitDigit = lastDigit(exitPrice, decimals);
  const target = digitTarget ?? 0;
  if (type === "rise_fall") return direction === "rise" ? exitPrice > entryPrice : exitPrice < entryPrice;
  if (type === "even_odd") return direction === "even" ? exitDigit % 2 === 0 : exitDigit % 2 === 1;
  if (type === "over_under") return direction === "over" ? exitDigit > target : exitDigit < target;
  return direction === "matches" ? exitDigit === target : exitDigit !== target;
}

/* ---------- Sub-components ---------- */

function ChartTool({
  children,
  active,
  label,
  onClick,
}: { children: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-md transition ${
        active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* Digit strip — 10 circles with % + last-tick glow + trade-outcome glow */
function DigitStrip({
  currentDigit,
  currentPrice,
  decimals,
  digitStats,
  minDigit,
  maxDigit,
  pending,
  lastOutcome,
  tickOutcomes,
}: {
  currentDigit: number;
  currentPrice: number;
  decimals: number;
  digitStats: number[];
  minDigit: number;
  maxDigit: number;
  pending: PendingTrade | null;
  lastOutcome: LastOutcome | null;
  tickOutcomes: TickOutcome[];
}) {
  return (
    <div className="shrink-0 px-2 pb-2 pt-1">
      {/* Floating price pill above the current digit */}
      <div className="mb-1 flex justify-center">
        <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-background/80 px-3 py-1 text-xs font-mono shadow-lg backdrop-blur">
          <span>{formatPrice(currentPrice, decimals)}</span>
          <span className="grid h-5 w-5 place-items-center rounded-full bg-bull text-[10px] font-bold text-bull-foreground">
            {currentDigit}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-1 rounded-xl border border-border bg-background/70 p-2 backdrop-blur">
        {Array.from({ length: 10 }).map((_, d) => {
          const isCurrent = d === currentDigit;
          const isMin = d === minDigit;
          const isMax = d === maxDigit;

          // Glow rules:
          //  - During a contract, the glow follows each landed tick digit.
          //  - The final landed digit switches to green/red because it decides
          //    the result.
          let glow: "bull" | "bear" | "primary" | null = null;
          const landed = [...tickOutcomes]
            .reverse()
            .find((outcome) => outcome.digit === d);
          if (pending && landed) {
            glow = landed.final ? (landed.won ? "bull" : "bear") : "primary";
          } else if (lastOutcome && lastOutcome.digit === d) {
            glow = lastOutcome.won ? "bull" : "bear";
          } else if (isCurrent) {
            glow = "primary";
          }



          const pct = digitStats[d];
          const pctColor = isMax
            ? "text-bull"
            : isMin
              ? "text-bear"
              : "text-muted-foreground";

          const ringColor =
            glow === "bull"
              ? "bg-bull/25 ring-2 ring-bull shadow-[0_0_18px_var(--color-bull)]"
              : glow === "bear"
                ? "bg-bear/25 ring-2 ring-bear shadow-[0_0_18px_var(--color-bear)]"
                : glow === "primary"
                  ? "bg-primary/15 ring-2 ring-primary shadow-[0_0_18px_var(--color-primary)]"
                  : "bg-surface ring-1 ring-border";

          return (
            <div key={d} className="flex flex-col items-center gap-0.5">
              <div
                className={`grid h-9 w-9 place-items-center rounded-full font-mono text-sm font-bold transition-all duration-200 ${ringColor}`}
              >
                {d}
              </div>
              <div className={`font-mono text-[10px] ${pctColor}`}>{pct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Positions panel with Open / Closed / Transactions tabs */
function PositionsPanel({
  tab,
  onTab,
  openTrades,
  closedTrades,
  txns,
  sessionPL,
  sessionCount,
  spec,
}: {
  tab: "open" | "closed" | "txns";
  onTab: (t: "open" | "closed" | "txns") => void;
  openTrades: any[];
  closedTrades: any[];
  txns: any[];
  sessionPL: number;
  sessionCount: { w: number; l: number; total: number };
  spec: { label: string; decimals: number };
}) {
  const list = tab === "open" ? openTrades : tab === "closed" ? closedTrades : txns;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-3 border-b border-border">
        <TabBtn active={tab === "open"} onClick={() => onTab("open")}>
          Open <span className="opacity-60">({openTrades.length})</span>
        </TabBtn>
        <TabBtn active={tab === "closed"} onClick={() => onTab("closed")}>
          Closed <span className="opacity-60">({closedTrades.length})</span>
        </TabBtn>
        <TabBtn active={tab === "txns"} onClick={() => onTab("txns")}>
          Transactions
        </TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto">
        {list.length === 0 && (
          <div className="flex h-full min-h-[240px] items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
            No {tab === "open" ? "open contracts" : tab === "closed" ? "closed trades" : "transactions"} yet.
          </div>
        )}

        {tab !== "txns" && list.map((t: any) => <TradeCard key={t.id} trade={t} decimals={spec.decimals} />)}
        {tab === "txns" && list.map((tx: any) => <TxnRow key={tx.id} txn={tx} />)}
      </div>

      {/* Session footer */}
      <div className="border-t border-border bg-background/50 px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Session
          </span>
          <span className="text-muted-foreground">
            {sessionCount.total} trades ({sessionCount.w}W / {sessionCount.l}L)
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Session P/L:</span>
          <span className={`font-mono font-semibold ${sessionPL >= 0 ? "text-bull" : "text-bear"}`}>
            {sessionPL >= 0 ? "+" : ""}{formatUSD(sessionPL)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-3 py-3 text-xs font-medium transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TradeCard({ trade, decimals: _decimals }: { trade: any; decimals: number }) {
  const won = trade.status === "won";
  const lost = trade.status === "lost";
  const open = trade.status === "open";
  const pl = (trade.payout_cents ?? 0) - trade.stake_cents;
  const contract = contractFor(trade.contract_type as ContractType);
  const dirLabel = contract.directions.find((d) => d.key === trade.direction)?.label ?? trade.direction;
  const marketLabel = MARKETS[trade.market as MarketId]?.label ?? trade.market;

  return (
    <div className="border-b border-border px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className={`mt-0.5 grid h-6 w-6 place-items-center rounded-md ${won ? "bg-bull/20 text-bull" : lost ? "bg-bear/20 text-bear" : "bg-primary/20 text-primary"}`}>
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{marketLabel}</div>
            <div className="text-[11px] text-muted-foreground">Index · Tick {trade.ticks}</div>
          </div>
        </div>
        <span className={`text-xs font-medium ${won ? "text-bull" : lost ? "text-bear" : "text-primary"}`}>
          ● {dirLabel}
        </span>
      </div>

      {open && <div className="mt-1 text-[11px] text-primary">Contract running…</div>}
      {!open && <div className="mt-1 text-[11px] text-muted-foreground">Trade complete</div>}

      <div className="mt-2 inline-block rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        USD
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Total profit/loss:" value={<span className={pl > 0 ? "text-bull" : pl < 0 ? "text-bear" : ""}>{pl > 0 ? "+" : ""}{formatUSD(pl)}</span>} />
        <Stat label="Contract value:" value={<span className={pl > 0 ? "text-bull" : pl < 0 ? "text-bear" : ""}>{formatUSD(trade.payout_cents ?? 0)}</span>} />
        <Stat label="Stake:" value={formatUSD(trade.stake_cents)} />
        <Stat label="Potential payout:" value={formatUSD(Math.floor(trade.stake_cents * Number(trade.payout_multiplier)))} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}

function TxnRow({ txn }: { txn: any }) {
  const isNeg = txn.amount_cents < 0;
  const kind = txn.type as string;
  const isStake = kind === "trade_stake";
  const color = isStake ? "text-primary" : isNeg ? "text-bear" : "text-bull";
  const iconBg = isStake ? "bg-primary/15" : isNeg ? "bg-bear/15" : "bg-bull/15";
  const label = kind === "trade_stake" ? "Stake" : kind === "trade_payout" ? "Payout" : kind === "deposit" ? "Deposit" : kind.replace("_", " ");

  return (
    <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-3">
      <div className="flex items-start gap-2">
        <div className={`grid h-7 w-7 place-items-center rounded-full ${iconBg} ${color}`}>
          <TrendingUp className="h-3.5 w-3.5 rotate-180" />
        </div>
        <div>
          <div className={`text-sm font-semibold ${color}`}>{label}</div>
          <div className="text-[11px] text-muted-foreground">
            {new Date(txn.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono text-sm font-bold ${color}`}>
          {isNeg ? "" : "+"}{formatUSD(txn.amount_cents)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Bal: {formatUSD(txn.balance_after_cents)}
        </div>
      </div>
    </div>
  );
}

/* Right-side trade configuration panel */
function TradeConfig({
  contractType,
  onContract,
  direction: _direction,
  onDirection: _onDirection,
  mode,
  onMode,
  stakeMode,
  onStakeMode,
  stake,
  onStake,
  targetProfit,
  onTargetProfit,
  targetLoss,
  onTargetLoss,
  lossMultiple,
  onLossMultiple,
  digit,
  onDigit,
  ticks,
  onTicks,
  contract,
  potentialPayoutCents,
  onPlace,
  placing,
  pending,
  mult,
  contractType_,
}: any) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border bg-surface p-3">
        {/* Header with contract type — word buttons */}
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1">
            {CONTRACTS.map((c) => {
              const active = c.type === contractType;
              const short = c.type === "even_odd" ? "Even / Odd"
                : c.type === "over_under" ? "Over / Under"
                : c.type === "matches_differs" ? "Matches / Differs"
                : "Rise / Fall";
              return (
                <button
                  key={c.type}
                  onClick={() => onContract(c.type)}
                  className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? "bg-primary/20 text-primary ring-1 ring-primary/50"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </div>


        {/* Learn about link */}
        <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Learn about this trade type</span>
        </div>

        {/* Trade mode */}
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-medium">Trade Mode</span>
          <span className="text-muted-foreground">Runs until target hit</span>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1">
          <ModeBtn active={mode === "auto"} onClick={() => onMode("auto")}>Auto</ModeBtn>
          <ModeBtn active={mode === "manual"} onClick={() => onMode("manual")}>Manual</ModeBtn>
        </div>

        {mode === "auto" && (
          <>
            <FieldRow icon={Target} label="Target Profit" value={targetProfit} onChange={onTargetProfit} prefix="$" />
            <FieldRow icon={Target} label="Target Loss" value={targetLoss} onChange={onTargetLoss} prefix="$" />
            <FieldRow icon={TrendingUp} label="Loss Multiple" value={lossMultiple} onChange={onLossMultiple} prefix="x" />
          </>
        )}

        {/* Digit target for matches/differs/over/under */}
        {contract.needsDigit && (
          <div className="mb-3">
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {contractType_ === "over_under" ? "Barrier digit" : "Target digit"}
            </div>
            <div className="grid grid-cols-10 gap-1">
              {[0,1,2,3,4,5,6,7,8,9].map((d) => (
                <button
                  key={d}
                  onClick={() => onDigit(d)}
                  className={`h-7 rounded-md font-mono text-xs font-bold transition ${
                    digit === d
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ticks */}
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ticks</div>
          <div className="grid grid-cols-4 gap-1">
            {[1, 2, 5, 10].map((t) => (
              <button
                key={t}
                onClick={() => onTicks(t)}
                className={`h-8 rounded-md text-xs font-semibold transition ${
                  ticks === t
                    ? "bg-primary/20 text-primary ring-1 ring-primary"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}t
              </button>
            ))}
          </div>
        </div>

        {/* Stake / Payout tabs */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1">
          <ModeBtn active={stakeMode === "stake"} onClick={() => onStakeMode("stake")}>Stake</ModeBtn>
          <ModeBtn active={stakeMode === "payout"} onClick={() => onStakeMode("payout")}>Payout</ModeBtn>
        </div>

        {/* Stake with +/- and AI Scanner */}
        <div className="mb-4 flex items-stretch gap-1.5">
          <button
            onClick={() => onStake(String(Math.max(0.35, parseFloat(stake || "0") - 1)))}
            className="grid w-10 place-items-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="relative flex-1">
            <input
              type="number"
              min="0.35"
              step="0.5"
              value={stake}
              onChange={(e) => onStake(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-12 text-center font-mono text-sm font-semibold outline-none focus:border-primary"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">USD</span>
          </div>
          <button
            onClick={() => onStake(String(parseFloat(stake || "0") + 1))}
            className="grid w-10 place-items-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            title="AI Scanner"
            className="flex w-16 flex-col items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary transition hover:bg-primary/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[9px] font-semibold leading-tight">AI</span>
            <span className="text-[8px] leading-tight opacity-80">Scanner</span>
          </button>
        </div>

        {/* Place buttons — one per direction */}
        <div className={`grid gap-2 ${contract.directions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {contract.directions.map((d: any, i: number) => (
            <button
              key={d.key}
              disabled={placing}
              onClick={() => onPlace(d.key)}
              className={`rounded-xl px-3 py-3 text-sm font-bold uppercase tracking-wider transition disabled:opacity-60 ${
                pending
                  ? "border border-border bg-background text-muted-foreground"
                  : i === 0
                    ? "glow-primary bg-bull text-bull-foreground hover:brightness-110"
                    : "bg-bear text-bear-foreground hover:brightness-110"
              }`}
            >
              {pending ? "■ Running" : `▶ ${d.label}`}
            </button>
          ))}
        </div>

        {/* Payout */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Payout</span>
          <span className="font-mono font-semibold">
            {formatUSD(potentialPayoutCents)} <span className="text-muted-foreground">USD</span>
          </span>
        </div>

        {/* Outcome bar */}
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-bear/20 text-bear text-[9px] font-bold">
            {contract.directions[1]?.label[0] ?? "?"}
          </span>
          <span className="text-xs font-medium">{contract.directions[1]?.label ?? "—"}</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-bear" style={{ width: `${Math.min(100, (100/mult)).toFixed(0)}%` }} />
            </div>
            <span className="font-mono text-xs text-bear">{(100/mult).toFixed(2)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md py-1.5 text-xs font-semibold transition ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function FieldRow({
  icon: Icon,
  label,
  value,
  onChange,
  prefix,
}: {
  icon: any;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">{label}</span>
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 pl-7 font-mono text-sm outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

/* Candlestick shape for recharts <Bar dataKey="range" /> where range = [low, high]. */
function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || width == null || height == null) return null;
  const { o, h, l, c } = payload;
  const up = c >= o;
  const color = up ? "oklch(0.72 0.19 150)" : "oklch(0.65 0.22 25)";
  const priceRange = h - l || 1;
  const pxPerPrice = height / priceRange;
  const bodyTop = y + (h - Math.max(o, c)) * pxPerPrice;
  const bodyBottom = y + (h - Math.min(o, c)) * pxPerPrice;
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);
  const wickX = x + width / 2;
  const bodyW = Math.max(2, width * 0.75);
  const bodyX = x + (width - bodyW) / 2;
  return (
    <g>
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyHeight} fill={color} stroke={color} />
    </g>
  );
}

