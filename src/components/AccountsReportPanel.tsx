import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, DollarSign, Search, TrendingUp, Users, Wallet } from "lucide-react";
import { getAccountsReport } from "@/lib/admin.functions";

type Scope = "admin" | "agent";
type Mode = "current" | "all_time";
type View = "summary" | "deposits" | "withdrawals" | "trades" | "clients";
type ClientOption = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
};
type ReportRow = Record<string, string | number | null | undefined>;

export function AccountsReportPanel({
  scope,
  mode = "current",
  title,
  initialView = "summary",
  presentation = "compact",
}: {
  scope: Scope;
  mode?: Mode;
  title?: string;
  initialView?: View;
  presentation?: "compact" | "dashboard";
}) {
  const reportFn = useServerFn(getAccountsReport);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(mode === "all_time" ? "" : today);
  const [endDate, setEndDate] = useState(mode === "all_time" ? "" : today);
  const [clientId, setClientId] = useState("");
  const [view, setView] = useState<View>(initialView);
  const [currency, setCurrency] = useState<"USD" | "KES">("USD");

  const { data, isLoading } = useQuery({
    queryKey: ["accounts-report", scope, mode, startDate, endDate, clientId],
    queryFn: () =>
      reportFn({
        data: {
          scope,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          client_id: clientId || undefined,
          mode,
        },
      }),
  });

  const clients = (data?.clients ?? []) as ClientOption[];
  const rows = useMemo(() => {
    if (view === "deposits") return data?.deposits ?? [];
    if (view === "withdrawals") return data?.withdrawals ?? [];
    if (view === "trades") return data?.trades ?? [];
    if (view === "clients") return data?.by_client ?? [];
    return [];
  }, [data, view]);

  const summary = data?.summary;
  const money = (value: unknown) => {
    const amount = Number(value ?? 0) * (currency === "KES" ? 130 : 1);
    return `${currency === "KES" ? "KES" : "USD"} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };
  const houseBalance = Number(summary?.deposits_usd ?? 0) + Number(summary?.fees_usd ?? 0) - Number(summary?.withdrawals_usd ?? 0);
  const liability = Number(summary?.user_balances_usd ?? 0);
  const coverage = liability > 0 ? Math.max(0, Math.min(100, (houseBalance / liability) * 100)) : 0;

  if (presentation === "dashboard") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-end gap-1"><span className="mr-2 text-xs text-[#315c72]">Display currency</span>{(["USD", "KES"] as const).map((item) => <button key={item} onClick={() => setCurrency(item)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${currency === item ? "bg-[#bcebf7] text-[#009fe3]" : "bg-white text-[#315c72]"}`}>{item}</button>)}</div>
        <DashboardGroup title="House">
          <DashboardCard label="House balance" value={money(houseBalance)} tone="gold" note="Deposits + fees - withdrawals paid" />
          <DashboardCard label="Coverage ratio" value={`${coverage.toFixed(1)}%`} tone="gold" note="House cash vs total client balances" />
          <DashboardCard label="Client balances" value={money(liability)} note={`Across ${summary?.clients ?? 0} clients`} />
          <DashboardCard label="Balance status" value={houseBalance >= 0 ? "Positive" : "Negative"} note="Current treasury less completed withdrawals" />
        </DashboardGroup>
        <DashboardGroup title="Trading exposure">
          <DashboardCard label="Total stakes" value={money(summary?.stakes_usd)} tone="gold" note="All recorded real-account stakes" />
          <DashboardCard label="Trading profit" value={money(summary?.profit_usd)} note="Based on completed trades and fees" />
          <DashboardCard label="Recorded trades" value={String(summary?.trades ?? 0)} note="Real-account trades" />
          <DashboardCard label="House retained" value={money(summary?.retained_usd)} tone="green" note="Current retained trading value" />
        </DashboardGroup>
        <DashboardGroup title="Account activity">
          <DashboardCard label="Daily accrual" value="USD 0" />
          <DashboardCard label="7-day projection" value="USD 0" />
          <DashboardCard label="30-day projection" value="USD 0" />
        </DashboardGroup>
        <DashboardGroup title="Cash flow (all-time)">
          <DashboardCard label="Total deposits" value={money(summary?.deposits_usd)} tone="green" />
          <DashboardCard label="Total withdrawn" value={money(summary?.withdrawals_usd)} tone="red" />
          <DashboardCard label="Paid out to clients" value={money(summary?.withdrawals_usd)} note="Completed withdrawals" />
          <DashboardCard label="Total earnings" value={money(Math.max(0, Number(summary?.profit_usd ?? 0)))} />
        </DashboardGroup>
        <div className="rounded-2xl border border-[#afdbe3] bg-white/55 p-5">
          <div className="mb-4 text-sm font-bold uppercase tracking-wide text-[#315c72]">Detailed account reporting</div>
          <div className="grid grid-cols-2 gap-3">{(["summary", "deposits", "withdrawals", "trades", "clients"] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-xl px-3 py-2 text-sm font-bold capitalize ${view === item ? "bg-[#bcebf7] text-[#009fe3]" : "bg-white text-[#315c72]"}`}>{item}</button>)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <DateField label="From" value={startDate} onChange={setStartDate} />
        <DateField label="To" value={endDate} onChange={setEndDate} />
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
          Client
        </span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.full_name || client.username || client.email || client.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </label>

      <div className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-card p-1">
        {(["summary", "deposits", "withdrawals", "trades", "clients"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setView(item)}
            className={
              "rounded-lg px-1 py-2 text-[10px] font-bold capitalize " +
              (view === item ? "bg-primary/15 text-primary" : "text-muted-foreground")
            }
          >
            {item === "withdrawals" ? "Withdraws" : item}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading report...
        </div>
      )}

      {!isLoading && view === "summary" && (
        <div className="grid grid-cols-2 gap-2">
          <ReportStat
            icon={<Users className="h-3.5 w-3.5" />}
            label="Clients"
            value={String(data?.summary.clients ?? 0)}
          />
          <ReportStat
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Deposits"
            value={money(data?.summary.deposits_usd)}
            bull
          />
          <ReportStat
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="Withdrawals"
            value={money(data?.summary.withdrawals_usd)}
            bear
          />
          <ReportStat
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="User Balances"
            value={money(data?.summary.user_balances_usd)}
          />
          <ReportStat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Stakes"
            value={money(data?.summary.stakes_usd)}
          />
          <ReportStat
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Retained"
            value={money(data?.summary.retained_usd)}
            bull
          />
          <ReportStat
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Fees earned"
            value={money(data?.summary.fees_usd)}
            bull
          />
          <ReportStat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Net cash flow"
            value={money(data?.summary.net_cashflow_usd)}
          />
          <ReportStat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="System profit"
            value={money(data?.summary.profit_usd)}
            bull
          />
          <ReportStat
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Pending D/W"
            value={`${data?.summary.pending_deposits ?? 0} / ${data?.summary.pending_withdrawals ?? 0}`}
          />
          <ReportStat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Trades"
            value={String(data?.summary.trades ?? 0)}
          />
        </div>
      )}

      {!isLoading && view !== "summary" && (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No records match.</div>
          )}
          {(rows as ReportRow[]).map((row) =>
            view === "trades" ? (
              <Row
                key={String(row.id)}
                title={`${row.module} - ${row.market}`}
                meta={`${row.status} - ${date(String(row.created_at))}`}
                value={`${money(row.stake)} stake / ${money(row.payout)} payout`}
              />
            ) : view === "clients" ? (
              <Row
                key={String(row.client_id)}
                title={String(row.name ?? "")}
                meta={`${row.trades} trades - retained ${money(row.retained_usd)}`}
                value={`${money(row.deposits_usd)} in / ${money(row.withdrawals_usd)} out`}
              />
            ) : (
              <Row
                key={String(row.id)}
                title={`${row.kind} - ${row.method ?? "system"}`}
                meta={`${row.status} - ${date(String(row.created_at))}`}
                value={money(row.amount_usd)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function DashboardGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="text-base font-bold uppercase text-[#315c72]">{title}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div></section>;
}

function DashboardCard({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "gold" | "green" | "red" }) {
  const toneClass = tone === "gold" ? "text-[#f1bd1b]" : tone === "green" ? "text-[#00b969]" : tone === "red" ? "text-[#ec3038]" : "text-[#0b1930]";
  return <div className="min-h-[126px] rounded-[22px] border border-[#afdbe3] bg-white/55 p-4 shadow-[0_12px_24px_rgba(35,79,92,0.08)]"><div className="text-xs uppercase text-[#315c72]">{label}</div><div className={`mt-3 text-2xl font-bold ${toneClass}`}>{value}</div>{note && <div className="mt-2 text-xs leading-5 text-[#315c72]">{note}</div>}</div>;
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <CalendarDays className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-2 text-xs outline-none focus:border-primary"
        />
      </div>
    </label>
  );
}

function ReportStat({
  icon,
  label,
  value,
  bull,
  bear,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bull?: boolean;
  bear?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        {icon} {label}
      </div>
      <div
        className={
          "mt-0.5 text-sm font-extrabold tabular-nums " +
          (bull ? "text-bull" : bear ? "text-bear" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Row({ title, meta, value }: { title: string; meta: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 text-sm">
      <div className="min-w-0">
        <div className="truncate text-xs font-bold capitalize">{title}</div>
        <div className="truncate text-[10px] text-muted-foreground">{meta}</div>
      </div>
      <div className="shrink-0 text-right text-xs font-bold tabular-nums">{value}</div>
    </div>
  );
}

function money(value: unknown) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function date(value: string) {
  return new Date(value).toLocaleString();
}
