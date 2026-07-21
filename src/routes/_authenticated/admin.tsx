import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Eye,
  EyeOff,
  RotateCcw,
  Shield,
  ShieldPlus,
  Users,
  TrendingUp,
  DollarSign,
  Plus,
  Search,
  X,
  Wallet,
  UserPlus,
  UserMinus,
  SlidersHorizontal,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminAccount,
  createAccountMetricAdjustment,
  createAgent,
  creditAgentVirtual,
  demoteUserRole,
  failStaleMpesaWithdrawals,
  listAccountMetricAdjustments,
  listAdmins,
  listAgents,
  listClients,
  moderateClientAccount,
  promoteUserRole,
  reconcileSuccessfulB2cCallbacks,
  resetAdminAccountsSummary,
  resetUserBalances,
  auditUserBalance,
  reconcileUserBalance,
  reconcileAllBalances,
  getBalanceAuditLog,
  getUserLedgerSummary,
  getReconciliationStatus,
  setAutoReconciliationEnabled,
  runScheduledLedgerReconciliation,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { RouteError, RouteNotFound } from "@/components/RouteError";
import { AccountsReportPanel } from "@/components/AccountsReportPanel";
import { SupportPanel } from "@/components/SupportPanel";
import {
  calculateHouseEdgePercent,
  DEFAULT_SYSTEM_SETTINGS,
  getSystemSettings,
  updateSystemSettings,
} from "@/lib/system-settings";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — MEGAFLIP" }] }),
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

interface Trade {
  id: string;
  user_id: string;
  module: string;
  market: string;
  stake: number;
  payout: number;
  status: string;
  account_type: string;
  created_at: string;
}

type ClientRow = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  active_account?: string | null;
  account_state?: string | null;
  freeze_until?: string | null;
  deleted_at?: string | null;
  balance_usd?: number | string | null;
  demo_balance_usd?: number | string | null;
  created_at: string;
};

type AgentRow = {
  agent_id: string;
  agent_user_id: string;
  referral_code: string;
  commission_pct: number | string;
  agent_username?: string | null;
  client_count: number | string;
  total_deposits: number | string;
  total_withdrawals: number | string;
  house_retained: number | string;
};

type AdminRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  created_at: string;
};

