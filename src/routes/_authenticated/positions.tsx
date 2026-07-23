import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, TrendingUp } from "lucide-react";
import {
  listMyTrades,
  listMyTransactions,
  releaseStaleBinaryTrades,
} from "@/lib/trades.functions";
import { formatUSD, formatPrice } from "@/lib/format";
import { MARKETS, type MarketId } from "@/lib/markets";

export const Route = createFileRoute("/_authenticated/positions")({
  head: () => ({
    meta: [
      { title: "Positions & History — Tronix Option" },
      { name: "description", content: "Review open positions, settled binary contracts, payouts, and wallet transaction history." },
      { property: "og:title", content: "Positions & History — Tronix Option" },
      { property: "og:description", content: "Track open trades, closed outcomes, payouts, and account transaction history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Positions,
});

type Tab = "open" | "closed" | "transactions";

function Positions() {
  const [tab, setTab] = useState<Tab>("open");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchTrades = useServerFn(listMyTrades);
  const fetchTxns = useServerFn(listMyTransactions);
  const releaseStale = useServerFn(releaseStaleBinaryTrades);

  const trades = useQuery({
    queryKey: ["my-trades"],
    queryFn: () => fetchTrades(),
    refetchInterval: 3000,
  });
  const txns = useQuery({
    queryKey: ["my-txns"],
    queryFn: () => fetchTxns(),
    refetchInterval: 5000,
  });

  useEffect(() => {
    const id = setInterval(() => {
      releaseStale().then((r) => {
        if (r.released > 0) {
          qc.invalidateQueries({ queryKey: ["my-trades"] });
          qc.invalidateQueries({ queryKey: ["wallet"] });
          qc.invalidateQueries({ queryKey: ["my-txns"] });
        }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [releaseStale, qc]);

  const list = trades.data ?? [];
  const open = list.filter((t) => t.status === "open");
  const closed = list.filter((t) => t.status !== "open");
  const txList = txns.data ?? [];
  const session = getSessionStats(closed);
  const activeList = tab === "open" ? open : tab === "closed" ? closed : txList;
  const emptyText =
    tab === "open"
      ? "No open contracts. Place a trade to see it here."
      : tab === "closed"
        ? "No settled trades yet."
        : "No transactions yet.";

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-4 sm:block sm:overflow-y-auto sm:px-6 sm:py-6">
      <div className="mb-5 flex items-center gap-3 sm:mb-6">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else navigate({ to: "/binary" });
          }}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-foreground transition hover:border-primary/60 hover:text-primary lg:hidden"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-2xl font-semibold">Positions</h1>
      </div>

      <div className="mb-4 grid grid-cols-3 rounded-2xl border border-border bg-surface p-1 shadow-[0_0_24px_color-mix(in_oklab,var(--gold)_10%,transparent)] sm:inline-flex sm:rounded-lg">
        <TabBtn active={tab === "open"} onClick={() => setTab("open")}>Open ({open.length})</TabBtn>
        <TabBtn active={tab === "closed"} onClick={() => setTab("closed")}>Closed ({closed.length})</TabBtn>
        <TabBtn active={tab === "transactions"} onClick={() => setTab("transactions")}>Transactions</TabBtn>
      </div>

      <div className="hidden sm:block">
        {tab === "open" && (open.length === 0 ? <Empty>{emptyText}</Empty> : <TradeList list={open} />)}
        {tab === "closed" && (closed.length === 0 ? <Empty>{emptyText}</Empty> : <TradeList list={closed} />)}
        {tab === "transactions" && (txList.length === 0 ? <Empty>{emptyText}</Empty> : <TxnList list={txList} />)}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_0_24px_color-mix(in_oklab,var(--gold)_8%,transparent)] sm:hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeList.length === 0 && (
            <div className="flex min-h-[260px] items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          )}
          {tab !== "transactions" &&
            activeList.map((trade: any) => <MobileTradeCard key={trade.id} trade={trade} />)}
          {tab === "transactions" &&
            activeList.map((txn: any) => <MobileTxnRow key={txn.id} txn={txn} />)}
        </div>
        <MobileSessionFooter session={session} />
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`min-w-0 rounded-xl px-2 py-3 text-center text-sm font-bold transition sm:rounded-md sm:px-3 sm:py-1.5 sm:text-left sm:font-medium ${
        active
          ? "bg-surface-2 text-primary ring-1 ring-primary/40 sm:text-foreground sm:ring-0"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="block truncate">{children}</span>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function TradeList({ list }: { list: any[] }) {
  return (
    <div className="space-y-2 overflow-x-auto">
      {list.map((t) => {
        const spec = MARKETS[t.market as MarketId];
        const pnl = t.status === "won" ? t.payout_cents - t.stake_cents
                  : t.status === "lost" ? -t.stake_cents
                  : t.status === "cancelled" ? 0 : null;
        const color = t.status === "won" ? "text-bull"
                    : t.status === "lost" ? "text-bear"
                    : t.status === "open" ? "text-primary"
                    : "text-muted-foreground";
        return (
          <div key={t.id} className="grid min-w-[760px] grid-cols-5 gap-3 rounded-xl border border-border bg-surface p-4">
            <div>
              <div className="text-xs text-muted-foreground">Market</div>
              <div className="font-medium">{spec?.label ?? t.market}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Contract</div>
              <div className="font-medium capitalize">{t.contract_type.replace("_", "/")} · {t.direction}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Stake</div>
              <div className="font-mono">{formatUSD(t.stake_cents)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Entry → Exit</div>
              <div className="font-mono text-sm">
                {t.entry_price ? formatPrice(Number(t.entry_price), spec?.decimals ?? 2) : "—"}
                {" → "}
                {t.exit_price ? formatPrice(Number(t.exit_price), spec?.decimals ?? 2) : "…"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t.status}</div>
              <div className={`font-mono font-semibold ${color}`}>
                {pnl == null ? "—" : (pnl >= 0 ? "+" : "") + formatUSD(pnl)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TxnList({ list }: { list: any[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="min-w-[720px] w-full text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Time</th>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.id} className="border-t border-border">
              <td className="px-4 py-2 text-muted-foreground">{new Date(x.created_at).toLocaleString()}</td>
              <td className="px-4 py-2 capitalize">{x.type.replace("_", " ")}</td>
              <td className={`px-4 py-2 text-right font-mono ${x.amount_cents >= 0 ? "text-bull" : "text-bear"}`}>
                {x.amount_cents >= 0 ? "+" : ""}{formatUSD(x.amount_cents)}
              </td>
              <td className="px-4 py-2 text-right font-mono">{formatUSD(x.balance_after_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileTradeCard({ trade }: { trade: any }) {
  const spec = MARKETS[trade.market as MarketId];
  const status = String(trade.status ?? "open");
  const isOpen = status === "open";
  const isWon = status === "won";
  const isLost = status === "lost";
  const pnl = isWon
    ? trade.payout_cents - trade.stake_cents
    : isLost
      ? -trade.stake_cents
      : status === "cancelled"
        ? 0
        : -trade.stake_cents;
  const color = isWon ? "text-bull" : isLost ? "text-bear" : isOpen ? "text-primary" : "text-muted-foreground";
  const iconTone = isWon
    ? "bg-bull/15 text-bull"
    : isLost
      ? "bg-bear/15 text-bear"
      : "bg-primary/15 text-primary";
  const contract = `${formatContract(trade.contract_type)} / ${String(trade.direction ?? "").toUpperCase()}`;

  return (
    <div className="border-b border-border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${iconTone}`}>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-extrabold">{spec?.label ?? trade.market}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">Index / Tick {trade.ticks}</div>
          </div>
        </div>
        <div className={`shrink-0 text-right text-xs font-extrabold ${color}`}>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
          {String(trade.direction ?? status)}
        </div>
      </div>

      <div className={`mt-3 text-xs font-bold ${color}`}>
        {isOpen ? "Contract running..." : status === "cancelled" ? "Contract cancelled" : "Trade complete"}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          USD
        </div>
        <div className="truncate text-right text-xs font-bold text-primary">{contract}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
        <MobileStat label="Total profit/loss:" value={<span className={color}>{pnl >= 0 ? "+" : ""}{formatUSD(pnl)}</span>} />
        <MobileStat label="Contract value:" value={<span className={color}>{formatUSD(trade.payout_cents ?? 0)}</span>} />
        <MobileStat label="Stake:" value={formatUSD(trade.stake_cents)} />
        <MobileStat label="Potential payout:" value={formatUSD(Math.floor(trade.stake_cents * Number(trade.payout_multiplier ?? 1.95)))} />
      </div>
    </div>
  );
}

function MobileStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-extrabold">{value}</div>
    </div>
  );
}

function MobileTxnRow({ txn }: { txn: any }) {
  const kind = String(txn.type ?? "");
  const isStake = kind === "trade_stake";
  const isNegative = Number(txn.amount_cents ?? 0) < 0;
  const color = isStake ? "text-primary" : isNegative ? "text-bear" : "text-bull";
  const iconTone = isStake ? "bg-primary/15" : isNegative ? "bg-bear/15" : "bg-bull/15";
  const label = kind === "trade_stake" ? "Stake" : kind === "trade_payout" ? "Payout" : kind === "deposit" ? "Deposit" : kind.replace("_", " ");

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${iconTone} ${color}`}>
          <TrendingUp className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className={`truncate text-base font-extrabold capitalize ${color}`}>{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {new Date(txn.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`font-mono text-base font-extrabold ${color}`}>
          {txn.amount_cents >= 0 ? "+" : ""}{formatUSD(txn.amount_cents)}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Bal: {formatUSD(txn.balance_after_cents)}
        </div>
      </div>
    </div>
  );
}

function MobileSessionFooter({ session }: { session: { pl: number; wins: number; losses: number; total: number } }) {
  return (
    <div className="border-t border-border bg-background/70 px-4 py-3 text-xs backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Session
        </span>
        <span className="text-muted-foreground">
          {session.total} trades ({session.wins}W / {session.losses}L)
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-muted-foreground">Session P/L:</span>
        <span className={`font-mono font-extrabold ${session.pl >= 0 ? "text-bull" : "text-bear"}`}>
          {session.pl >= 0 ? "+" : ""}{formatUSD(session.pl)}
        </span>
      </div>
    </div>
  );
}

function getSessionStats(closedTrades: any[]) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  let pl = 0;
  let wins = 0;
  let losses = 0;

  for (const trade of closedTrades) {
    const at = new Date(trade.settled_at ?? trade.opened_at).getTime();
    if (Number.isFinite(at) && at < cutoff) continue;
    if (trade.status === "won") wins += 1;
    if (trade.status === "lost") losses += 1;
    pl += Number(trade.payout_cents ?? 0) - Number(trade.stake_cents ?? 0);
  }

  return { pl, wins, losses, total: wins + losses };
}

function formatContract(value: string) {
  return String(value ?? "contract")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("/");
}
