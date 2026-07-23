import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { closeTradeAtPrice } from "@/lib/trades.functions";
import { supabase } from "@/integrations/supabase/client";

type Position = {
  id: string;
  module: string;
  market: string;
  direction: string;
  stake: number;
  entry_price: number | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  module: "forex" | "crypto";
  market: string;
  livePrice: number;
  digits?: number;
};

export function OpenPositionLines({ module, market, livePrice, digits = 2 }: Props) {
  const { data: positions = [] } = useOpenPositions(module, market);
  const visible = positions.filter((p) => Number(p.entry_price) > 0 && livePrice > 0).slice(0, 3);
  if (!visible.length) return null;

  const prices = visible.flatMap((p) => [Number(p.entry_price), livePrice]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.18 || livePrice * 0.001 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const y = (value: number) => `${100 - ((value - lo) / (hi - lo || 1)) * 100}%`;

  return (
    <div className="absolute inset-2 pointer-events-none">
      {visible.map((p) => {
        const entry = Number(p.entry_price);
        const pnl = estimatePnl(p, livePrice);
        const positive = pnl >= 0;
        return (
          <div key={p.id}>
            <div
              className="absolute left-0 right-0 border-t border-dashed border-primary/80"
              style={{ top: y(entry) }}
            >
              <span className="absolute left-1 -translate-y-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {p.direction} {entry.toFixed(digits)}
              </span>
            </div>
            <div
              className={
                "absolute left-0 right-0 border-t " + (positive ? "border-bull" : "border-bear")
              }
              style={{ top: y(livePrice) }}
            >
              <span
                className={
                  "absolute right-1 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-bold " +
                  (positive ? "bg-bull text-bull-foreground" : "bg-bear text-bear-foreground")
                }
              >
                ${pnl.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OpenPositionsPanel({ module, market, livePrice, digits = 2 }: Props) {
  const { data: positions = [] } = useOpenPositions(module, market);
  const closeAtPrice = useServerFn(closeTradeAtPrice);
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  if (!positions.length) return null;

  async function closePosition(position: Position) {
    if (!livePrice) {
      toast.error("Live price not available");
      return;
    }
    setClosing(position.id);
    try {
      const result = await closeAtPrice({ data: { trade_id: position.id, exit_price: livePrice } });
      toast.success(
        `Closed ${position.market} ${position.direction} ${money(Number(result.pnl ?? 0))}`,
      );
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["open-positions", module, market] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not close position");
    } finally {
      setClosing(null);
    }
  }

  return (
    <div className="space-y-2">
      {positions.map((p) => {
        const isOpen = expanded === p.id;
        const entry = Number(p.entry_price ?? 0);
        const pnl = livePrice && entry ? estimatePnl(p, livePrice) : 0;
        const positive = pnl >= 0;
        return (
          <div key={p.id} className="rounded-xl border border-border bg-card">
            <button
              onClick={() => setExpanded(isOpen ? null : p.id)}
              className="w-full flex items-center justify-between gap-3 p-3 text-left"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold">
                  {p.market}{" "}
                  <span className={isLong(p.direction) ? "text-bull" : "text-bear"}>
                    {p.direction}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Entry {entry.toFixed(digits)} - Now {livePrice.toFixed(digits)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={
                    "text-right text-sm font-extrabold tabular-nums " +
                    (positive ? "text-bull" : "text-bear")
                  }
                >
                  {money(pnl)}
                </div>
                <ChevronDown
                  className={
                    "h-4 w-4 text-muted-foreground transition " + (isOpen ? "rotate-180" : "")
                  }
                />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border p-3 grid grid-cols-3 gap-2 items-end">
                <Info label="Stake" value={`$${Number(p.stake).toFixed(2)}`} />
                <Info label={module === "forex" ? "Lot" : "Lev"} value={metaValue(p, module)} />
                <button
                  onClick={() => closePosition(p)}
                  disabled={closing === p.id}
                  className="h-10 rounded-xl bg-bear text-bear-foreground text-xs font-extrabold flex items-center justify-center gap-1 disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                  {closing === p.id ? "Closing" : "Close"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useOpenPositions(module: "forex" | "crypto", market: string) {
  return useQuery({
    queryKey: ["open-positions", module, market],
    queryFn: async () => {
      const { data } = await supabase
        .from("trades")
        .select("id,module,market,direction,stake,entry_price,meta,created_at")
        .eq("module", module)
        .eq("market", market)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      return (data ?? []) as Position[];
    },
    refetchInterval: 2500,
  });
}

function estimatePnl(position: Position, livePrice: number) {
  const entry = Number(position.entry_price ?? 0);
  if (!entry || !livePrice) return 0;
  if (position.module === "forex") {
    const pip = position.market.includes("JPY") ? 0.01 : 0.0001;
    const fallbackLot = Number(position.stake) / 100 || 0.01;
    const lot = Number(position.meta?.lot ?? fallbackLot);
    return ((isLong(position.direction) ? livePrice - entry : entry - livePrice) / pip) * lot * 10;
  }
  const leverage = Number(position.meta?.leverage ?? 1);
  return (
    ((isLong(position.direction) ? livePrice - entry : entry - livePrice) / entry) *
    Number(position.stake) *
    leverage
  );
}

function isLong(direction: string) {
  return ["BUY", "LONG"].includes(direction.toUpperCase());
}

function money(value: number) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function metaValue(position: Position, module: "forex" | "crypto") {
  if (module === "forex") return String(position.meta?.lot ?? "0.01");
  return `${Number(position.meta?.leverage ?? 1)}x`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