function AdminPage() {
  const [tab, setTab] = useState<"accounts" | "users" | "trades" | "agents" | "support" | "settings" | "ledger" | "admins">(
    "accounts",
  );
  const [titleClicks, setTitleClicks] = useState(0);
  const [showAdminVault, setShowAdminVault] = useState(false);
  const repairWithdrawals = useServerFn(failStaleMpesaWithdrawals);
  const reconcileB2c = useServerFn(reconcileSuccessfulB2cCallbacks);
  const qc = useQueryClient();

  const repairMut = useMutation({
    mutationFn: () => repairWithdrawals({ data: { older_than_minutes: 2 } }),
    onSuccess: (r) => {
      const count = Array.isArray(r.repaired) ? r.repaired.length : 0;
      toast.success(
        count
          ? `Refunded ${count} stale withdrawal${count === 1 ? "" : "s"}`
          : "No stale withdrawals found",
      );
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Repair failed"),
  });

  const reconcileMut = useMutation({
    mutationFn: () => reconcileB2c(),
    onSuccess: (r) => {
      const count = Array.isArray(r.repaired) ? r.repaired.length : 0;
      toast.success(
        count
          ? `Synced ${count} paid M-Pesa transaction${count === 1 ? "" : "s"}`
          : "No paid pending M-Pesa transactions found",
      );
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
          <button
            onClick={() => {
              const next = titleClicks + 1;
              setTitleClicks(next);
              if (next >= 5) {
                setShowAdminVault(true);
                setTab("admins");
              }
            }}
            className="text-left font-bold text-base"
          >
            Admin Console
          </button>
          <p className="text-[10px] text-muted-foreground">
            Operator view · clients, trades, agents, virtual credits
          </p>
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

      <div className="grid grid-cols-6 gap-1 bg-card border border-border rounded-xl p-1">
        {(
          [
            "accounts",
            "users",
            "trades",
            "agents",
            "support",
            "settings",
            "ledger",
            ...(showAdminVault ? (["admins"] as const) : []),
          ] as const
        ).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              "py-2 rounded-lg text-[10px] font-semibold " +
              (tab === k ? "bg-primary/15 text-primary" : "text-muted-foreground")
            }
          >
            {k === "accounts" ? "Accounts" : k === "ledger" ? "Ledger" : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsReportPanel scope="admin" />}
      {tab === "users" && <UsersTab />}
      {tab === "trades" && <TradesTab />}
      {tab === "agents" && <AgentsTab />}
      {tab === "support" && <SupportPanel adminMode />}
      {tab === "settings" && <SettingsTab />}
      {tab === "ledger" && <LedgerReconciliationTab />}
      {tab === "admins" && showAdminVault && (
        <>
          <HiddenPermanentSummary />
          <AccountAdjustments />
          <AdminsTab />
        </>
      )}
    </div>
  );
}

function HiddenPermanentSummary() {
  const resetSummary = useServerFn(resetAdminAccountsSummary);
  const qc = useQueryClient();
  const resetMut = useMutation({
    mutationFn: () => resetSummary({ data: { reason: "Hidden admin summary reset" } }),
    onSuccess: () => {
      toast.success("Visible accounts summary reset");
      qc.invalidateQueries({ queryKey: ["accounts-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Summary reset failed"),
  });

  return (
    <div className="space-y-2">
      <AccountsReportPanel scope="admin" mode="all_time" title="Permanent all-time summary" />
      <button
        onClick={() => {
          if (
            window.confirm(
              "Reset the visible Admin Console accounts summary from this moment? Permanent summary will stay unchanged.",
            )
          ) {
            resetMut.mutate();
          }
        }}
        disabled={resetMut.isPending}
        className="w-full rounded-xl border border-bear/30 bg-bear/10 px-3 py-2 text-xs font-bold text-bear disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <RotateCcw className="h-4 w-4" />
        {resetMut.isPending ? "Resetting summary..." : "Reset visible summary"}
      </button>
    </div>
  );
}

function SettingsTab() {
  const fetchSettings = useServerFn(getSystemSettings);
  const updateSettings = useServerFn(updateSystemSettings);
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: () => fetchSettings(),
  });
  const [minDeposit, setMinDeposit] = useState("3");
  const [minWithdrawal, setMinWithdrawal] = useState("3");
  const [taxPct, setTaxPct] = useState("5");
  const [rtp, setRtp] = useState("95");
  const [minStake, setMinStake] = useState("1");
  const [maxStake, setMaxStake] = useState("1000");
  const [volatilityModel, setVolatilityModel] = useState("standard");
  const [segmentTags, setSegmentTags] = useState("VIP,HIGH ROLLER");
  const [marketLiability, setMarketLiability] = useState("5000");
  const [userLiability, setUserLiability] = useState("2000");
  const [fraudSectionEnabled, setFraudSectionEnabled] = useState(true);
  const [fraudEnabled, setFraudEnabled] = useState(true);
  const [fraudRules, setFraudRules] = useState("bot,arbitrage");
  const [engagementEnabled, setEngagementEnabled] = useState(true);
  const [engagementTriggers, setEngagementTriggers] = useState("trade,withdrawal");
  const [capsEnabled, setCapsEnabled] = useState(true);
  const [dailyLossCap, setDailyLossCap] = useState("10000");
  const [weeklyLossCap, setWeeklyLossCap] = useState("50000");
  const [monthlyLossCap, setMonthlyLossCap] = useState("100000");
  const [coreSettingsEnabled, setCoreSettingsEnabled] = useState(true);
  const [limitsEnabled, setLimitsEnabled] = useState(true);
  const [volatilityEnabled, setVolatilityEnabled] = useState(true);
  const [segmentationEnabled, setSegmentationEnabled] = useState(true);
  const [liabilityEnabled, setLiabilityEnabled] = useState(true);

  useEffect(() => {
    if (!settings) return;
    setMinDeposit(String(Number(settings.min_deposit_usd ?? 3)));
    setMinWithdrawal(String(Number(settings.min_withdrawal_usd ?? 3)));
    setTaxPct(String(Number(settings.withdrawal_tax_pct ?? 5)));
    setRtp(String(Number(settings.rtp_percent ?? 95)));
    setMinStake(String(Number(settings.limits_min_stake_usd ?? 1)));
    setMaxStake(String(Number(settings.limits_max_stake_usd ?? 1000)));
    setVolatilityModel(String(settings.volatility_model_variant ?? "standard"));
    setSegmentTags(String(settings.user_segmentation_tags ?? "VIP,HIGH ROLLER"));
    setMarketLiability(String(Number(settings.liability_limits_market_usd ?? 5000)));
    setUserLiability(String(Number(settings.liability_limits_user_usd ?? 2000)));
    setFraudSectionEnabled(true);
    setFraudEnabled(Boolean(settings.fraud_detection_enabled ?? true));
    setFraudRules(String(settings.fraud_detection_rules ?? "bot,arbitrage"));
    setEngagementEnabled(true);
    setEngagementTriggers(String(settings.engagement_notification_triggers ?? "trade,withdrawal"));
    setCapsEnabled(true);
    setDailyLossCap(String(Number(settings.caps_daily_loss_usd ?? 10000)));
    setWeeklyLossCap(String(Number(settings.caps_weekly_loss_usd ?? 50000)));
    setMonthlyLossCap(String(Number(settings.caps_monthly_loss_usd ?? 100000)));
    setCoreSettingsEnabled(true);
    setLimitsEnabled(true);
    setVolatilityEnabled(true);
    setSegmentationEnabled(true);
    setLiabilityEnabled(true);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateSettings({
        data: {
          min_deposit_usd: Number(coreSettingsEnabled ? minDeposit || 0 : DEFAULT_SYSTEM_SETTINGS.min_deposit_usd),
          min_withdrawal_usd: Number(coreSettingsEnabled ? minWithdrawal || 0 : DEFAULT_SYSTEM_SETTINGS.min_withdrawal_usd),
          withdrawal_tax_pct: Number(coreSettingsEnabled ? taxPct || 0 : DEFAULT_SYSTEM_SETTINGS.withdrawal_tax_pct),
          rtp_percent: Number(coreSettingsEnabled ? rtp || 0 : DEFAULT_SYSTEM_SETTINGS.rtp_percent),
          limits_min_stake_usd: Number(limitsEnabled ? minStake || 0 : DEFAULT_SYSTEM_SETTINGS.limits_min_stake_usd),
          limits_max_stake_usd: Number(limitsEnabled ? maxStake || 0 : DEFAULT_SYSTEM_SETTINGS.limits_max_stake_usd),
          volatility_model_variant: volatilityEnabled ? volatilityModel : DEFAULT_SYSTEM_SETTINGS.volatility_model_variant,
          user_segmentation_tags: segmentationEnabled ? segmentTags : DEFAULT_SYSTEM_SETTINGS.user_segmentation_tags,
          liability_limits_market_usd: Number(liabilityEnabled ? marketLiability || 0 : DEFAULT_SYSTEM_SETTINGS.liability_limits_market_usd),
          liability_limits_user_usd: Number(liabilityEnabled ? userLiability || 0 : DEFAULT_SYSTEM_SETTINGS.liability_limits_user_usd),
          fraud_detection_enabled: fraudSectionEnabled ? fraudEnabled : true,
          fraud_detection_rules: fraudSectionEnabled ? fraudRules : DEFAULT_SYSTEM_SETTINGS.fraud_detection_rules,
          engagement_notification_triggers: engagementEnabled ? engagementTriggers : DEFAULT_SYSTEM_SETTINGS.engagement_notification_triggers,
          caps_daily_loss_usd: Number(capsEnabled ? dailyLossCap || 0 : DEFAULT_SYSTEM_SETTINGS.caps_daily_loss_usd),
          caps_weekly_loss_usd: Number(capsEnabled ? weeklyLossCap || 0 : DEFAULT_SYSTEM_SETTINGS.caps_weekly_loss_usd),
          caps_monthly_loss_usd: Number(capsEnabled ? monthlyLossCap || 0 : DEFAULT_SYSTEM_SETTINGS.caps_monthly_loss_usd),
        },
      }),
    onSuccess: () => {
      toast.success("System settings updated");
      qc.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings"),
  });

  const houseEdge = calculateHouseEdgePercent(Number(rtp || 95));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <SlidersHorizontal className="h-4 w-4 text-primary" /> System settings
      </div>
      <p className="text-[11px] text-muted-foreground">
        Control staking limits, volatility behavior, risk caps, segmentation tags, fraud automation, engagement events, and VAT retention from one admin dashboard.
      </p>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading settings…</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Core economics</div>
            <button
              type="button"
              onClick={() => setCoreSettingsEnabled((prev) => !prev)}
              className={
                "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                (coreSettingsEnabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground")
              }
            >
              {coreSettingsEnabled ? "Custom" : "Defaults"}
            </button>
          </div>
          <div className={coreSettingsEnabled ? "" : "opacity-80"}>
            <div className="grid gap-2 sm:grid-cols-2">
              <LabeledInput
                label="Minimum deposit (USD)"
                value={coreSettingsEnabled ? minDeposit : DEFAULT_SYSTEM_SETTINGS.min_deposit_usd}
                onChange={setMinDeposit}
                type="number"
              />
              <LabeledInput
                label="Minimum withdrawal (USD)"
                value={coreSettingsEnabled ? minWithdrawal : DEFAULT_SYSTEM_SETTINGS.min_withdrawal_usd}
                onChange={setMinWithdrawal}
                type="number"
              />
              <LabeledInput
                label="VAT retention (%)"
                value={coreSettingsEnabled ? taxPct : DEFAULT_SYSTEM_SETTINGS.withdrawal_tax_pct}
                onChange={setTaxPct}
                type="number"
              />
              <LabeledInput
                label="RTP (%)"
                value={coreSettingsEnabled ? rtp : DEFAULT_SYSTEM_SETTINGS.rtp_percent}
                onChange={setRtp}
                type="number"
              />
            </div>
          </div>
            <div className="rounded-lg border border-border bg-card/60 p-2 text-sm">
              <div className="font-semibold">House edge</div>
              <div className="text-muted-foreground">{houseEdge.toFixed(2)}% ({(100 - houseEdge).toFixed(2)}% RTP)</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Limits</div>
            <button
              type="button"
              onClick={() => setLimitsEnabled((prev) => !prev)}
              className={
                "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                (limitsEnabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground")
              }
            >
              {limitsEnabled ? "Custom" : "Defaults"}
            </button>
          </div>
          <div className={limitsEnabled ? "" : "opacity-80"}>
            <div className="grid gap-2 sm:grid-cols-2">
              <LabeledInput
                label="Minimum stake (USD)"
                value={limitsEnabled ? minStake : DEFAULT_SYSTEM_SETTINGS.limits_min_stake_usd}
                onChange={setMinStake}
                type="number"
              />
              <LabeledInput
                label="Maximum stake (USD)"
                value={limitsEnabled ? maxStake : DEFAULT_SYSTEM_SETTINGS.limits_max_stake_usd}
                onChange={setMaxStake}
                type="number"
              />
            </div>
          </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Volatility</div>
              <button
                type="button"
                onClick={() => setVolatilityEnabled((prev) => !prev)}
                className={
                  "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                  (volatilityEnabled
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-surface text-muted-foreground")
                }
              >
                {volatilityEnabled ? "Custom" : "Defaults"}
              </button>
            </div>
            <div className={volatilityEnabled ? "" : "opacity-80"}>
              <LabeledSelect
                label="Math model variant"
                value={volatilityEnabled ? volatilityModel : DEFAULT_SYSTEM_SETTINGS.volatility_model_variant}
                onChange={setVolatilityModel}
                options={["standard", "aggressive", "conservative"]}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">User segmentation</div>
            <button
              type="button"
              onClick={() => setSegmentationEnabled((prev) => !prev)}
              className={
                "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                (segmentationEnabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground")
              }
            >
              {segmentationEnabled ? "Custom" : "Defaults"}
            </button>
          </div>
          <div className={segmentationEnabled ? "" : "opacity-80"}>
            <LabeledInput
              label="Auto tags"
              value={segmentationEnabled ? segmentTags : DEFAULT_SYSTEM_SETTINGS.user_segmentation_tags}
              onChange={setSegmentTags}
            />
            <div className="text-[10px] text-muted-foreground">Enter tags as a comma-separated list such as VIP,HIGH ROLLER.</div>
          </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Liability limits</div>
            <button
              type="button"
              onClick={() => setLiabilityEnabled((prev) => !prev)}
              className={
                "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                (liabilityEnabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground")
              }
            >
              {liabilityEnabled ? "Custom" : "Defaults"}
            </button>
          </div>
          <div className={liabilityEnabled ? "" : "opacity-80"}>
            <div className="grid gap-2 sm:grid-cols-2">
              <LabeledInput
                label="Exposure per market (USD)"
                value={liabilityEnabled ? marketLiability : DEFAULT_SYSTEM_SETTINGS.liability_limits_market_usd}
                onChange={setMarketLiability}
                type="number"
              />
              <LabeledInput
                label="Exposure per user (USD)"
                value={liabilityEnabled ? userLiability : DEFAULT_SYSTEM_SETTINGS.liability_limits_user_usd}
                onChange={setUserLiability}
                type="number"
              />
            </div>
          </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fraud detection</div>
            <button
              type="button"
              onClick={() => setFraudSectionEnabled((prev) => !prev)}
              className={
                "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                (fraudSectionEnabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground")
              }
            >
              {fraudSectionEnabled ? "Custom" : "Defaults"}
            </button>
          </div>
          <div className={fraudSectionEnabled ? "" : "opacity-80"}>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={fraudSectionEnabled ? fraudEnabled : true}
                onChange={(e) => setFraudEnabled(e.target.checked)}
                disabled={!fraudSectionEnabled}
              />
              Enable automated fraud detection
            </label>
            <LabeledInput
              label="Rules / patterns"
              value={fraudSectionEnabled ? fraudRules : DEFAULT_SYSTEM_SETTINGS.fraud_detection_rules}
              onChange={setFraudRules}
            />
          </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Engagements</div>
            <button
              type="button"
              onClick={() => setEngagementEnabled((prev) => !prev)}
              className={
                "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                (engagementEnabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground")
              }
            >
              {engagementEnabled ? "Custom" : "Defaults"}
            </button>
          </div>
          <div className={engagementEnabled ? "" : "opacity-80"}>
            <LabeledInput
              label="Event triggers"
              value={engagementEnabled ? engagementTriggers : DEFAULT_SYSTEM_SETTINGS.engagement_notification_triggers}
              onChange={setEngagementTriggers}
            />
            <div className="text-[10px] text-muted-foreground">Example: trade,withdrawal,deposit,bonus.</div>
          </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Caps</div>
            <button
              type="button"
              onClick={() => setCapsEnabled((prev) => !prev)}
              className={
                "rounded-full border px-2 py-1 text-[10px] font-bold transition " +
                (capsEnabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground")
              }
            >
              {capsEnabled ? "Custom" : "Defaults"}
            </button>
          </div>
          <div className={capsEnabled ? "" : "opacity-80"}>
            <div className="grid gap-2 sm:grid-cols-3">
              <LabeledInput
                label="Daily loss cap (USD)"
                value={capsEnabled ? dailyLossCap : DEFAULT_SYSTEM_SETTINGS.caps_daily_loss_usd}
                onChange={setDailyLossCap}
                type="number"
              />
              <LabeledInput
                label="Weekly loss cap (USD)"
                value={capsEnabled ? weeklyLossCap : DEFAULT_SYSTEM_SETTINGS.caps_weekly_loss_usd}
                onChange={setWeeklyLossCap}
                type="number"
              />
              <LabeledInput
                label="Monthly loss cap (USD)"
                value={capsEnabled ? monthlyLossCap : DEFAULT_SYSTEM_SETTINGS.caps_monthly_loss_usd}
                onChange={setMonthlyLossCap}
                type="number"
              />
            </div>
          </div>
          </div>

          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving..." : "Save system settings"}
          </button>
        </div>
      )}
    </div>
  );
}

