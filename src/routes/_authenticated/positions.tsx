import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
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

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
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

      <div className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
        <TabBtn active={tab === "open"} onClick={() => setTab("open")}>Open ({open.length})</TabBtn>
        <TabBtn active={tab === "closed"} onClick={() => setTab("closed")}>Closed ({closed.length})</TabBtn>
        <TabBtn active={tab === "transactions"} onClick={() => setTab("transactions")}>Transactions</TabBtn>
      </div>

      {tab === "open" && (
        open.length === 0
          ? <Empty>No open contracts. Place a trade to see it here.</Empty>
          : <TradeList list={open} />
      )}
      {tab === "closed" && (
        closed.length === 0
          ? <Empty>No settled trades yet.</Empty>
          : <TradeList list={closed} />
      )}
      {tab === "transactions" && (
        (txns.data ?? []).length === 0
          ? <Empty>No transactions yet.</Empty>
          : <TxnList list={txns.data ?? []} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
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
