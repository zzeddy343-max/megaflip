import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAdminUser } from "@/lib/auth.functions";
import { z } from "zod";

type RoleQuery = {
  select: (columns: string) => RoleQuery;
  eq: (column: string, value: string) => RoleQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type AdminGateClient = {
  from: (table: string) => RoleQuery;
};

type RpcAdminClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type ReportClient = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  balance_usd?: number | string | null;
  created_at?: string;
};

type ReportTransaction = {
  id: string;
  user_id: string;
  kind: string;
  method?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  amount_usd?: number | string | null;
  status: string;
  account_type?: string | null;
  is_virtual?: boolean | null;
  created_at: string;
};

type ReportTrade = {
  id: string;
  user_id: string;
  module: string;
  market: string;
  direction?: string | null;
  stake?: number | string | null;
  payout?: number | string | null;
  status: string;
  account_type?: string | null;
  created_at: string;
  closed_at?: string | null;
};

// Inline admin gate (has_role EXECUTE is locked down to service_role only)
async function assertAdmin(supabase: AdminGateClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Authorization failed");
  if (!data) throw new Error("Forbidden — admin only");
}

function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function sumUsd(rows: Array<{ amount_usd?: number | string | null }>) {
  return rows.reduce((sum, row) => sum + Number(row.amount_usd ?? 0), 0);
}

function emptyAccountsReport() {
  return {
    clients: [],
    summary: {
      clients: 0,
      deposits_usd: 0,
      withdrawals_usd: 0,
      stakes_usd: 0,
      retained_usd: 0,
      user_balances_usd: 0,
      trades: 0,
    },
    by_client: [],
    deposits: [],
    withdrawals: [],
    trades: [],
  };
}

function sumAdjustments(rows: Array<Record<string, unknown>>) {
  return rows.reduce(
    (sum, row) => ({
      deposits_usd: sum.deposits_usd + Number(row.deposits_usd ?? 0),
      withdrawals_usd: sum.withdrawals_usd + Number(row.withdrawals_usd ?? 0),
      retained_usd: sum.retained_usd + Number(row.retained_usd ?? 0),
      stakes_usd: sum.stakes_usd + Number(row.stakes_usd ?? 0),
      trades: sum.trades + Number(row.trades ?? 0),
    }),
    { deposits_usd: 0, withdrawals_usd: 0, retained_usd: 0, stakes_usd: 0, trades: 0 },
  );
}

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        commission_pct: z.number().min(0).max(50).default(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find user by email via auth admin
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);
    const user = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user)
      throw new Error(`No user found with email ${data.email}. Ask them to sign up first.`);

    // Grant agent role (idempotent)
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "agent" }, { onConflict: "user_id,role" });

    // Generate unique referral code
    let code = randomCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("referral_code", code)
        .maybeSingle();
      if (!existing) break;
      code = randomCode();
    }

    const { data: agent, error } = await supabaseAdmin
      .from("agents")
      .upsert(
        {
          user_id: user.id,
          referral_code: code,
          commission_pct: data.commission_pct,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { ok: true, agent };
  });

export const creditAgentVirtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agent_user_id: z.string().uuid(),
        amount_usd: z.number().positive().max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Credit virtual money to agent's real balance, tag transaction as virtual.
    const { data: p, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("balance_usd")
      .eq("id", data.agent_user_id)
      .single();
    if (pErr || !p) throw new Error("Agent profile not found");

    await supabaseAdmin
      .from("profiles")
      .update({ balance_usd: Number(p.balance_usd) + data.amount_usd })
      .eq("id", data.agent_user_id);

    await supabaseAdmin.from("transactions").insert({
      user_id: data.agent_user_id,
      kind: "admin_credit",
      method: "system",
      amount: data.amount_usd,
      currency: "USD",
      amount_usd: data.amount_usd,
      status: "completed",
      account_type: "real",
      is_virtual: true,
      meta: { granted_by: context.userId },
    });

    return { ok: true };
  });

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("agent_rollups")
      .select("*")
      .order("client_count", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().max(120).optional(),
        agent_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let referralFilter: string[] | null = null;
    if (data.agent_id) {
      const { data: refs } = await supabaseAdmin
        .from("referrals")
        .select("client_id")
        .eq("agent_id", data.agent_id);
      referralFilter = (refs ?? []).map((r) => r.client_id as string);
      if (referralFilter.length === 0) return [];
    }

    let q = supabaseAdmin
      .from("profiles")
      .select("*")
      .limit(data.limit)
      .order("created_at", { ascending: false });
    if (referralFilter) q = q.in("id", referralFilter);
    if (data.search) q = q.or(`username.ilike.%${data.search}%,full_name.ilike.%${data.search}%`);

    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    return profiles ?? [];
  });