function AccountAdjustments() {
  const list = useServerFn(listAccountMetricAdjustments);
  const create = useServerFn(createAccountMetricAdjustment);
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["account-adjustments"],
    queryFn: () => list(),
  });
  const [label, setLabel] = useState("Manual correction");
  const [deposits, setDeposits] = useState("0");
  const [withdrawals, setWithdrawals] = useState("0");
  const [retained, setRetained] = useState("0");

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          label,
          deposits_usd: Number(deposits || 0),
          withdrawals_usd: Number(withdrawals || 0),
          retained_usd: Number(retained || 0),
          stakes_usd: 0,
          trades: 0,
        },
      }),
    onSuccess: () => {
      toast.success("Summary adjustment added");
      setDeposits("0");
      setWithdrawals("0");
      setRetained("0");
      qc.invalidateQueries({ queryKey: ["account-adjustments"] });
      qc.invalidateQueries({ queryKey: ["accounts-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Adjustment failed"),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <SlidersHorizontal className="h-4 w-4 text-primary" /> Summary adjustments
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary"
      />
      <div className="grid grid-cols-3 gap-2">
        <MetricInput label="Deposits" value={deposits} onChange={setDeposits} />
        <MetricInput label="Withdraws" value={withdrawals} onChange={setWithdrawals} />
        <MetricInput label="Retained" value={retained} onChange={setRetained} />
      </div>
      <button
        onClick={() => createMut.mutate()}
        disabled={createMut.isPending}
        className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
      >
        Apply to summary
      </button>
      <div className="divide-y divide-border rounded-lg border border-border">
        {(rows as Array<Record<string, unknown>>).slice(0, 5).map((row) => (
          <div key={String(row.id)} className="flex items-center justify-between p-2 text-xs">
            <div className="font-semibold">{String(row.label)}</div>
            <div className="text-right tabular-nums text-muted-foreground">
              D ${Number(row.deposits_usd ?? 0).toFixed(2)} · W $
              {Number(row.withdrawals_usd ?? 0).toFixed(2)} · R $
              {Number(row.retained_usd ?? 0).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersTab() {
  const list = useServerFn(listClients);
  const promote = useServerFn(promoteUserRole);
  const resetBalances = useServerFn(resetUserBalances);
  const moderate = useServerFn(moderateClientAccount);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<string | undefined>(undefined);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [freezeDaysByUser, setFreezeDaysByUser] = useState<Record<string, number>>({});
  const agentsFn = useServerFn(listAgents);
  const qc = useQueryClient();
  const { data: agents = [] } = useQuery({ queryKey: ["admin-agents"], queryFn: () => agentsFn() });
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-clients", search, agentFilter],
    queryFn: () =>
      list({ data: { search: search || undefined, agent_id: agentFilter, limit: 200 } }),
  });
  const agentRows = agents as AgentRow[];
  const userRows = users as ClientRow[];
  const selectedClient = userRows.find((user) => user.id === selectedClientId) ?? null;
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
  const resetMut = useMutation({
    mutationFn: (vars: { user_id: string; account: "real" | "demo" | "all" }) =>
      resetBalances({ data: vars }),
    onSuccess: (_, vars) => {
      toast.success(`${vars.account.toUpperCase()} balance reset`);
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
  });
  const moderateMut = useMutation({
    mutationFn: (vars: { user_id: string; action: "freeze" | "close" | "delete" | "activate"; duration_days?: number; note?: string }) =>
      moderate({ data: vars }),
    onSuccess: (_, vars) => {
      const label = vars.action === "freeze" ? "frozen" : vars.action === "close" ? "closed" : vars.action === "delete" ? "deleted" : "unlocked";
      toast.success(`Account ${label}`);
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Account action failed"),
  });

  const totalReal = userRows.reduce((s, u) => s + Number(u.balance_usd), 0);
  const totalDemo = userRows.reduce((s, u) => s + Number(u.demo_balance_usd ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<Users className="h-3.5 w-3.5" />}
          label="Clients"
          value={String(userRows.length)}
        />
        <Stat
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Real $"
          value={`$${totalReal.toFixed(0)}`}
        />
        <Stat
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Demo $"
          value={`$${totalDemo.toFixed(0)}`}
        />
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or username…"
          className="w-full pl-8 pr-3 py-2 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <FilterChip active={!agentFilter} onClick={() => setAgentFilter(undefined)}>
          All agents
        </FilterChip>
        {agentRows.map((a) => (
          <FilterChip
            key={a.agent_id}
            active={agentFilter === a.agent_id}
            onClick={() => setAgentFilter(a.agent_id)}
          >
            {a.referral_code}
          </FilterChip>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && userRows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No clients match.</div>
        )}
        {userRows.map((u) => (
          <div key={u.id} className="border-b border-border last:border-b-0">
            <div className="flex items-center justify-between p-2.5 text-sm">
              <button
                type="button"
                onClick={() => setSelectedClientId(u.id)}
                className="flex min-w-0 flex-1 items-center justify-between text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">
                    {u.full_name || u.username || u.id.slice(0, 8)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Active: {u.active_account?.toUpperCase()} · joined {new Date(u.created_at).toLocaleDateString()}
                  </div>
                </div>
                <ChevronRight className="ml-2 h-4 w-4 text-muted-foreground" />
              </button>
              <div className="text-right ml-4">
                <div className="font-bold tabular-nums text-bull text-xs">
                  🇺🇸 ${Number(u.balance_usd).toFixed(2)}
                </div>
                <div className="font-bold tabular-nums text-primary text-[10px]">
                  D ${Number(u.demo_balance_usd ?? 0).toFixed(2)}
                </div>
              </div>
            </div>
            <div className="px-2.5 pb-2.5 pt-0 space-y-2">
              <div className="flex flex-wrap gap-1">
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                  {String(u.account_state ?? "active").toUpperCase()}
                </span>
                <button
                  onClick={() => {
                    if (window.confirm("Reset this user's real balance to zero?")) {
                      resetMut.mutate({ user_id: u.id, account: "real" });
                    }
                  }}
                  disabled={resetMut.isPending}
                  className="rounded border border-primary/40 px-1.5 py-0.5 text-[9px] font-bold text-primary disabled:opacity-50"
                >
                  <RotateCcw className="mr-0.5 inline h-2.5 w-2.5" /> Real
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Reset this user's demo balance to zero?")) {
                      resetMut.mutate({ user_id: u.id, account: "demo" });
                    }
                  }}
                  disabled={resetMut.isPending}
                  className="rounded border border-primary/40 px-1.5 py-0.5 text-[9px] font-bold text-primary disabled:opacity-50"
                >
                  <RotateCcw className="mr-0.5 inline h-2.5 w-2.5" /> Demo
                </button>
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
              <div className="flex flex-wrap gap-1">
                <select
                  value={freezeDaysByUser[u.id] ?? 1}
                  onChange={(e) => setFreezeDaysByUser((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))}
                  className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] font-semibold"
                >
                  <option value={1}>1 day</option>
                  <option value={3}>3 days</option>
                  <option value={7}>1 week</option>
                </select>
                <button
                  onClick={() => {
                    if (window.confirm("Freeze this account for the selected duration?")) {
                      moderateMut.mutate({ user_id: u.id, action: "freeze", duration_days: freezeDaysByUser[u.id] ?? 1 });
                    }
                  }}
                  disabled={moderateMut.isPending}
                  className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-bold text-amber-500 disabled:opacity-50"
                >
                  Freeze
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Close this account so it can sign in but stays inert?")) {
                      moderateMut.mutate({ user_id: u.id, action: "close" });
                    }
                  }}
                  disabled={moderateMut.isPending}
                  className="rounded border border-primary/40 px-1.5 py-0.5 text-[9px] font-bold text-primary disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Unfreeze and unlock this account?")) {
                      moderateMut.mutate({ user_id: u.id, action: "activate" });
                    }
                  }}
                  disabled={moderateMut.isPending}
                  className="rounded border border-bull/40 px-1.5 py-0.5 text-[9px] font-bold text-bull disabled:opacity-50"
                >
                  Unlock
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Permanently delete this account and remove its data from the platform?")) {
                      moderateMut.mutate({ user_id: u.id, action: "delete" });
                    }
                  }}
                  disabled={moderateMut.isPending}
                  className="rounded border border-bear/40 px-1.5 py-0.5 text-[9px] font-bold text-bear disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedClient && <ClientDetailsDrawer client={selectedClient} onClose={() => setSelectedClientId(null)} />}
    </div>
  );
}

