import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, RotateCcw, Shield, ShieldPlus, Users, TrendingUp, DollarSign, Plus, Search, X, Wallet, UserPlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAdminAccount, createAgent, creditAgentVirtual, failStaleMpesaWithdrawals, listAdmins, listAgents, listClients, promoteUserRole, reconcileSuccessfulB2cCallbacks } from "@/lib/admin.functions";
import { toast } from "sonner";
import { RouteError, RouteNotFound } from "@/components/RouteError";
import { AccountsReportPanel } from "@/components/AccountsReportPanel";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — TRONIXOPTION" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!data?.some((r) => r.role === "admin")) throw redirect({ to: "/binary" });
  },
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: AdminPage,
});

interface Trade { id: string; user_id: string; module: string; market: string; stake: number; payout: number; status: string; account_type: string; created_at: string }

function AdminPage() {
  const [tab, setTab] = useState<"accounts" | "users" | "trades" | "agents" | "admins">("accounts");
  const repairWithdrawals = useServerFn(failStaleMpesaWithdrawals);
  const reconcileB2c = useServerFn(reconcileSuccessfulB2cCallbacks);
  const qc = useQueryClient();

  const repairMut = useMutation({
    mutationFn: () => repairWithdrawals({ data: { older_than_minutes: 2 } }),
    onSuccess: (r) => {
      const count = (r.repaired as any[]).length;
      toast.success(count ? `Refunded ${count} stale withdrawal${count === 1 ? "" : "s"}` : "No stale withdrawals found");
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Repair failed"),
  });

  const reconcileMut = useMutation({
    mutationFn: () => reconcileB2c(),
    onSuccess: (r) => {
      const count = (r.repaired as any[]).length;
      toast.success(count ? `Synced ${count} paid M-Pesa transaction${count === 1 ? "" : "s"}` : "No paid pending M-Pesa transactions found");
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reconcile failed"),
  });

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary grid place-items-center glow-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-bold text-base">Admin Console</h1>
          <p className="text-[10px] text-muted-foreground">Operator view · clients, trades, agents, virtual credits</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => reconcileMut.mutate()}
          disabled={reconcileMut.isPending}
          className="rounded-xl border border-bull/30 bg-bull/10 px-3 py-2 text-xs font-bold text-bull disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          {reconcileMut.isPending ? "Checking paid..." : "Sync paid M-Pesa"}
        </button>
        <button
          onClick={() => repairMut.mutate()}
          disabled={repairMut.isPending}
          className="rounded-xl border border-bear/30 bg-bear/10 px-3 py-2 text-xs font-bold text-bear disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          {repairMut.isPending ? "Checking stale..." : "Refund stale B2C"}
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1 bg-card border border-border rounded-xl p-1">
        {(["accounts", "users", "trades", "agents", "admins"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={"py-2 rounded-lg text-[10px] font-semibold " + (tab === k ? "bg-primary/15 text-primary" : "text-muted-foreground")}>
            {k === "accounts" ? "Accounts" : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsReportPanel scope="admin" />}
      {tab === "users" && <UsersTab />}
      {tab === "trades" && <TradesTab />}
      {tab === "agents" && <AgentsTab />}
      {tab === "admins" && <AdminsTab />}
    </div>
  );
}

function UsersTab() {
  const list = useServerFn(listClients);
  const promote = useServerFn(promoteUserRole);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<string | undefined>(undefined);
  const agentsFn = useServerFn(listAgents);
  const qc = useQueryClient();
  const { data: agents = [] } = useQuery({ queryKey: ["admin-agents"], queryFn: () => agentsFn() });
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-clients", search, agentFilter],
    queryFn: () => list({ data: { search: search || undefined, agent_id: agentFilter, limit: 200 } }),
  });
  const promoteMut = useMutation({
    mutationFn: (vars: { user_id: string; role: "admin" | "agent" }) =>
      promote({ data: { ...vars, commission_pct: 10 } }),
    onSuccess: (_, vars) => {
      toast.success(`User promoted to ${vars.role}`);
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Promotion failed"),
  });

  const totalReal = users.reduce((s: number, u: any) => s + Number(u.balance_usd), 0);
  const totalDemo = users.reduce((s: number, u: any) => s + Number(u.demo_balance_usd ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Clients" value={String(users.length)} />
        <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Real $" value={`$${totalReal.toFixed(0)}`} />
        <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Demo $" value={`$${totalDemo.toFixed(0)}`} />
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or username…"
          className="w-full pl-8 pr-3 py-2 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <FilterChip active={!agentFilter} onClick={() => setAgentFilter(undefined)}>All agents</FilterChip>
        {(agents as any[]).map((a) => (
          <FilterChip key={a.agent_id} active={agentFilter === a.agent_id} onClick={() => setAgentFilter(a.agent_id)}>
            {a.referral_code}
          </FilterChip>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && users.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No clients match.</div>}
        {users.map((u: any) => (
          <div key={u.id} className="flex items-center justify-between p-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{u.full_name || u.username || u.id.slice(0, 8)}</div>
              <div className="text-[10px] text-muted-foreground">Active: {u.active_account?.toUpperCase()} · joined {new Date(u.created_at).toLocaleDateString()}</div>
            </div>
            <div className="text-right">
              <div className="font-bold tabular-nums text-bull text-xs">🇺🇸 ${Number(u.balance_usd).toFixed(2)}</div>
              <div className="font-bold tabular-nums text-primary text-[10px]">D ${Number(u.demo_balance_usd ?? 0).toFixed(2)}</div>
              <div className="mt-1 flex justify-end gap-1">
                <button
                  onClick={() => promoteMut.mutate({ user_id: u.id, role: "agent" })}
                  disabled={promoteMut.isPending}
                  className="rounded border border-primary/40 px-1.5 py-0.5 text-[9px] font-bold text-primary disabled:opacity-50"
                >
                  <UserPlus className="mr-0.5 inline h-2.5 w-2.5" /> Agent
                </button>
                <button
                  onClick={() => promoteMut.mutate({ user_id: u.id, role: "admin" })}
                  disabled={promoteMut.isPending}
                  className="rounded border border-bull/40 px-1.5 py-0.5 text-[9px] font-bold text-bull disabled:opacity-50"
                >
                  <ShieldPlus className="mr-0.5 inline h-2.5 w-2.5" /> Admin
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradesTab() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [moduleFilter, setModuleFilter] = useState<string | undefined>(undefined);
  const [accountFilter, setAccountFilter] = useState<"all" | "real" | "demo">("all");

  useEffect(() => {
    let q = supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(150);
    if (moduleFilter) q = q.eq("module", moduleFilter);
    if (accountFilter !== "all") q = q.eq("account_type", accountFilter);
    q.then(({ data }) => setTrades((data ?? []) as Trade[]));
  }, [moduleFilter, accountFilter]);

  const houseRetained = trades.reduce((s, t) => {
    if (t.status === "won") return s - (Number(t.payout) - Number(t.stake));
    if (t.status === "lost") return s + Number(t.stake);
    return s;
  }, 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Trades" value={String(trades.length)} />
        <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Volume" value={`$${trades.reduce((s, t) => s + Number(t.stake), 0).toFixed(0)}`} />
        <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="House" value={`$${houseRetained.toFixed(0)}`} bull />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["all", "real", "demo"] as const).map((a) => (
          <FilterChip key={a} active={accountFilter === a} onClick={() => setAccountFilter(a)}>{a.toUpperCase()}</FilterChip>
        ))}
        <span className="w-px bg-border mx-1" />
        <FilterChip active={!moduleFilter} onClick={() => setModuleFilter(undefined)}>All modules</FilterChip>
        {["binary", "forex", "crypto", "aviator", "predict"].map((m) => (
          <FilterChip key={m} active={moduleFilter === m} onClick={() => setModuleFilter(m)}>{m}</FilterChip>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {trades.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-xs">{t.module.toUpperCase()} · {t.market}</div>
              <div className="text-[10px] text-muted-foreground">{t.user_id.slice(0, 8)} · {t.account_type} · {new Date(t.created_at).toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="font-bold tabular-nums text-xs">${Number(t.stake).toFixed(2)}</div>
              <div className={"text-[10px] font-bold " + (t.status === "won" ? "text-bull" : t.status === "lost" ? "text-bear" : "text-muted-foreground")}>
                {t.status} {t.status === "won" && `+$${Number(t.payout).toFixed(2)}`}
              </div>
            </div>
          </div>
        ))}
        {trades.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No trades match.</div>}
      </div>
    </div>
  );
}

function AgentsTab() {
  const agentsFn = useServerFn(listAgents);
  const create = useServerFn(createAgent);
  const credit = useServerFn(creditAgentVirtual);
  const qc = useQueryClient();
  const { data: agents = [], isLoading } = useQuery({ queryKey: ["admin-agents"], queryFn: () => agentsFn() });

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState(10);

  const [creditOpen, setCreditOpen] = useState<string | null>(null); // agent_user_id
  const [creditAmount, setCreditAmount] = useState("1000");

  const createMut = useMutation({
    mutationFn: (vars: { email: string; commission_pct: number }) => create({ data: vars }),
    onSuccess: (r) => {
      toast.success(`Agent created · code ${r.agent.referral_code}`);
      setShowCreate(false); setEmail("");
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const creditMut = useMutation({
    mutationFn: (vars: { agent_user_id: string; amount_usd: number }) => credit({ data: vars }),
    onSuccess: () => {
      toast.success("Virtual credit granted");
      setCreditOpen(null);
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-2">
      <button onClick={() => setShowCreate(!showCreate)}
        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm glow-primary flex items-center justify-center gap-2">
        <Plus className="h-4 w-4" /> {showCreate ? "Cancel" : "Create agent"}
      </button>

      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Promote existing user</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="agent@email.com"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Commission %</label>
            <input type="number" min={0} max={50} value={commission} onChange={(e) => setCommission(Number(e.target.value))}
              className="w-20 px-2 py-1.5 rounded-lg bg-surface border border-border text-sm text-center font-bold outline-none" />
          </div>
          <button onClick={() => createMut.mutate({ email, commission_pct: commission })} disabled={createMut.isPending || !email}
            className="w-full py-2 rounded-lg bg-bull text-bull-foreground font-bold text-sm disabled:opacity-50">
            {createMut.isPending ? "Creating…" : "Promote & generate code"}
          </button>
        </div>
      )}

      {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
      {(agents as any[]).length === 0 && !isLoading && (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">No agents yet.</div>
      )}

      {(agents as any[]).map((a) => (
        <div key={a.agent_id} className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-sm">{a.agent_username || a.agent_user_id?.slice(0, 8)}</div>
              <div className="text-[10px] text-muted-foreground">commission {Number(a.commission_pct).toFixed(0)}%</div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary font-bold tabular-nums">{a.referral_code}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
            <Cell label="Clients" v={a.client_count} />
            <Cell label="Deposits" v={`$${Number(a.total_deposits).toFixed(0)}`} bull />
            <Cell label="Withdraws" v={`$${Number(a.total_withdrawals).toFixed(0)}`} bear />
            <Cell label="House" v={`$${Number(a.house_retained).toFixed(0)}`} bull />
          </div>
          {creditOpen === a.agent_user_id ? (
            <div className="flex items-center gap-1.5 pt-1">
              <input value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} inputMode="numeric"
                className="flex-1 px-2 py-1.5 rounded-lg bg-surface border border-border text-sm font-bold tabular-nums outline-none" />
              <button onClick={() => creditMut.mutate({ agent_user_id: a.agent_user_id, amount_usd: Number(creditAmount) })}
                disabled={creditMut.isPending}
                className="px-3 py-1.5 rounded-lg bg-bull text-bull-foreground font-bold text-xs disabled:opacity-50">
                Credit
              </button>
              <button onClick={() => setCreditOpen(null)} className="h-7 w-7 grid place-items-center rounded-lg bg-surface border border-border">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => { setCreditOpen(a.agent_user_id); setCreditAmount("1000"); }}
              className="w-full py-1.5 rounded-lg bg-surface border border-border text-xs font-bold flex items-center justify-center gap-1.5">
              <Wallet className="h-3 w-3" /> Credit virtual $ (non-withdrawable)
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminsTab() {
  const adminsFn = useServerFn(listAdmins);
  const create = useServerFn(createAdminAccount);
  const qc = useQueryClient();
  const { data: admins = [], isLoading } = useQuery({ queryKey: ["admin-admins"], queryFn: () => adminsFn() });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { fullName: string; email: string; password: string }) => create({ data: vars }),
    onSuccess: (r) => {
      toast.success(r.promotedExisting ? "Existing user promoted to admin" : "Admin account created");
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirm("");
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create admin"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Admin password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    createMut.mutate({ fullName, email, password });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="bg-card border border-border rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <ShieldPlus className="h-4 w-4 text-primary" /> Add admin
        </div>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" minLength={2} required
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@email.com" type="email" required
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary" />
        <div className="relative">
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" type={showPassword ? "text" : "password"} minLength={8} required
            className="w-full px-3 py-2 pr-10 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary" />
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" type="password" minLength={8} required
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary" />
        <button disabled={createMut.isPending}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm glow-primary disabled:opacity-50">
          {createMut.isPending ? "Creating..." : "Create admin"}
        </button>
      </form>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>}
        {!isLoading && (admins as any[]).length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No admins found.</div>}
        {(admins as any[]).map((admin) => (
          <div key={admin.id} className="flex items-center justify-between p-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{admin.full_name || admin.username || admin.email}</div>
              <div className="text-[10px] text-muted-foreground truncate">{admin.email}</div>
            </div>
            <div className="text-[10px] text-muted-foreground">Joined {new Date(admin.created_at).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, bull }: { icon: React.ReactNode; label: string; value: string; bull?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">{icon} {label}</div>
      <div className={"font-extrabold tabular-nums text-sm mt-0.5 " + (bull ? "text-bull" : "")}>{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={"shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border " + (active ? "bg-primary/20 text-primary border-primary/50" : "bg-surface text-muted-foreground border-border")}>
      {children}
    </button>
  );
}

function Cell({ label, v, bull, bear }: { label: string; v: string | number; bull?: boolean; bear?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-[9px] uppercase font-bold">{label}</div>
      <div className={"font-bold tabular-nums text-xs " + (bull ? "text-bull" : bear ? "text-bear" : "")}>{v}</div>
    </div>
  );
}
