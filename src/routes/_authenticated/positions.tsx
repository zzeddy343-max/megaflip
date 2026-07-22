import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, BarChart3, Bell, Clock3, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, releaseStaleBinaryTrades } from "@/lib/trades.functions";

export const Route = createFileRoute("/_authenticated/positions")({
  component: PositionsPage,
});

type Trade = {
  id: string;
  module: "forex" | "binary" | "aviator" | "predict" | "crypto";
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

type PositionsTab = "open" | "closed" | "tx";

type TransactionRowData = {
  id: string;
  title: "Stake" | "Win" | "Loss";
  trade: Trade;
  amount: number;
  tone: "plain" | "win" | "loss";
};

function PositionsPage() {
  const [tab, setTab] = useState<PositionsTab>("open");
  const releaseStale = useServerFn(releaseStaleBinaryTrades);
  const fetchProfile = useServerFn(getMyProfile);
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    refetchInterval: 5000,
  });

  const { data: trades = [] } = useQuery({
    queryKey: ["trades"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as Trade[];
    },
    refetchInterval: 1500,
  });

  useEffect(() => {
    let stopped = false;
    async function releaseStuckContracts() {
      try {
        const result = await releaseStale({});
        if (!stopped && Number(result?.released ?? 0) > 0) {
          qc.invalidateQueries({ queryKey: ["trades"] });
          qc.invalidateQueries({ queryKey: ["binary-positions"] });
          qc.invalidateQueries({ queryKey: ["profile"] });
        }
      } catch {
        // The UI still removes expired binary rows from Open while the next sweep retries.
      }
    }

    releaseStuckContracts();
    const interval = window.setInterval(releaseStuckContracts, 5000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [qc, releaseStale]);

  const liveOpenTrades = useMemo(
    () => trades.filter((trade) => trade.status === "open" && isLiveOpenTrade(trade)),
    [trades],
  );
  const closedTrades = useMemo(
    () => trades.filter((trade) => isClosedStatus(trade.status)),
    [trades],
  );
  const transactionRows = useMemo(
    () => trades.flatMap(buildTransactionRows),
    [trades],
  );

  const visibleTrades = tab === "open" ? liveOpenTrades : closedTrades;
  const balance = Number(
    (profile?.active_account === "demo" ? profile?.demo_balance_usd : profile?.balance_usd) ?? 0,
  );

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
      <PositionsHeader balance={balance} />

      <div className="grid h-[74px] shrink-0 grid-cols-3 border-y border-[var(--color-border)] bg-[var(--color-surface)] text-[15px] font-extrabold sm:text-lg">
        {[
          { k: "open" as const, label: `Open (${liveOpenTrades.length})` },
          { k: "closed" as const, label: `Closed (${closedTrades.length})` },
          { k: "tx" as const, label: "Transactions" },
        ].map((item) => (
          <button
            key={item.k}
            onClick={() => setTab(item.k)}
            className={
              "relative text-center transition " +
              (tab === item.k
                ? "text-[var(--color-bull)] after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:rounded-full after:bg-[var(--color-bull)]"
                  : "text-[var(--muted-foreground)]"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto bg-[#090D14]">
        {tab === "tx" ? (
          transactionRows.length > 0 ? (
            <div className="mx-auto max-w-5xl space-y-3 px-3 py-4 pb-32">
              {transactionRows.map((row) => (
                <TransactionRow key={row.id} row={row} />
              ))}
            </div>
          ) : (
            <div className="mx-auto max-w-5xl px-3 py-8 text-center text-sm text-[#7F8899]">
              <div className="mb-2 font-semibold text-[#F4F7FB]">No transactions yet</div>
              <div>Transactions will appear here when trades are placed or settled.</div>
            </div>
          )
        ) : visibleTrades.length > 0 ? (
          <div className="mx-auto max-w-5xl space-y-3 px-3 py-4 pb-32">
            {visibleTrades.map((trade) => (
              <PositionCard key={trade.id} trade={trade} active={tab === "open"} />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl px-3 py-8 text-center text-sm text-[#7F8899]">
            <div className="mb-2 font-semibold text-[#F4F7FB]">No {tab === 'open' ? 'open positions' : 'closed positions'}</div>
            <div>{tab === 'open' ? 'Open binary contracts will appear here while waiting to settle.' : 'Closed contracts will appear here once settled.'}</div>
          </div>
        )}
      </main>

      <PositionsFooter openCount={liveOpenTrades.length} trades={trades} />
    </div>
  );
}

function PositionsHeader({ balance }: { balance: number }) {
  return (
    <header className="flex h-[74px] shrink-0 items-center gap-3 border-b border-[#1F2633] bg-[#10161F] px-4">
      <button className="grid h-11 w-11 place-items-center rounded-xl text-[#A8B0C0]" aria-label="Menu">
        <Menu className="h-7 w-7" />
      </button>
      <Link to="/binary" className="flex min-w-0 items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#05CFAA] text-lg font-black text-white">
          B
        </span>
        <span className="hidden text-xl font-extrabold text-white sm:inline">Beta</span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <button className="hidden h-10 rounded-full bg-[#05CFAA] px-5 text-sm font-extrabold text-white sm:inline-flex sm:items-center">
          Deposit
        </button>
        <div className="flex h-10 items-center gap-2 rounded-full border border-[#2B3341] bg-[#1B222E] px-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#3A3121] text-xs font-black text-[#D7A822]">
            D
          </span>
          <span className="text-sm font-extrabold tabular-nums text-white sm:text-base">${balance.toFixed(2)}</span>
        </div>
        <Bell className="h-6 w-6 text-[#8F99AA]" />
      </div>
    </header>
  );
}

function PositionCard({ trade, active }: { trade: Trade; active: boolean }) {
  const won = isWinningTrade(trade);
  const ticks = getSettlementTicks(trade);
  const direction = normalizeDirection(trade.direction);
  const directionBear = isBearDirection(trade.direction);

  return (
    <div className="rounded-[22px] border border-[#242B38] bg-[#151A24] px-5 py-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-extrabold text-[#F4F7FB]">{shortMarket(trade.market)}</span>
            <span
              className={
                "rounded-lg px-3 py-1 text-sm font-bold " +
                (directionBear ? "bg-[#351729] text-[#F16488]" : "bg-[#07362F] text-[#18C99A]")
              }
            >
              {titleCase(direction)}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {active ? (
            <div className="text-base font-semibold text-[#5D6677]">Tick 0/{ticks}</div>
          ) : (
            <div className={"text-base font-bold " + (won ? "text-[#18C99A]" : "text-[#F16488]")}>
              {won ? "Won" : "Lost"}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_1fr_auto] gap-4">
        <CardMetric label="Stake" value={`$${Number(trade.stake).toFixed(2)}`} />
        <CardMetric label="Payout" value={`$${potentialPayout(trade).toFixed(2)}`} />
        <div className="text-right">
          <div className="text-sm text-[#5D6677]">P/L</div>
          <div
            className={
              "mt-1 text-2xl font-extrabold tabular-nums " +
              (active || !won ? "text-[#F16488]" : "text-[#18C99A]")
            }
          >
            {active ? `-${Number(trade.stake).toFixed(2)}` : formatSigned(tradePnl(trade))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ row }: { row: TransactionRowData }) {
  return (
    <div className="flex min-h-[86px] items-center gap-4 rounded-[22px] border border-[#242B38] bg-[#151A24] px-5 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
      <div
        className={
          "grid h-14 w-14 shrink-0 place-items-center rounded-xl " +
          (row.tone === "win"
            ? "bg-[#07362F] text-[#18C99A]"
            : row.tone === "loss"
              ? "bg-[#351729] text-[#F16488]"
              : "bg-[#1C222D] text-[#7C8799]")
        }
      >
        {row.tone === "win" ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-lg font-extrabold text-[#F4F7FB]">{row.title}</span>
          <span className="truncate rounded-md bg-[#1D2430] px-2 py-1 text-xs uppercase text-[#7F8899]">
            {shortMarket(row.trade.market)}
          </span>
          <span className="truncate text-xs uppercase text-[#6F7889]">
            {normalizeDirection(row.trade.direction).toUpperCase()}
          </span>
        </div>
        <div className="mt-1 text-sm text-[#5D6677]">{formatTradeTime(row.trade.created_at)}</div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={
            "text-2xl font-extrabold tabular-nums " +
            (row.tone === "win" ? "text-[#18C99A]" : row.tone === "loss" ? "text-[#F16488]" : "text-[#F4F7FB]")
          }
        >
          {formatSigned(row.amount)}
        </div>
        <div className="mt-1 text-sm text-[#5D6677]">{formatBalance(row.trade)}</div>
      </div>
    </div>
  );
}

function PositionsFooter({ openCount, trades }: { openCount: number; trades: Trade[] }) {
  const wins = trades.filter((trade) => isClosedStatus(trade.status) && isWinningTrade(trade)).length;
  const losses = trades.filter((trade) => isClosedStatus(trade.status) && !isWinningTrade(trade)).length;
  const pnl = trades.filter((trade) => isClosedStatus(trade.status)).reduce((sum, trade) => sum + tradePnl(trade), 0);

  return (
    <footer className="shrink-0 border-t border-[#1F2633] bg-[#121720]">
      <div className="flex h-16 items-center justify-between border-b border-[#1F2633] px-5 text-sm font-semibold">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F0B913]" />
          <span className="text-[#F0B913]">Auto-Trading</span>
          <span className="truncate text-[#4F5869]">{trades.length}t · {wins}W / {losses}L</span>
        </div>
        <span className={(pnl >= 0 ? "text-[#18C99A]" : "text-[#F16488]") + " text-xl font-extrabold tabular-nums"}>
          {formatSigned(pnl)}
        </span>
      </div>

      <nav className="mx-auto grid h-[78px] max-w-xl grid-cols-2">
        <Link to="/binary" className="flex flex-col items-center justify-center gap-1 text-[#5D6677]">
          <BarChart3 className="h-7 w-7" />
          <span className="text-sm font-extrabold">Trade</span>
        </Link>
        <Link to="/positions" className="relative flex flex-col items-center justify-center gap-1 text-[#18C99A]">
          <span className="relative">
            <Clock3 className="h-8 w-8" />
            {openCount > 0 && (
              <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[#FF2E72] text-xs font-black text-white">
                {openCount}
              </span>
            )}
          </span>
          <span className="text-sm font-extrabold">Positions</span>
        </Link>
      </nav>
    </footer>
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

function buildTransactionRows(trade: Trade): TransactionRowData[] {
  const rows: TransactionRowData[] = [
    {
      id: `${trade.id}-stake`,
      title: "Stake",
      trade,
      amount: -Number(trade.stake),
      tone: "plain",
    },
  ];

  if (isClosedStatus(trade.status)) {
    const pnl = tradePnl(trade);
    rows.unshift({
      id: `${trade.id}-result`,
      title: pnl > 0 ? "Win" : "Loss",
      trade,
      amount: pnl,
      tone: pnl > 0 ? "win" : "loss",
    });
  }

  return rows;
}

function isClosedStatus(status: string) {
  return ["won", "lost", "closed", "cancelled", "settled"].includes(status);
}

function isLiveOpenTrade(trade: Trade) {
  if (trade.module !== "binary") return true;
  return Date.now() - new Date(trade.created_at).getTime() < getMaxOpenMs(trade);
}

function getMaxOpenMs(trade: Trade) {
  const configured = Number(trade.meta?.max_open_ms ?? 60_000);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 60_000) : 60_000;
}

function getSettlementTicks(trade: Trade) {
  const ticks = Number(trade.meta?.settlement_ticks ?? 1);
  return Number.isFinite(ticks) && ticks > 0 ? ticks : 1;
}

function isWinningTrade(trade: Trade) {
  return trade.status === "won" || tradePnl(trade) > 0;
}

function tradePnl(trade: Trade) {
  return Number(trade.payout ?? 0) - Number(trade.stake);
}

function potentialPayout(trade: Trade) {
  return Number(trade.payout ?? 0) > 0 ? Number(trade.payout) : Number(trade.stake) * 1.952;
}

function shortMarket(market: string) {
  return market.replace("Volatility ", "V").replace("Vol ", "V").replace(" Index", "");
}

function normalizeDirection(value: string) {
  return titleCase(value);
}

function isBearDirection(value: string) {
  return ["sell", "odd", "under", "differ", "differs", "lost", "loss"].includes(value.toLowerCase());
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTradeTime(value: string) {
  return `Today ${new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function formatSigned(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

function formatBalance(trade: Trade) {
  const seed = Number(trade.entry_price ?? 0) + Number(trade.payout ?? 0) + Number(trade.stake ?? 0);
  return (9300 + (seed % 120)).toFixed(2);
}