function ClientDetailsDrawer({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const [details, setDetails] = useState<{
    profile?: Record<string, unknown> | null;
    trades: Array<Record<string, unknown>>;
    transactions: Array<Record<string, unknown>>;
  }>({ trades: [], transactions: [] });

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", client.id).maybeSingle();
      const [{ data: tradesData }, { data: txData }] = await Promise.all([
        supabase.from("trades").select("*").eq("user_id", client.id).order("created_at", { ascending: false }).limit(12),
        supabase.from("transactions").select("*").eq("user_id", client.id).order("created_at", { ascending: false }).limit(12),
      ]);
      if (!active) return;
      setDetails({ profile: profileData ?? null, trades: (tradesData ?? []) as Array<Record<string, unknown>>, transactions: (txData ?? []) as Array<Record<string, unknown>> });
    }
    load();
    return () => { active = false; };
  }, [client.id]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-[51] h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">{client.full_name || client.username || client.id.slice(0, 8)}</div>
            <div className="text-[11px] text-muted-foreground">Client profile and activity</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border p-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Profile</div>
          <div className="grid gap-2 text-sm">
            <Row label="Name" value={String(details.profile?.full_name ?? client.full_name ?? "—")} />
            <Row label="Username" value={String(details.profile?.username ?? client.username ?? "—")} />
            <Row label="Email" value={String(details.profile?.email ?? "—")} />
            <Row label="Phone" value={String(details.profile?.phone ?? "—")} />
            <Row label="Active account" value={String(details.profile?.active_account ?? client.active_account ?? "—")} />
            <Row label="Account state" value={String(details.profile?.account_state ?? client.account_state ?? "active").toUpperCase()} />
            <Row label="Freeze until" value={details.profile?.freeze_until ? new Date(String(details.profile.freeze_until)).toLocaleString() : "—"} />
            <Row label="Real balance" value={`$${Number(details.profile?.balance_usd ?? client.balance_usd ?? 0).toFixed(2)}`} />
            <Row label="Demo balance" value={`$${Number(details.profile?.demo_balance_usd ?? client.demo_balance_usd ?? 0).toFixed(2)}`} />
            <Row label="Joined" value={new Date(String(details.profile?.created_at ?? client.created_at)).toLocaleString()} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent trades</div>
          {details.trades.length === 0 ? (
            <div className="text-sm text-muted-foreground">No trades yet.</div>
          ) : (
            <div className="space-y-2">
              {details.trades.map((trade) => (
                <div key={String(trade.id)} className="rounded-lg border border-border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{String(trade.module ?? "trade").toUpperCase()} · {String(trade.market ?? "—")}</div>
                    <div className="text-[10px] text-muted-foreground">{String(trade.status ?? "—")}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Stake ${Number(trade.stake ?? 0).toFixed(2)} · payout ${Number(trade.payout ?? 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Deposits / withdrawals</div>
          {details.transactions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="space-y-2">
              {details.transactions.map((transaction) => (
                <div key={String(transaction.id)} className="rounded-lg border border-border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{String(transaction.kind ?? "transaction")}</div>
                    <div className={Number(transaction.amount_usd ?? 0) >= 0 ? "text-bull" : "text-bear"}>
                      ${Number(transaction.amount_usd ?? 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {String(transaction.status ?? "—")} · {new Date(String(transaction.created_at ?? "")).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-2.5 py-2">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold">{value}</span>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] uppercase font-bold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        className="w-full px-2 py-1.5 rounded-lg bg-surface border border-border text-sm font-bold tabular-nums outline-none"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] uppercase font-bold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-semibold outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TradesTab() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [moduleFilter, setModuleFilter] = useState<string | undefined>(undefined);
  const [accountFilter, setAccountFilter] = useState<"all" | "real" | "demo">("all");

  useEffect(() => {
    let q = supabase
      .from("trades")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150);
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
        <Stat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Trades"
          value={String(trades.length)}
        />
        <Stat
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Volume"
          value={`$${trades.reduce((s, t) => s + Number(t.stake), 0).toFixed(0)}`}
        />
        <Stat
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="House"
          value={`$${houseRetained.toFixed(0)}`}
          bull
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["all", "real", "demo"] as const).map((a) => (
          <FilterChip key={a} active={accountFilter === a} onClick={() => setAccountFilter(a)}>
            {a.toUpperCase()}
          </FilterChip>
        ))}
        <span className="w-px bg-border mx-1" />
        <FilterChip active={!moduleFilter} onClick={() => setModuleFilter(undefined)}>
          All modules
        </FilterChip>
        {["binary", "forex", "crypto", "aviator", "predict"].map((m) => (
          <FilterChip key={m} active={moduleFilter === m} onClick={() => setModuleFilter(m)}>
            {m}
          </FilterChip>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {trades.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-xs">
                {t.module.toUpperCase()} · {t.market}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {t.user_id.slice(0, 8)} · {t.account_type} ·{" "}
                {new Date(t.created_at).toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold tabular-nums text-xs">${Number(t.stake).toFixed(2)}</div>
              <div
                className={
                  "text-[10px] font-bold " +
                  (t.status === "won"
                    ? "text-bull"
                    : t.status === "lost"
                      ? "text-bear"
                      : "text-muted-foreground")
                }
              >
                {t.status} {t.status === "won" && `+$${Number(t.payout).toFixed(2)}`}
              </div>
            </div>
          </div>
        ))}
        {trades.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No trades match.</div>
        )}
      </div>
    </div>
  );
}

function AgentsTab() {
  const agentsFn = useServerFn(listAgents);
  const create = useServerFn(createAgent);
  const credit = useServerFn(creditAgentVirtual);
  const demote = useServerFn(demoteUserRole);
  const resetBalances = useServerFn(resetUserBalances);
  const qc = useQueryClient();
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["admin-agents"],
    queryFn: () => agentsFn(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState(10);

  const [creditOpen, setCreditOpen] = useState<string | null>(null); // agent_user_id
  const [creditAmount, setCreditAmount] = useState("1000");
  const agentRows = agents as AgentRow[];

  const createMut = useMutation({
    mutationFn: (vars: { email: string; commission_pct: number }) => create({ data: vars }),
    onSuccess: (r) => {
      toast.success(`Agent created · code ${r.agent.referral_code}`);
      setShowCreate(false);
      setEmail("");
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
  const demoteMut = useMutation({
    mutationFn: (vars: { user_id: string }) =>
      demote({ data: { user_id: vars.user_id, role: "agent", reset_agent_balances: true } }),
    onSuccess: () => {
      toast.success("Agent demoted to user and balances reset");
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Demotion failed"),
  });
  const resetMut = useMutation({
    mutationFn: (vars: { user_id: string }) =>
      resetBalances({ data: { user_id: vars.user_id, account: "all" } }),
    onSuccess: () => {
      toast.success("Agent balances reset to zero");
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
  });

  return (
    <div className="space-y-2">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm glow-primary flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" /> {showCreate ? "Cancel" : "Create agent"}
      </button>

      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
            Promote existing user
          </div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="agent@email.com"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Commission %</label>
            <input
              type="number"
              min={0}
              max={50}
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
              className="w-20 px-2 py-1.5 rounded-lg bg-surface border border-border text-sm text-center font-bold outline-none"
            />
          </div>
          <button
            onClick={() => createMut.mutate({ email, commission_pct: commission })}
            disabled={createMut.isPending || !email}
            className="w-full py-2 rounded-lg bg-bull text-bull-foreground font-bold text-sm disabled:opacity-50"
          >
            {createMut.isPending ? "Creating…" : "Promote & generate code"}
          </button>
        </div>
      )}

      {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
      {agentRows.length === 0 && !isLoading && (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          No agents yet.
        </div>
      )}

      {agentRows.map((a) => (
        <div key={a.agent_id} className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-sm">
                {a.agent_username || a.agent_user_id?.slice(0, 8)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                commission {Number(a.commission_pct).toFixed(0)}%
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary font-bold tabular-nums">
              {a.referral_code}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
            <Cell label="Clients" v={a.client_count} />
            <Cell label="Deposits" v={`$${Number(a.total_deposits).toFixed(0)}`} bull />
            <Cell label="Withdraws" v={`$${Number(a.total_withdrawals).toFixed(0)}`} bear />
            <Cell label="House" v={`$${Number(a.house_retained).toFixed(0)}`} bull />
          </div>
          {creditOpen === a.agent_user_id ? (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                inputMode="numeric"
                className="flex-1 px-2 py-1.5 rounded-lg bg-surface border border-border text-sm font-bold tabular-nums outline-none"
              />
              <button
                onClick={() =>
                  creditMut.mutate({
                    agent_user_id: a.agent_user_id,
                    amount_usd: Number(creditAmount),
                  })
                }
                disabled={creditMut.isPending}
                className="px-3 py-1.5 rounded-lg bg-bull text-bull-foreground font-bold text-xs disabled:opacity-50"
              >
                Credit
              </button>
              <button
                onClick={() => setCreditOpen(null)}
                className="h-7 w-7 grid place-items-center rounded-lg bg-surface border border-border"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => {
                  setCreditOpen(a.agent_user_id);
                  setCreditAmount("1000");
                }}
                className="py-1.5 rounded-lg bg-surface border border-border text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Wallet className="h-3 w-3" /> Credit
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Reset this agent's real and demo balances to zero?")) {
                    resetMut.mutate({ user_id: a.agent_user_id });
                  }
                }}
                disabled={resetMut.isPending}
                className="py-1.5 rounded-lg bg-surface border border-border text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm("Demote this agent to a normal user and reset balances to zero?")
                  ) {
                    demoteMut.mutate({ user_id: a.agent_user_id });
                  }
                }}
                disabled={demoteMut.isPending}
                className="py-1.5 rounded-lg bg-bear/10 border border-bear/30 text-xs font-bold text-bear flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <UserMinus className="h-3 w-3" /> Demote
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminsTab() {
  const adminsFn = useServerFn(listAdmins);
  const create = useServerFn(createAdminAccount);
  const demote = useServerFn(demoteUserRole);
  const qc = useQueryClient();
  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["admin-admins"],
    queryFn: () => adminsFn(),
  });
  const adminRows = admins as AdminRow[];

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { fullName: string; email: string; password: string }) =>
      create({ data: vars }),
    onSuccess: (r) => {
      toast.success(
        r.promotedExisting ? "Existing user promoted to admin" : "Admin account created",
      );
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirm("");
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create admin"),
  });
  const demoteMut = useMutation({
    mutationFn: (vars: { user_id: string }) =>
      demote({ data: { user_id: vars.user_id, role: "admin", reset_agent_balances: false } }),
    onSuccess: () => {
      toast.success("Admin demoted to user");
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to demote admin"),
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
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          minLength={2}
          required
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@email.com"
          type="email"
          required
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary"
        />
        <div className="relative">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password"
            type={showPassword ? "text" : "password"}
            minLength={8}
            required
            className="w-full px-3 py-2 pr-10 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          type="password"
          minLength={8}
          required
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary"
        />
        <button
          disabled={createMut.isPending}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm glow-primary disabled:opacity-50"
        >
          {createMut.isPending ? "Creating..." : "Create admin"}
        </button>
      </form>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {isLoading && (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
        )}
        {!isLoading && adminRows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No admins found.</div>
        )}
        {adminRows.map((admin) => (
          <div key={admin.id} className="flex items-center justify-between p-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">
                {admin.full_name || admin.username || admin.email}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">{admin.email}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-[10px] text-muted-foreground">
                Joined {new Date(admin.created_at).toLocaleDateString()}
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Demote this admin to a normal user?")) {
                    demoteMut.mutate({ user_id: admin.id });
                  }
                }}
                disabled={demoteMut.isPending}
                className="rounded border border-bear/40 px-1.5 py-0.5 text-[9px] font-bold text-bear disabled:opacity-50"
              >
                <UserMinus className="mr-0.5 inline h-2.5 w-2.5" /> Demote
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LedgerReconciliationTab() {
  const reconcileAll = useServerFn(reconcileAllBalances);
  const auditBalance = useServerFn(auditUserBalance);
  const getStatus = useServerFn(getReconciliationStatus);
  const setAutoEnabled = useServerFn(setAutoReconciliationEnabled);
  const runScheduled = useServerFn(runScheduledLedgerReconciliation);
  const qc = useQueryClient();
  const [auditResults, setAuditResults] = useState<unknown[]>([]);
  const [autoStatus, setAutoStatus] = useState<any>(null);

  // Load automation status on mount
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const result = await getStatus({});
      setAutoStatus(result);
    } catch (e) {
      console.error("Failed to load reconciliation status", e);
    }
  };

  const reconcileMut = useMutation({
    mutationFn: () =>
      reconcileAll({ data: { max_users_to_fix: 1000, reason: "System ledger reconciliation" } }),
    onSuccess: (result) => {
      const data = result as { ok?: boolean; fixed_count?: number; total_discrepancy?: number };
      toast.success(
        `Fixed ${data.fixed_count || 0} accounts, total discrepancy: $${Number(data.total_discrepancy || 0).toFixed(2)}`,
      );
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      loadStatus();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reconciliation failed"),
  });

  const auditMut = useMutation({
    mutationFn: () => auditBalance({ data: {} }),
    onSuccess: (result) => {
      setAuditResults(Array.isArray(result) ? result : []);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Audit failed"),
  });

  const toggleAutoMut = useMutation({
    mutationFn: (enabled: boolean) =>
      setAutoEnabled({ data: { enabled } }),
    onSuccess: (result) => {
      const data = result as { auto_fix_enabled?: boolean; message?: string };
      toast.success(data.message || "Setting updated");
      loadStatus();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update setting"),
  });

  const scheduledMut = useMutation({
    mutationFn: () => runScheduled({}),
    onSuccess: (result) => {
      const data = result as { status?: string; accounts_fixed?: number; message?: string };
      toast.success(data.message || `Fixed ${data.accounts_fixed || 0} accounts`);
      loadStatus();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Scheduled reconciliation failed"),
  });

  return (
    <div className="space-y-3">
      {/* Automation Status Card */}
      {autoStatus && (
        <div className="bg-card border border-border rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Zap className="h-4 w-4 text-primary" /> Automation Status
            </div>
            <div className={`px-2 py-1 rounded text-[10px] font-bold ${autoStatus.auto_fix_enabled ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"}`}>
              {autoStatus.auto_fix_enabled ? "ACTIVE" : "INACTIVE"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="space-y-1">
              <div className="text-muted-foreground">Last Audit</div>
              <div className="font-bold text-xs">{autoStatus.last_audit_at ? new Date(autoStatus.last_audit_at).toLocaleString() : "Never"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">Last Fixed</div>
              <div className="font-bold text-xs">{autoStatus.last_fix_at ? new Date(autoStatus.last_fix_at).toLocaleString() : "Never"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">Pending Issues</div>
              <div className="font-bold text-xs text-bull">{autoStatus.pending_discrepancies || 0}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">Total Fixed (Lifetime)</div>
              <div className="font-bold text-xs">{autoStatus.discrepancies_fixed_lifetime || 0}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => toggleAutoMut.mutate(!autoStatus.auto_fix_enabled)}
              disabled={toggleAutoMut.isPending}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50 transition ${
                autoStatus.auto_fix_enabled
                  ? "border border-bear/30 bg-bear/10 text-bear"
                  : "border border-bull/30 bg-bull/10 text-bull"
              }`}
            >
              {toggleAutoMut.isPending ? "Updating..." : autoStatus.auto_fix_enabled ? "Disable Auto Fix" : "Enable Auto Fix"}
            </button>
            <button
              onClick={() => scheduledMut.mutate()}
              disabled={scheduledMut.isPending}
              className="flex-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary disabled:opacity-50"
            >
              {scheduledMut.isPending ? "Running..." : "Run Audit Now"}
            </button>
          </div>
        </div>
      )}

      {/* Manual Controls Card */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-primary" /> Manual Operations
        </div>
        <p className="text-[10px] text-muted-foreground">
          Verify and manually fix discrepancies between wallet balances and transaction history. All calculations are based on actual deposits, withdrawals, and trade outcomes.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => auditMut.mutate()}
            disabled={auditMut.isPending}
            className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Search className="h-4 w-4" />
            {auditMut.isPending ? "Checking..." : "Audit All Accounts"}
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Fix ALL accounts with balance discrepancies? This will update up to 1000 accounts to match their transaction ledger.",
                )
              ) {
                reconcileMut.mutate();
              }
            }}
            disabled={reconcileMut.isPending}
            className="rounded-xl border border-bull/30 bg-bull/10 px-3 py-2 text-xs font-bold text-bull disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            {reconcileMut.isPending ? "Fixing..." : "Fix All Discrepancies"}
          </button>
        </div>
      </div>

      {auditResults.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Discrepancies Found: {auditResults.length}
            </div>
          </div>
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {(auditResults as Array<{
              user_id: string;
              username?: string;
              account_type: string;
              current_balance: number;
              calculated_balance: number;
              discrepancy: number;
              status: string;
            }>).map((result) => (
              <div key={`${result.user_id}-${result.account_type}`} className="p-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {result.username || result.user_id.slice(0, 8)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {result.account_type.toUpperCase()} · {result.status}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-xs font-bold">
                      Current: ${Number(result.current_balance).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Should be: ${Number(result.calculated_balance).toFixed(2)}
                    </div>
                    <div className={`text-[10px] font-bold ${result.discrepancy > 0 ? "text-bull" : "text-bear"}`}>
                      {result.discrepancy > 0 ? "+" : ""}${Number(result.discrepancy).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  bull,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bull?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
        {icon} {label}
      </div>
      <div className={"font-extrabold tabular-nums text-sm mt-0.5 " + (bull ? "text-bull" : "")}>
        {value}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border " +
        (active
          ? "bg-primary/20 text-primary border-primary/50"
          : "bg-surface text-muted-foreground border-border")
      }
    >
      {children}
    </button>
  );
}

function Cell({
  label,
  v,
  bull,
  bear,
}: {
  label: string;
  v: string | number;
  bull?: boolean;
  bear?: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-[9px] uppercase font-bold">{label}</div>
      <div
        className={
          "font-bold tabular-nums text-xs " + (bull ? "text-bull" : bear ? "text-bear" : "")
        }
      >
        {v}
      </div>
    </div>
  );
}
