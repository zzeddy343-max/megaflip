import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, History, Plane, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { cancelTrade, placeTrade, settleTrade } from "@/lib/trades.functions";
import { getAviatorServerTime } from "@/lib/aviator.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/aviator")({
  component: AviatorPage,
});

type Phase = "waiting" | "flying" | "crashed";

const WAIT_MS = 5_000;
const FLY_MS = 12_000;
const CRASH_DISPLAY_MS = 1_600;
const ROUND_MS = WAIT_MS + FLY_MS;
const TICK_MS = 100;
const MAX_CRASH = multiplierAt(FLY_MS);

function multiplierAt(flightMs: number) {
  return Math.max(1, Math.pow(1.07, (flightMs / 1000) * 3));
}

function seededRandom(seed: number) {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function crashForRound(roundId: number) {
  const r = Math.max(0.0001, seededRandom(roundId));
  const raw = 1 / (1 - r * 0.93);
  return Math.min(MAX_CRASH, Math.max(1, +raw.toFixed(2)));
}

function flightMsForCrash(crashAt: number) {
  return Math.min(FLY_MS, Math.ceil((Math.log(crashAt) / (3 * Math.log(1.07))) * 1000));
}

function getRoundState(now: number) {
  const roundId = Math.floor(now / ROUND_MS);
  const elapsed = now - roundId * ROUND_MS;
  const crashAt = crashForRound(roundId);
  const crashMs = flightMsForCrash(crashAt);

  if (elapsed < WAIT_MS) {
    return {
      roundId,
      phase: "waiting" as const,
      countdown: Math.ceil((WAIT_MS - elapsed) / 1000),
      flightElapsed: 0,
      multiplier: 1,
      crashAt,
    };
  }

  const flightElapsed = Math.min(elapsed - WAIT_MS, crashMs);
  const crashed = elapsed - WAIT_MS >= crashMs;
  if (crashed && elapsed - WAIT_MS - crashMs > CRASH_DISPLAY_MS) {
    return {
      roundId: roundId + 1,
      phase: "waiting" as const,
      countdown: Math.ceil((ROUND_MS - elapsed) / 1000),
      flightElapsed: 0,
      multiplier: 1,
      crashAt: crashForRound(roundId + 1),
    };
  }

  return {
    roundId,
    phase: crashed ? ("crashed" as const) : ("flying" as const),
    countdown: 0,
    flightElapsed,
    multiplier: crashed ? crashAt : Math.min(crashAt, multiplierAt(flightElapsed)),
    crashAt,
  };
}

function roundHistory(roundId: number) {
  return Array.from({ length: 12 }, (_, i) => crashForRound(roundId - i - 1));
}

function AviatorPage() {
  const serverTime = useServerFn(getAviatorServerTime);
  const place = useServerFn(placeTrade);
  const settle = useServerFn(settleTrade);
  const cancel = useServerFn(cancelTrade);
  const qc = useQueryClient();

  const [now, setNow] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const [stake, setStake] = useState(10);
  const [autoBet, setAutoBet] = useState(false);
  const [autoCashout, setAutoCashout] = useState(2.0);
  const [betActive, setBetActive] = useState(false);
  const [cashedAt, setCashedAt] = useState<number | null>(null);

  const tradeIdRef = useRef<string | null>(null);
  const tradeRoundRef = useRef<number | null>(null);
  const autoBetRoundRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function syncClock() {
      try {
        const before = Date.now();
        const res = await serverTime();
        const after = Date.now();
        const midpoint = before + (after - before) / 2;
        if (mounted) setServerOffset(res.now - midpoint);
      } catch {
        if (mounted) setServerOffset(0);
      }
    }

    syncClock();
    const syncId = setInterval(syncClock, 30_000);
    return () => {
      mounted = false;
      clearInterval(syncId);
    };
  }, [serverTime]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + serverOffset), TICK_MS);
    return () => clearInterval(id);
  }, [serverOffset]);

  const state = useMemo(() => getRoundState(now), [now]);
  const history = useMemo(() => roundHistory(state.roundId), [state.roundId]);
  const { phase, multiplier, crashAt, countdown, roundId } = state;

  useEffect(() => {
    setCashedAt(null);
    if (tradeRoundRef.current !== null && tradeRoundRef.current !== roundId) {
      tradeIdRef.current = null;
      tradeRoundRef.current = null;
      setBetActive(false);
    }
  }, [roundId]);

  useEffect(() => {
    if (
      phase === "crashed" &&
      betActive &&
      tradeIdRef.current &&
      tradeRoundRef.current === roundId
    ) {
      const tradeId = tradeIdRef.current;
      tradeIdRef.current = null;
      tradeRoundRef.current = null;
      setBetActive(false);
      settle({ data: { trade_id: tradeId, won: false, multiplier: 1 } })
        .then(() => {
          toast.error(`Crashed at ${crashAt.toFixed(2)}x - lost $${stake}`);
          qc.invalidateQueries({ queryKey: ["profile"] });
          qc.invalidateQueries({ queryKey: ["trades"] });
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
    }
  }, [phase, betActive, roundId, crashAt, stake, settle, qc]);

  useEffect(() => {
    if (phase === "flying" && betActive && multiplier >= autoCashout && !cashedAt) {
      cashout();
    }
  }, [multiplier, phase, betActive, autoCashout, cashedAt]);

  useEffect(() => {
    if (!autoBet || phase !== "waiting" || betActive || autoBetRoundRef.current === roundId) return;
    autoBetRoundRef.current = roundId;
    bet();
  }, [autoBet, phase, betActive, roundId]);

  async function bet() {
    if (phase !== "waiting" || betActive) return;
    try {
      const t = await place({
        data: {
          module: "aviator",
          market: "Aviator",
          direction: "FLY",
          stake,
          entry_price: crashAt,
          meta: { round_id: roundId, crash_at: crashAt },
        },
      });
      tradeIdRef.current = t.id;
      tradeRoundRef.current = roundId;
      setBetActive(true);
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function cashout() {
    if (
      !betActive ||
      !tradeIdRef.current ||
      phase !== "flying" ||
      tradeRoundRef.current !== roundId
    )
      return;
    const m = Math.min(multiplier, crashAt);
    const tradeId = tradeIdRef.current;
    setCashedAt(m);
    setBetActive(false);
    tradeIdRef.current = null;
    tradeRoundRef.current = null;

    try {
      await settle({ data: { trade_id: tradeId, won: true, multiplier: m } });
      toast.success(`Cashed out @ ${m.toFixed(2)}x = $${(stake * m).toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function cancelBet() {
    if (
      !betActive ||
      !tradeIdRef.current ||
      phase !== "waiting" ||
      tradeRoundRef.current !== roundId
    )
      return;
    const tradeId = tradeIdRef.current;
    tradeIdRef.current = null;
    tradeRoundRef.current = null;
    setBetActive(false);
    setCashedAt(null);
    try {
      await cancel({ data: { trade_id: tradeId } });
      toast.success(`Bet cancelled - $${stake} returned`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  const progress = Math.min(0.92, Math.log(Math.max(1, multiplier)) / Math.log(MAX_CRASH));
  const planeX = 8 + progress * 78;
  const planeY = 78 - progress * 60;
  const curvePath = `M 8 78 Q ${(8 + planeX) / 2} 78 ${planeX} ${planeY}`;

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>
          {phase === "waiting"
            ? `Next round in ${countdown}s...`
            : phase === "flying"
              ? "In flight - cash out anytime"
              : "Round ended"}
        </span>
        <span className="text-primary font-semibold">Round #{roundId}</span>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-3 px-3">
        {history.map((h, i) => (
          <span
            key={i}
            className={
              "px-3 py-1 rounded-full text-xs font-bold tabular-nums whitespace-nowrap " +
              (h >= 2
                ? "bg-bull/20 text-bull border border-bull/40"
                : "bg-bear/15 text-bear border border-bear/30")
            }
          >
            {h.toFixed(2)}x
          </span>
        ))}
        <button className="ml-auto h-7 w-7 grid place-items-center rounded-full bg-surface text-muted-foreground">
          <History className="h-3 w-3" />
        </button>
      </div>

      <div className="relative h-72 rounded-2xl bg-gradient-to-br from-[oklch(0.18_0.05_265)] to-[oklch(0.10_0.04_280)] border border-border overflow-hidden">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="absolute h-0.5 w-0.5 bg-white rounded-full opacity-70"
            style={{ top: `${(i * 37) % 100}%`, left: `${(i * 53) % 100}%` }}
          />
        ))}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 75% 35%, oklch(0.78 0.13 86 / 0.45), transparent 50%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,transparent,oklch(0.08_0.02_250)_58%)]" />
        <div className="absolute left-4 right-4 bottom-7 h-1 rounded-full bg-primary/40 shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_50%,transparent)]" />
        <div className="absolute left-7 bottom-7 h-8 w-10 rounded-t-lg border border-primary/35 bg-surface/70">
          <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-bull live-dot" />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
        </div>
        {phase === "waiting" && (
          <Plane
            className="absolute h-12 w-12 text-primary/90 drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
            style={{
              left: "calc(9% - 24px)",
              top: "calc(78% - 24px)",
              transform: "rotate(-10deg)",
            }}
          />
        )}

        {phase !== "waiting" && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            <defs>
              <linearGradient id="trail" x1="0" x2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0" />
                <stop offset="100%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="trail-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${curvePath} L ${planeX} 100 L 8 100 Z`} fill="url(#trail-fill)" />
            <path
              d={curvePath}
              fill="none"
              stroke="url(#trail)"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {phase === "flying" && (
          <Plane
            className="absolute h-14 w-14 plane-fly text-primary drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
            style={{
              left: `calc(${planeX}% - 28px)`,
              top: `calc(${planeY}% - 28px)`,
              transition: "left 100ms linear, top 100ms linear",
            }}
          />
        )}
        {phase === "crashed" && (
          <Plane
            className="absolute h-14 w-14 text-bear opacity-60"
            style={{
              left: `calc(${planeX}% - 28px)`,
              top: `calc(${planeY}% - 28px)`,
              transform: "rotate(70deg)",
            }}
          />
        )}

        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            {phase === "crashed" ? (
              <>
                <div className="text-bear text-2xl font-extrabold animate-pulse">FLEW AWAY!</div>
                <div
                  className="text-bear text-6xl font-black tabular-nums"
                  style={{ textShadow: "0 0 30px oklch(0.66 0.24 22 / 0.8)" }}
                >
                  {multiplier.toFixed(2)}x
                </div>
              </>
            ) : phase === "flying" ? (
              <div
                className="text-7xl font-black tabular-nums text-primary"
                style={{ textShadow: "0 0 40px color-mix(in oklab, var(--gold) 70%, transparent)" }}
              >
                {multiplier.toFixed(2)}x
              </div>
            ) : (
              <div className="text-center">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">
                  Next round
                </div>
                <div className="text-6xl font-black text-primary tabular-nums">{countdown}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="text-center text-sm text-muted-foreground">
          {betActive && phase === "waiting"
            ? "Bet placed - you can cancel before launch"
            : betActive
              ? "Bet active - waiting to cash out"
              : cashedAt
                ? `Cashed out @ ${cashedAt.toFixed(2)}x`
                : "Place your bet"}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStake(Math.max(1, stake - 1))}
            className="h-10 w-10 rounded-xl bg-surface border border-border"
          >
            -
          </button>
          <input
            type="number"
            value={stake}
            onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
            className="flex-1 bg-surface border border-border rounded-xl py-2 text-center font-bold text-lg tabular-nums"
          />
          <button
            onClick={() => setStake(stake + 1)}
            className="h-10 w-10 rounded-xl bg-surface border border-border"
          >
            +
          </button>
        </div>

        {phase === "waiting" && betActive ? (
          <button
            onClick={cancelBet}
            className="w-full py-4 rounded-2xl bg-bear text-bear-foreground font-extrabold text-lg glow-bear flex items-center justify-center gap-2"
          >
            <X className="h-5 w-5" /> CANCEL BET
          </button>
        ) : phase === "flying" && betActive ? (
          <button
            onClick={cashout}
            className="w-full py-4 rounded-2xl bg-bull text-bull-foreground font-extrabold text-lg glow-bull"
          >
            CASH OUT ${(stake * multiplier).toFixed(2)}
          </button>
        ) : (
          <button
            onClick={bet}
            disabled={phase !== "waiting" || betActive}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-extrabold text-lg glow-primary disabled:opacity-50"
          >
            {phase === "waiting" ? `BET $${stake}` : "WAIT FOR NEXT ROUND"}
          </button>
        )}

        <div className="flex items-center justify-between bg-surface rounded-xl p-3 border border-border">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Auto Bet</span>
          </div>
          <button
            onClick={() => setAutoBet(!autoBet)}
            className={
              "h-6 w-11 rounded-full transition relative " + (autoBet ? "bg-primary" : "bg-border")
            }
          >
            <span
              className={
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition " +
                (autoBet ? "left-5" : "left-0.5")
              }
            />
          </button>
        </div>

        <div className="flex items-center justify-between bg-surface rounded-xl p-3 border border-border">
          <span className="text-sm font-semibold">Auto cash out</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoCashout(Math.max(1.1, +(autoCashout - 0.1).toFixed(2)))}
              className="h-7 w-7 rounded bg-card"
            >
              -
            </button>
            <span className="font-bold tabular-nums w-14 text-center">
              {autoCashout.toFixed(2)}x
            </span>
            <button
              onClick={() => setAutoCashout(+(autoCashout + 0.1).toFixed(2))}
              className="h-7 w-7 rounded bg-card"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
