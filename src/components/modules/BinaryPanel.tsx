import { useEffect, useRef, useState } from "react";
import { LiveChart } from "@/components/LiveChart";
import { Plus, Minus, Bot, User, Square, ChevronDown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade, settleTrade } from "@/lib/trades.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";

const VOL_INDICES = [
  {
    label: "Volatility 10 Index",
    value: "Vol 10",
    basePrice: 1000,
    volatility: 0.00024,
    tickMs: 980,
  },
  {
    label: "Volatility 25 Index",
    value: "Vol 25",
    basePrice: 1000,
    volatility: 0.00038,
    tickMs: 820,
  },
  {
    label: "Volatility 50 Index",
    value: "Vol 50",
    basePrice: 1000,
    volatility: 0.00058,
    tickMs: 680,
  },
  {
    label: "Volatility 75 Index",
    value: "Vol 75",
    basePrice: 1000,
    volatility: 0.00078,
    tickMs: 560,
  },
  {
    label: "Volatility 100 Index",
    value: "Vol 100",
    basePrice: 1000,
    volatility: 0.001,
    tickMs: 480,
  },
  {
    label: "Volatility 10 (1s) Index",
    value: "Vol 10 (1s)",
    basePrice: 1000,
    volatility: 0.00036,
    tickMs: 260,
  },
  {
    label: "Volatility 25 (1s) Index",
    value: "Vol 25 (1s)",
    basePrice: 1000,
    volatility: 0.00054,
    tickMs: 220,
  },
  {
    label: "Volatility 50 (1s) Index",
    value: "Vol 50 (1s)",
    basePrice: 1000,
    volatility: 0.00072,
    tickMs: 200,
  },
  {
    label: "Volatility 75 (1s) Index",
    value: "Vol 75 (1s)",
    basePrice: 1000,
    volatility: 0.00094,
    tickMs: 180,
  },
  {
    label: "Volatility 100 (1s) Index",
    value: "Vol 100 (1s)",
    basePrice: 1000,
    volatility: 0.00115,
    tickMs: 160,
  },
  {
    label: "Crash 500 Index",
    value: "Crash 500",
    basePrice: 500,
    volatility: 0.00066,
    tickMs: 520,
  },
  { label: "Boom 500 Index", value: "Boom 500", basePrice: 500, volatility: 0.00066, tickMs: 520 },
] as const;
const TYPES = ["Buy/Sell", "Even/Odd", "Matches/Differs", "Over/Under"] as const;
type TradeType = (typeof TYPES)[number];
const QUICK = [1, 5, 10, 25, 50, 100];
const DEFAULT_WIN_PROFIT_RATE = 0.2;

type Tick = { d: number; tone: "neutral" | "bull" | "bear" };