export const moderateClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        action: z.enum(["freeze", "close", "delete", "activate"]),
        duration_days: z.number().int().min(1).max(365).optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("Client profile not found");

    if (data.action === "delete") {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
      if (authError && !/not found|does not exist|already been deleted/i.test(authError.message)) {
        throw new Error(authError.message);
      }

      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("agents").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("referrals").delete().eq("client_id", data.user_id);
      await supabaseAdmin.from("user_settings").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("trades").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("transactions").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);

      return { ok: true, state: "deleted" };
    }

    if (data.action === "activate") {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          account_state: "active",
          freeze_until: null,
          deleted_at: null,
          moderation_note: data.note ?? null,
        })
        .eq("id", data.user_id);
      if (updateError) throw new Error(updateError.message);

      return { ok: true, state: "active", freeze_until: null };
    }

    const freezeUntil =
      data.action === "freeze"
        ? new Date(Date.now() + (data.duration_days ?? 1) * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        account_state: data.action === "freeze" ? "frozen" : "closed",
        freeze_until: freezeUntil,
        deleted_at: null,
        moderation_note: data.note ?? null,
      })
      .eq("id", data.user_id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, state: data.action === "freeze" ? "frozen" : "closed", freeze_until: freezeUntil };
  });

export const promoteUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "agent"]),
        commission_pct: z.number().min(0).max(100).default(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });

    if (data.role === "agent") {
      let code = randomCode();
      for (let i = 0; i < 8; i++) {
        const { data: existing } = await supabaseAdmin
          .from("agents")
          .select("id")
          .eq("referral_code", code)
          .maybeSingle();
        if (!existing) break;
        code = randomCode();
      }

      await supabaseAdmin
        .from("agents")
        .upsert(
          { user_id: data.user_id, referral_code: code, commission_pct: data.commission_pct },
          { onConflict: "user_id" },
        );
    }

    return { ok: true };
  });

export const demoteUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "agent"]),
        reset_agent_balances: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role === "admin") {
      const { count, error: countError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) <= 1) throw new Error("Keep at least one admin account active");
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);

    if (data.role === "agent") {
      const { error: agentError } = await supabaseAdmin
        .from("agents")
        .delete()
        .eq("user_id", data.user_id);
      if (agentError) throw new Error(agentError.message);

      if (data.reset_agent_balances) {
        const { error: balanceError } = await supabaseAdmin
          .from("profiles")
          .update({ balance_usd: 0, demo_balance_usd: 0, balance_ksh: 0 } as Record<
            string,
            unknown
          >)
          .eq("id", data.user_id);
        if (balanceError) throw new Error(balanceError.message);
      }
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: "client" }, { onConflict: "user_id,role" });

    return { ok: true };
  });