export function BinaryPanel() {
  const [index, setIndex] = useState("Vol 25");
  const [type, setType] = useState<TradeType>("Buy/Sell");
  const [marketOpen, setMarketOpen] = useState(false);
  const [stake, setStake] = useState(10);
  const [selectedDigit, setSelectedDigit] = useState(5);
  const [botMode, setBotMode] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [target, setTarget] = useState(200);
  const [stop, setStop] = useState(50);
  const [martingale, setMartingale] = useState(2);
  const [price, setPrice] = useState(1000);
  const [tickTrail, setTickTrail] = useState<Tick[]>([]);
  const [digitHistory, setDigitHistory] = useState<number[]>([]);

  const place = useServerFn(placeTrade);
  const settle = useServerFn(settleTrade);
  const qc = useQueryClient();

  // refs for bot loop
  const botRunningRef = useRef(false);
  const sessionPnLRef = useRef(0);
  const currentStakeRef = useRef(stake);
  const activeDirectionRef = useRef<string | null>(null);
  const typeRef = useRef<TradeType>(type);
  const selectedDigitRef = useRef(selectedDigit);
  const priceRef = useRef(price);
  useEffect(() => {
    typeRef.current = type;
  }, [type]);
  useEffect(() => {
    selectedDigitRef.current = selectedDigit;
  }, [selectedDigit]);
  useEffect(() => {
    priceRef.current = price;
  }, [price]);

  const market = VOL_INDICES.find((m) => m.value === index) ?? VOL_INDICES[1];
  const hour = new Date().getHours();
  const intradayPace = 0.76 + ((Math.sin((hour / 24) * Math.PI * 2 + 0.7) + 1) / 2) * 0.72;
  const chartTickMs = Math.max(140, Math.round(market.tickMs / intradayPace));
  const chartVolatility = market.volatility * (0.88 + intradayPace * 0.22);
  const showDigitStats = type !== "Buy/Sell";
  const showDigitPicker = type === "Over/Under" || type === "Matches/Differs";

  // Track last digit + paint trail, then color active digit contracts by win/loss.
  useEffect(() => {
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

  async function placeAndSettle(direction: string, useStake: number): Promise<boolean> {
    const ty = typeRef.current;
    const sel = selectedDigitRef.current;
    activeDirectionRef.current = direction;
    let trade;
    logDebugEvent("info", "binary.trade", "Placing binary trade", {
      market: index,
      type: ty,
      direction,
      stake: useStake,
      selectedDigit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
      price: priceRef.current,
    });
    try {
      trade = await place({
        data: {
          module: "binary",
          market: index,
          direction,
          stake: useStake,
          entry_price: priceRef.current,
          meta: {
            type: ty,
            digit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
          },
        },
      });
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
      throw e;
    }
    // wait 5s for tick result
    await new Promise((r) => setTimeout(r, 5000));
    const finalDigit = Math.floor(priceRef.current * 10000) % 10;
    let won = false;
    if (ty === "Buy/Sell") won = direction === "BUY" ? Math.random() > 0.48 : Math.random() > 0.52;
    else if (ty === "Even/Odd")
      won = direction === "EVEN" ? finalDigit % 2 === 0 : finalDigit % 2 === 1;
    else if (ty === "Over/Under") won = direction === "OVER" ? finalDigit > sel : finalDigit < sel;
    else if (ty === "Matches/Differs")
      won = direction === "MATCH" ? finalDigit === sel : finalDigit !== sel;

    const winProfitRate = profitRateForContract(ty, direction);
    try {
      await settle({
        data: {
          trade_id: trade.id,
          won,
          exit_price: priceRef.current,
          multiplier: 1 + winProfitRate,
        },
      });
      logDebugEvent("info", "binary.trade", "Binary trade settled", {
        tradeId: trade.id,
        won,
        finalDigit,
        exitPrice: priceRef.current,
      });
    } catch (e) {
      logDebugEvent("error", "binary.trade", "Binary trade settlement failed", serializeError(e));
      throw e;
    }
    activeDirectionRef.current = null;
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["trades"] });

    if (won) {
      const profit = useStake * winProfitRate;
      sessionPnLRef.current += profit;
      toast.success(
        `WIN +$${profit.toFixed(2)} · session $${sessionPnLRef.current.toFixed(2)}`,
      );
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

  async function startBot(direction: string) {
    if (botRunningRef.current) return;
    logDebugEvent("info", "binary.bot", "Binary bot started", {
      direction,
      stake,
      target,
      stop,
      martingale,
      type,
      market: index,
    });
    botRunningRef.current = true;
    setBotRunning(true);
    sessionPnLRef.current = 0;
    currentStakeRef.current = stake;
    toast.success(`Bot started — ${direction} · target $${target} · stop -$${stop}`);
    while (botRunningRef.current) {
      try {
        const won = await placeAndSettle(direction, currentStakeRef.current);
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
      {/* Trade type tabs — fit 4 in row, no horizontal scroll */}
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

      {/* Index header */}
      <div className="relative">
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
                {chartTickMs <= 280
                  ? "rapid 1s ticks"
                  : chartTickMs >= 800
                    ? "slow session"
                    : "live synthetic ticks"}
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
                  {m.tickMs <= 260 ? "1s" : "standard"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-2 h-56">
        <LiveChart
          basePrice={market.basePrice}
          volatility={chartVolatility}
          tickMs={chartTickMs}
          onPrice={setPrice}
          badge={`${currentDigit}`}
          badgeTone={badgeTone}
          className="h-full"
        />
      </div>

      {/* Tick trail — shows each tick's last digit colored by win/loss */}
      <div className="bg-card border border-border rounded-xl px-2 py-2 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider shrink-0 mr-1">
          Ticks
        </span>
        {tickTrail.length === 0 && <span className="text-xs text-muted-foreground">waiting…</span>}
        {tickTrail.map((t, i) => (
          <span
            key={i}
            className={
              "shrink-0 h-7 w-7 grid place-items-center rounded-full text-xs font-extrabold tabular-nums border " +
              (t.tone === "bull"
                ? "bg-bull text-bull-foreground border-bull glow-bull"
                : t.tone === "bear"
                  ? "bg-bear text-bear-foreground border-bear glow-bear"
                  : "bg-surface border-border text-muted-foreground")
            }
          >
            {t.d}
          </span>
        ))}
      </div>

      {/* Digit stats — circles like Deriv */}
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
          {showDigitPicker && (
            <>
              <div className="text-[10px] uppercase text-muted-foreground text-center font-bold tracking-wider">
                Select digit (0-9)
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
            </>
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
          <User className="h-4 w-4" /> Manual Trading
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
          <Bot className="h-4 w-4" /> Smart Trading Bot
        </button>
      </div>

      {/* Stake */}
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

      <div className="grid grid-cols-6 gap-1.5">
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
          <BotField
            label="Target profit"
            prefix="$"
            value={target}
            onChange={setTarget}
            accent="text-bull"
          />
          <BotField
            label="Stop loss"
            prefix="$"
            value={stop}
            onChange={setStop}
            accent="text-bear"
          />
          <BotField
            label="Multiplier"
            prefix="x"
            value={martingale}
            onChange={setMartingale}
            accent="text-primary"
          />
        </div>
      )}

      {/* Action buttons */}
      {botRunning ? (
        <button
          onClick={stopBot}
          className="w-full py-4 rounded-2xl bg-bear text-bear-foreground font-extrabold text-lg glow-bear flex items-center justify-center gap-2"
        >
          <Square className="h-5 w-5" /> STOP BOT · session ${sessionPnLRef.current.toFixed(2)}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 pt-1">
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
  );
}

function profitRateForContract(type: TradeType, direction: string) {
  if (type === "Buy/Sell" || type === "Even/Odd") return 0.7;
  if (type === "Matches/Differs") return direction === "MATCH" ? 4 : 0.06;
  return DEFAULT_WIN_PROFIT_RATE;
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