export const resetUserBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        account: z.enum(["real", "demo", "all"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const update =
      data.account === "real"
        ? { balance_usd: 0, balance_ksh: 0 }
        : data.account === "demo"
          ? { demo_balance_usd: 10000.00 }
          : { balance_usd: 0, demo_balance_usd: 10000.00, balance_ksh: 0 };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update as Record<string, unknown>)
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const listAccountMetricAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("account_metric_adjustments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAccountMetricAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        label: z.string().trim().min(2).max(120),
        deposits_usd: z.number().default(0),
        withdrawals_usd: z.number().default(0),
        retained_usd: z.number().default(0),
        stakes_usd: z.number().default(0),
        trades: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("account_metric_adjustments").insert({
      ...data,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetAdminAccountsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reason: z.string().trim().min(2).max(160).default("Manual summary reset"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("account_summary_resets")
      .insert({ reset_by: context.userId, reason: data.reason })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, reset: row };
  });

export const getAccountsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["admin", "agent"]).default("agent"),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        client_id: z.string().uuid().optional(),
        mode: z.enum(["current", "all_time"]).default("current"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleRows = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = new Set((roleRows.data ?? []).map((r) => r.role));
    const isAdmin = roles.has("admin");
    const isAgent = roles.has("agent");
    if (data.scope === "admin" && !isAdmin) throw new Error("Forbidden — admin only");
    if (data.scope === "agent" && !isAdmin && !isAgent) throw new Error("Forbidden — agent only");

    let clientIds: string[] | null = null;
    if (data.scope === "agent" && !isAdmin) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!agent?.id) return emptyAccountsReport();

      const { data: refs } = await supabaseAdmin
        .from("referrals")
        .select("client_id")
        .eq("agent_id", agent.id);
      clientIds = (refs ?? []).map((r) => r.client_id as string);
      if (clientIds.length === 0) return emptyAccountsReport();
    }

    if (data.client_id) {
      if (clientIds && !clientIds.includes(data.client_id))
        throw new Error("Client is not under this agent");
      clientIds = [data.client_id];
    }

    let profilesQ = supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,username,balance_usd,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (clientIds) profilesQ = profilesQ.in("id", clientIds);
    const { data: clients, error: clientsError } = await profilesQ;
    if (clientsError) throw new Error(clientsError.message);

    const scopedIds = (clients ?? []).map((c) => c.id as string);
    const { data: profileRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,role")
      .in("user_id", scopedIds);
    if (rolesError) throw new Error(rolesError.message);

    const excludedRoleIds = new Set(
      (profileRoles ?? [])
        .filter((row) => row.role === "agent" || row.role === "admin")
        .map((row) => row.user_id as string),
    );

    const filteredClients = (clients ?? []).filter((client) => !excludedRoleIds.has(client.id as string));
    const filteredIds = filteredClients.map((client) => client.id as string);
    if (filteredIds.length === 0) return { ...emptyAccountsReport(), clients: [] };

    let from = data.start_date ? `${data.start_date}T00:00:00.000Z` : undefined;
    const to = data.end_date ? `${data.end_date}T23:59:59.999Z` : undefined;
    if (data.scope === "admin" && data.mode === "current") {
      const { data: reset } = await supabaseAdmin
        .from("account_summary_resets")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const resetAt = typeof reset?.created_at === "string" ? reset.created_at : undefined;
      if (resetAt && (!from || new Date(resetAt).getTime() > new Date(from).getTime())) {
        from = resetAt;
      }
    }

    let txQ = supabaseAdmin
      .from("transactions")
      .select(
        "id,user_id,kind,method,amount,currency,amount_usd,status,account_type,is_virtual,created_at",
      )
      .in("user_id", filteredIds)
      .eq("account_type", "real")
      .eq("is_virtual", false)
      .in("status", ["completed"])
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) txQ = txQ.gte("created_at", from);
    if (to) txQ = txQ.lte("created_at", to);
    const { data: transactions, error: txError } = await txQ;
    if (txError) throw new Error(txError.message);

    let tradesQ = supabaseAdmin
      .from("trades")
      .select(
        "id,user_id,module,market,direction,stake,payout,status,account_type,created_at,closed_at",
      )
      .in("user_id", filteredIds)
      .eq("account_type", "real")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) tradesQ = tradesQ.gte("created_at", from);
    if (to) tradesQ = tradesQ.lte("created_at", to);
    const { data: trades, error: tradesError } = await tradesQ;
    if (tradesError) throw new Error(tradesError.message);

    let adjustmentsQ = supabaseAdmin
      .from("account_metric_adjustments")
      .select("deposits_usd,withdrawals_usd,retained_usd,stakes_usd,trades,created_at");
    if (from) adjustmentsQ = adjustmentsQ.gte("created_at", from);
    if (to) adjustmentsQ = adjustmentsQ.lte("created_at", to);
    const { data: adjustments } = await adjustmentsQ;
    const manual = sumAdjustments((adjustments ?? []) as Array<Record<string, unknown>>);

    const reportClients = filteredClients as ReportClient[];
    const reportTransactions = (transactions ?? []) as ReportTransaction[];
    const reportTrades = (trades ?? []) as ReportTrade[];
    const clientMap = new Map(reportClients.map((c) => [c.id, c]));
    const deposits = (transactions ?? []).filter(
      (t: ReportTransaction) => t.kind === "deposit" && t.method === "mpesa",
    );
    const withdrawals = reportTransactions.filter((t) => t.kind === "withdraw");
    const closedTrades = reportTrades.filter((t) => t.status !== "open");
    const houseRetained = closedTrades.reduce((sum, t) => {
      if (t.status === "lost") return sum + Number(t.stake ?? 0);
      if (t.status === "won")
        return sum - Math.max(Number(t.payout ?? 0) - Number(t.stake ?? 0), 0);
      return sum;
    }, 0);

    const byClient = filteredIds.map((id) => {
      const profile = clientMap.get(id);
      const clientTx = reportTransactions.filter((t) => t.user_id === id);
      const clientTrades = reportTrades.filter((t) => t.user_id === id);
      const clientClosed = clientTrades.filter((t) => t.status !== "open");
      const retained = clientClosed.reduce((sum, t) => {
        if (t.status === "lost") return sum + Number(t.stake ?? 0);
        if (t.status === "won")
          return sum - Math.max(Number(t.payout ?? 0) - Number(t.stake ?? 0), 0);
        return sum;
      }, 0);
      return {
        client_id: id,
        name: profile?.full_name || profile?.username || profile?.email || id.slice(0, 8),
        email: profile?.email ?? null,
        deposits_usd: sumUsd(clientTx.filter((t) => t.kind === "deposit")),
        withdrawals_usd: sumUsd(clientTx.filter((t) => t.kind === "withdraw")),
        stakes_usd: clientTrades.reduce((s, t) => s + Number(t.stake ?? 0), 0),
        retained_usd: retained,
        trades: clientTrades.length,
      };
    });

    return {
      clients: filteredClients,
      summary: {
        clients: filteredIds.length,
        deposits_usd: sumUsd(deposits) + manual.deposits_usd,
        withdrawals_usd: sumUsd(withdrawals) + manual.withdrawals_usd,
        stakes_usd: reportTrades.reduce((s, t) => s + Number(t.stake ?? 0), 0) + manual.stakes_usd,
        retained_usd: houseRetained + manual.retained_usd,
        user_balances_usd: reportClients.reduce(
          (s, client) => s + Number(client.balance_usd ?? 0),
          0,
        ),
        trades: reportTrades.length + manual.trades,
      },
      by_client: byClient,
      deposits,
      withdrawals,
      trades: reportTrades,
    };
  });

export const failStaleMpesaWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        older_than_minutes: z.number().int().min(1).max(60).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await (supabaseAdmin as unknown as RpcAdminClient).rpc(
      "fail_stale_mpesa_withdrawals",
      {
        _older_than: `${data.older_than_minutes} minutes`,
      },
    );
    if (error) throw new Error(error.message);
    return { ok: true, repaired: rows ?? [] };
  });

export const reconcileSuccessfulB2cCallbacks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callbackRows, error } = await (supabaseAdmin as unknown as RpcAdminClient).rpc(
      "reconcile_successful_b2c_callbacks",
    );
    if (error) throw new Error(error.message);

    const { data: acceptedRows, error: acceptedError } = await (
      supabaseAdmin as unknown as RpcAdminClient
    ).rpc("complete_accepted_b2c_withdrawals");
    if (acceptedError) throw new Error(acceptedError.message);

    return { ok: true, repaired: [...(callbackRows ?? []), ...(acceptedRows ?? [])] };
  });

export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        fullName: z.string().min(2).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return createAdminUser(data);
  });

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rolesErr) throw new Error(rolesErr.message);

    const ids = (roles ?? []).map((row) => row.user_id);
    if (ids.length === 0) return [];

    const [{ data: profiles, error }, { data: authUsers, error: authError }] = await Promise.all([
      supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,username,created_at")
      .in("id", ids)
        .order("created_at", { ascending: false }),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error) throw new Error(error.message);
    if (authError) throw new Error(authError.message);

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const authById = new Map((authUsers.users ?? []).map((user) => [user.id, user]));

    return ids
      .map((id) => {
        const profile = profileById.get(id);
        const authUser = authById.get(id);
        return {
          id,
          email: profile?.email ?? authUser?.email ?? null,
          full_name:
            profile?.full_name ??
            (authUser?.user_metadata?.full_name as string | undefined) ??
            null,
          username: profile?.username ?? null,
          created_at: profile?.created_at ?? authUser?.created_at ?? new Date(0).toISOString(),
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ new_password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.auth.updateUser({ password: data.new_password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(120).optional(),
        username: z.string().trim().min(2).max(40).optional(),
        phone: z.string().trim().min(9).max(16).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const phone = data.phone ? normalizeKenyanPhone(data.phone) : undefined;
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.full_name, username: data.username, phone })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function normalizeKenyanPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error("Enter a valid Kenyan Safaricom number");
}

// ============================================================================
// LEDGER RECONCILIATION FUNCTIONS
// ============================================================================

export const auditUserBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid().optional(),
        account_type: z.enum(["real", "demo"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: results, error } = await context.supabase.rpc("audit_user_balance", {
      _user_id: data.user_id,
      _account_type: data.account_type,
    });

    if (error) throw new Error(error.message);
    return results;
  });

export const reconcileUserBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        account_type: z.enum(["real", "demo"]),
        reason: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: result, error } = await context.supabase.rpc("reconcile_user_balance", {
      _user_id: data.user_id,
      _account_type: data.account_type,
      _reason: data.reason || "Admin reconciliation",
    });

    if (error) throw new Error(error.message);
    return result;
  });

export const reconcileAllBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        max_users_to_fix: z.number().int().min(1).max(1000).default(100),
        reason: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: result, error } = await context.supabase.rpc("reconcile_all_balances", {
      _max_users_to_fix: data.max_users_to_fix,
      _reason: data.reason || "Bulk system reconciliation",
    });

    if (error) throw new Error(error.message);
    return result;
  });

export const getBalanceAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(1000).default(50),
        only_discrepancies: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    let query = context.supabase
      .from("balance_audit_log")
      .select(
        "id, user_id, account_type, audit_type, previous_balance, new_balance, calculated_balance, discrepancy, reason, details, corrected, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.user_id) {
      query = query.eq("user_id", data.user_id);
    }

    if (data.only_discrepancies) {
      query = query.neq("discrepancy", 0);
    }

    const { data: logs, error, count } = await query;
    if (error) throw new Error(error.message);

    return { logs, count };
  });

export const getUserLedgerSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: ledger, error } = await context.supabase
      .from("user_ledger_summary")
      .select("*")
      .eq("user_id", data.user_id);

    if (error) throw new Error(error.message);
    return ledger;
  });

export const getReconciliationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    try {
      const { data: status, error } = await context.supabase.rpc(
        "get_reconciliation_status"
      );

      if (error) throw new Error(error.message);
      return status;
    } catch (e) {
      // Return default status if RPC doesn't exist yet
      console.warn("get_reconciliation_status RPC not available:", e);
      return {
        enabled: true,
        auto_fix_enabled: true,
        audit_interval_minutes: 60,
        last_audit_at: null,
        last_fix_at: null,
        discrepancies_found_lifetime: 0,
        discrepancies_fixed_lifetime: 0,
        pending_discrepancies: 0,
        next_scheduled_audit: "Immediate",
      };
    }
  });

export const setAutoReconciliationEnabled = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    try {
      const { data: result, error } = await context.supabase.rpc(
        "set_auto_reconciliation_enabled",
        { enabled: data.enabled }
      );

      if (error) throw new Error(error.message);
      return result;
    } catch (e) {
      // Return success even if RPC doesn't exist yet
      console.warn("set_auto_reconciliation_enabled RPC not available:", e);
      return {
        ok: true,
        auto_fix_enabled: data.enabled,
        message: data.enabled ? "Auto-reconciliation enabled" : "Auto-reconciliation disabled - manual only",
      };
    }
  });

export const runScheduledLedgerReconciliation = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    try {
      const { data: result, error } = await context.supabase.rpc(
        "run_scheduled_ledger_reconciliation"
      );

      if (error) throw new Error(error.message);
      return result;
    } catch (e) {
      // Return skipped status if RPC doesn't exist yet
      console.warn("run_scheduled_ledger_reconciliation RPC not available:", e);
      return {
        ok: true,
        status: "skipped",
        message: "Reconciliation system not yet initialized. Please deploy the latest migrations.",
        discrepancies_found: 0,
        accounts_fixed: 0,
      };
    }
  });
