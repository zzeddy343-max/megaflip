import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  applyVolatilityToPayout,
  getEffectiveStakeLimits,
  readSystemSettings,
  type SystemSettings,
} from "@/lib/system-settings";
import { shouldControlledBinaryTradeWin } from "@/lib/controlled-binary-outcomes";
export { isTradeStatusCompletedEnumError } from "@/lib/trade-errors";
import { isTradeStatusCompletedEnumError } from "@/lib/trade-errors";

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: TradeResult | unknown; error: { message?: string } | null }>;
};

type TradeResult = {
  id?: string;
};

type TradeCloseResult = {
  ok?: boolean;
  payout?: number;
  pnl?: number;
  status?: string;
  won?: boolean;
  controlled?: boolean;
};

const PlaceTradeInput = z.object({
  module: z.enum(["forex", "binary", "aviator", "predict", "crypto"]),
  market: z.string().min(1).max(64),
  direction: z.string().min(1).max(16),
  stake: z.number().positive().max(1_000_000),
  entry_price: z.number().nullable().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

export const placeTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlaceTradeInput.parse(d))
  .handler(async ({ data, context }) => {
    const settings = await readSystemSettings();
    const supabase = context.supabase as unknown as RpcClient & { from: (table: string) => any };
    await enforceTradeRiskRules(supabase, context.userId, data, settings);

    const { data: trade, error } = await supabase.rpc("place_trade", {
      _module: data.module,
      _market: data.market,
      _direction: data.direction,
      _stake: data.stake,
      _entry_price: data.entry_price ?? null,
      _meta: data.meta ?? {},
    });
    if (error) {
      console.error("[Trades] place_trade failed", {
        userId: context.userId,
        module: data.module,
        market: data.market,
        direction: data.direction,
        stake: data.stake,
        error,
      });
      throw new Error(`Could not place ${data.module} trade: ${error.message ?? String(error)}`);
    }
    console.info("[Trades] place_trade succeeded", {
      userId: context.userId,
      tradeId: (trade as TradeResult | null)?.id,
      module: data.module,
      market: data.market,
      direction: data.direction,
      stake: data.stake,
    });
    return trade;
  });

const SettleTradeInput = z.object({
  trade_id: z.string().uuid(),
  won: z.boolean(),
  exit_price: z.number().nullable().optional(),
  multiplier: z.number().positive().nullable().optional(),
});

export const settleTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettleTradeInput.parse(d))
  .handler(async ({ data, context }) => {
    const settings = await readSystemSettings();
    const supabase = context.supabase as unknown as RpcClient & { from: (table: string) => any };
    const outcome = await resolveControlledBinaryOutcome(
      supabase,
      context.userId,
      data.trade_id,
      data.won,
    );
    const { data: result, error } = await supabase.rpc("settle_trade", {
      _trade_id: data.trade_id,
      _won: outcome.won,
      _exit_price: data.exit_price ?? null,
      _multiplier: data.multiplier ?? null,
    });
    if (error) {
      console.error("[Trades] settle_trade failed", {
        userId: context.userId,
        tradeId: data.trade_id,
        won: outcome.won,
        error,
      });
      const message = error.message ?? String(error);
      if (isTradeStatusCompletedEnumError(message)) {
        const fallback = await settleTradeWithAdminFallback(
          context.userId,
          data.trade_id,
          outcome.won,
          data.exit_price ?? null,
          data.multiplier ?? null,
        );
        return {
          ...fallback,
          controlled: outcome.controlled,
          status: outcome.won ? "won" : "lost",
          won: outcome.won,
        };
      }
      throw new Error(`Could not settle trade ${data.trade_id}: ${error.message ?? String(error)}`);
    }
    const payout = Number((result as { payout?: number | null } | null)?.payout ?? 0);
    if (outcome.won && payout > 0) {
      const adjustedPayout = applyVolatilityToPayout(payout, settings);
      if (adjustedPayout !== payout) {
        try {
          await adjustSettledPayout(
            supabase,
            context.userId,
            data.trade_id,
            payout,
            adjustedPayout,
          );
        } catch (adjustError) {
          console.warn("[Trades] payout adjustment skipped after settlement", {
            userId: context.userId,
            tradeId: data.trade_id,
            error: adjustError instanceof Error ? adjustError.message : String(adjustError),
          });
        }
      }
    }

    console.info("[Trades] settle_trade succeeded", {
      userId: context.userId,
      tradeId: data.trade_id,
      won: outcome.won,
      controlled: outcome.controlled,
      payout,
    });
    return {
      ...(result as Record<string, unknown>),
      payout,
      status: outcome.won ? "won" : "lost",
      won: outcome.won,
      controlled: outcome.controlled,
    };
  });

export const releaseStaleBinaryTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as RpcClient & { from: (table: string) => any };
    // Make the stale-release more resilient: attempt once, on error retry once after small delay
    try {
      const released = await cancelStaleBinaryTrades(supabase, context.userId);
      return { ok: true, released };
    } catch (err) {
      console.warn("[Trades] releaseStaleBinaryTrades failed, retrying once", {
        userId: context.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await new Promise((r) => setTimeout(r, 250));
        const released = await cancelStaleBinaryTrades(supabase, context.userId);
        return { ok: true, released };
      } catch (err2) {
        console.error("[Trades] releaseStaleBinaryTrades failed after retry", {
          userId: context.userId,
          error: err2 instanceof Error ? err2.message : String(err2),
        });
        // Return ok=false to allow client to handle gracefully
        return { ok: false, released: 0 };
      }
    }
  });

async function resolveControlledBinaryOutcome(
  supabase: any,
  userId: string,
  tradeId: string,
  requestedWon: boolean,
) {
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .select("id,module,account_type,status")
    .eq("id", tradeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (tradeError) throw new Error(tradeError.message);
  if (!trade || trade.module !== "binary" || trade.status !== "open") {
    return { won: requestedWon, controlled: false };
  }

  const accountType = trade.account_type === "demo" ? "demo" : "real";
  const isAgentReal = accountType === "real" && (await userHasRole(supabase, userId, "agent"));
  if (accountType !== "demo" && !isAgentReal) {
    return { won: requestedWon, controlled: false };
  }

  const { count, error: countError } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("module", "binary")
    .eq("account_type", accountType)
    .in("status", ["won", "lost"]);

  if (countError) throw new Error(countError.message);

  return {
    won: shouldControlledBinaryTradeWin(userId, accountType, count ?? 0),
    controlled: true,
  };
}

async function userHasRole(supabase: any, userId: string, role: "agent" | "admin" | "client") {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export const getWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("balance_usd,demo_balance_usd,active_account")
      .eq("id", context.userId)
      .maybeSingle();
    const active = data?.active_account === "demo" ? "demo" : "real";
    const balance = active === "demo" ? data?.demo_balance_usd : data?.balance_usd;
    return {
      account_mode: active,
      balance_cents: Math.round(Number(balance ?? 0) * 100),
      real_balance_cents: Math.round(Number(data?.balance_usd ?? 0) * 100),
      demo_balance_cents: Math.round(Number(data?.demo_balance_usd ?? 0) * 100),
    };
  });

export const listMyTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("trades")
      .select(
        "id,market,direction,stake,payout,status,meta,created_at,closed_at,entry_price,exit_price",
      )
      .eq("user_id", context.userId)
      .eq("module", "binary")
      .order("created_at", { ascending: false })
      .limit(80);

    return (data ?? []).map((trade: any) => {
      const stakeCents = Math.round(Number(trade.stake ?? 0) * 100);
      const payoutCents = Math.round(Number(trade.payout ?? 0) * 100);
      const multiplier =
        stakeCents > 0 && payoutCents > 0
          ? payoutCents / stakeCents
          : Number(trade.meta?.multiplier ?? 1.95);
      return {
        id: trade.id,
        market: trade.market,
        direction: trade.direction,
        status: normalizeTradeStatus(trade.status),
        stake_cents: stakeCents,
        payout_cents: payoutCents,
        payout_multiplier: multiplier,
        ticks: Number(trade.meta?.settlement_ticks ?? trade.meta?.ticks ?? 1),
        contract_type: trade.meta?.contract_type ?? "even_odd",
        digit_target: trade.meta?.digit_target ?? null,
        opened_at: trade.created_at,
        settled_at: trade.closed_at,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
      };
    });
  });

export const listMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("transactions")
      .select("id,kind,amount_usd,created_at,meta")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(80);

    let balanceCents = 0;
    return (data ?? []).map((txn: any) => {
      const amountCents = Math.round(Number(txn.amount_usd ?? 0) * 100);
      balanceCents += amountCents;
      return {
        id: txn.id,
        type: txn.kind,
        amount_cents: amountCents,
        balance_after_cents: balanceCents,
        created_at: txn.created_at,
      };
    });
  });

export const settleDueTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as RpcClient & { from: (table: string) => any };
    const released = await cancelStaleBinaryTrades(supabase, context.userId);
    return { settled: released, released };
  });

async function enforceTradeRiskRules(
  supabase: any,
  userId: string,
  input: { module: string; market: string; stake: number; direction: string },
  settings: SystemSettings,
) {
  const accountProfile = await supabase
    .from("profiles")
    .select("active_account,account_state,freeze_until")
    .eq("id", userId)
    .maybeSingle();
  const accountType = accountProfile?.data?.active_account ?? "real";
  const accountState = accountProfile?.data?.account_state ?? "active";
  const freezeUntil = accountProfile?.data?.freeze_until;

  if (accountState === "closed" || accountState === "deleted") {
    throw new Error("This account is locked. Contact support.");
  }

  if (accountState === "frozen") {
    if (freezeUntil && new Date(freezeUntil).getTime() <= Date.now()) {
      await supabase
        .from("profiles")
        .update({ account_state: "active", freeze_until: null })
        .eq("id", userId);
    } else {
      throw new Error("This account is frozen. Contact support.");
    }
  }

  if (input.module === "binary") {
    try {
      await cancelStaleBinaryTrades(supabase, userId, accountType);
    } catch (error) {
      console.warn("[Trades] stale binary cleanup skipped during pre-trade guard", {
        userId,
        accountType,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const { count: openBinaryCount } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("account_type", accountType)
      .eq("module", "binary")
      .eq("status", "open");
    if ((openBinaryCount ?? 0) > 0) {
      throw new Error("You already have one open binary contract. Wait for it to settle first.");
    }
  }

  const { minStake, maxStake } = getEffectiveStakeLimits(settings);

  if (input.stake < minStake) {
    throw new Error(`Minimum stake is $${minStake.toFixed(2)}`);
  }

  if (input.stake > maxStake) {
    throw new Error(`Maximum stake is $${maxStake.toFixed(2)}`);
  }
}

async function cancelStaleBinaryTrades(supabase: any, userId: string, accountType?: string) {
  const staleBefore = new Date(Date.now() - 60_000).toISOString();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("trades")
      .select("id,stake,account_type")
      .eq("user_id", userId)
      .eq("module", "binary")
      .eq("status", "open")
      .lt("created_at", staleBefore)
      .limit(1000);

    if (accountType) query = query.eq("account_type", accountType);

    const { data: staleTrades, error: staleError } = await query;
    if (staleError) throw new Error(staleError.message);

    let released = 0;
    for (const trade of staleTrades ?? []) {
      const cancelled = await cancelOpenTradeWithRefund(
        supabaseAdmin,
        userId,
        trade.id,
        "stale_binary_timeout",
      );
      if (cancelled) released += 1;
    }
    released += await cancelDuplicateOpenBinaryTrades(supabaseAdmin, userId, accountType);
    return released;
  } catch (error) {
    if (isTradeStatusCompletedEnumError(error instanceof Error ? error.message : String(error))) {
      console.warn(
        "[Trades] admin stale cancellation failed with stale trade_status enum, using RPC fallback",
        {
          userId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return cancelStaleBinaryTradesWithRpc(supabase, userId, staleBefore, accountType);
    }

    if (!isAdminClientUnavailable(error)) throw error;

    console.warn("[Trades] admin stale cancellation unavailable, using RPC fallback", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return cancelStaleBinaryTradesWithRpc(supabase, userId, staleBefore, accountType);
  }
}

function isAdminClientUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Missing Supabase environment variable|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL/i.test(
    message,
  );
}

async function cancelStaleBinaryTradesWithRpc(
  supabase: any,
  userId: string,
  staleBefore: string,
  accountType?: string,
) {
  let staleQuery = supabase
    .from("trades")
    .select("id,account_type")
    .eq("user_id", userId)
    .eq("module", "binary")
    .eq("status", "open")
    .lt("created_at", staleBefore)
    .limit(1000);
  if (accountType) staleQuery = staleQuery.eq("account_type", accountType);

  const { data: staleTrades, error: staleError } = await staleQuery;
  if (staleError) throw new Error(staleError.message);

  let released = 0;
  for (const trade of staleTrades ?? []) {
    const cancelled = await cancelOpenTradeRpcOrFallback(
      supabase,
      trade.id,
      trade.account_type,
      "stale_binary_timeout",
    );
    if (cancelled) released += 1;
  }

  let openQuery = supabase
    .from("trades")
    .select("id,account_type,created_at")
    .eq("user_id", userId)
    .eq("module", "binary")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (accountType) openQuery = openQuery.eq("account_type", accountType);

  const { data: openTrades, error: openError } = await openQuery;
  if (openError) throw new Error(openError.message);

  const seenAccounts = new Set<string>();
  for (const trade of openTrades ?? []) {
    const account = trade.account_type === "demo" ? "demo" : "real";
    if (!seenAccounts.has(account)) {
      seenAccounts.add(account);
      continue;
    }

    const cancelled = await cancelOpenTradeRpcOrFallback(
      supabase,
      trade.id,
      trade.account_type,
      "duplicate_binary_open_guard",
    );
    if (cancelled) released += 1;
  }

  return released;
}

async function cancelOpenTradeRpcOrFallback(
  supabase: any,
  tradeId: string,
  accountType: string | null | undefined,
  reason: string,
) {
  const { error } = await supabase.rpc("cancel_open_trade", { _trade_id: tradeId });
  if (!error) return true;

  const message = error.message ?? String(error);
  if (!isTradeStatusCompletedEnumError(message)) {
    if (/Trade not found/i.test(message)) {
      console.warn(
        "[Trades] cancel_open_trade RPC returned Trade not found, skipping stale trade cleanup",
        {
          tradeId,
          accountType,
          reason,
          error: message,
        },
      );
      return false;
    }
    throw new Error(`Could not cancel stale trade ${tradeId}: ${message}`);
  }

  console.warn("[Trades] cancel_open_trade RPC stale, using direct update fallback", {
    tradeId,
    accountType,
    reason,
    error: message,
  });

  return cancelOpenTradeWithRpcFallback(supabase, tradeId, accountType, reason);
}

async function cancelOpenTradeWithRpcFallback(
  supabase: any,
  tradeId: string,
  accountType: string | null | undefined,
  reason: string,
) {
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .select("id,stake,account_type,user_id,meta")
    .eq("id", tradeId)
    .eq("status", "open")
    .maybeSingle();
  if (tradeError) throw new Error(tradeError.message);
  if (!trade) return false;

  const stake = Number(trade.stake ?? 0);
  const account = trade.account_type === "demo" ? "demo" : "real";
  const closedAt = new Date().toISOString();
  const meta = {
    ...(trade.meta ?? {}),
    cancelled_by_system: true,
    reason,
  } as Record<string, unknown>;

  const { data: cancelled, error: cancelError } = await supabase
    .from("trades")
    .update({
      status: "cancelled",
      payout: stake,
      closed_at: closedAt,
      meta,
    } as Record<string, unknown>)
    .eq("id", tradeId)
    .eq("status", "open")
    .select("id,stake,account_type,user_id")
    .maybeSingle();
  if (cancelError) throw new Error(cancelError.message ?? String(cancelError));
  if (!cancelled) return false;

  const balanceField = account === "demo" ? "demo_balance_usd" : "balance_usd";
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(balanceField)
    .eq("id", cancelled.user_id)
    .single();
  if (profileError) throw new Error(profileError.message);

  const { error: balanceError } = await supabase
    .from("profiles")
    .update({ [balanceField]: Number(profile?.[balanceField] ?? 0) + stake } as Record<
      string,
      unknown
    >)
    .eq("id", cancelled.user_id);
  if (balanceError) throw new Error(balanceError.message);

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: cancelled.user_id,
    kind: "trade_payout",
    method: "system",
    account_type: account,
    amount: stake,
    currency: "USD",
    amount_usd: stake,
    status: "completed",
    is_virtual: account === "demo",
    meta: { trade_id: cancelled.id, reason },
  });
  if (txError) throw new Error(txError.message);

  return true;
}

async function cancelDuplicateOpenBinaryTrades(
  supabaseAdmin: any,
  userId: string,
  accountType?: string,
) {
  let query = supabaseAdmin
    .from("trades")
    .select("id,account_type,created_at")
    .eq("user_id", userId)
    .eq("module", "binary")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (accountType) query = query.eq("account_type", accountType);

  const { data: openTrades, error } = await query;
  if (error) throw new Error(error.message);

  const seenAccounts = new Set<string>();
  let released = 0;
  for (const trade of openTrades ?? []) {
    const account = trade.account_type === "demo" ? "demo" : "real";
    if (!seenAccounts.has(account)) {
      seenAccounts.add(account);
      continue;
    }

    const cancelled = await cancelOpenTradeWithRefund(
      supabaseAdmin,
      userId,
      trade.id,
      "duplicate_binary_open_guard",
    );
    if (cancelled) released += 1;
  }
  return released;
}

async function cancelOpenTradeWithRefund(
  supabaseAdmin: any,
  userId: string,
  tradeId: string,
  reason: string,
) {
  const { data: trade, error: tradeError } = await supabaseAdmin
    .from("trades")
    .select("id,stake,account_type")
    .eq("id", tradeId)
    .eq("user_id", userId)
    .eq("status", "open")
    .maybeSingle();
  if (tradeError) throw new Error(tradeError.message);
  if (!trade) return null;

  const { data: cancelled, error } = await supabaseAdmin
    .from("trades")
    .update({
      status: "cancelled",
      payout: Number(trade.stake ?? 0),
      closed_at: new Date().toISOString(),
      meta: { cancelled_by_system: true, reason },
    } as Record<string, unknown>)
    .eq("id", trade.id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("id,stake,account_type")
    .maybeSingle();
  if (error) throw new Error(error.message ?? String(error));
  if (!cancelled) return null;

  await refundCancelledStake(supabaseAdmin, userId, cancelled, reason);
  return cancelled;
}

async function refundCancelledStake(
  supabaseAdmin: any,
  userId: string,
  trade: { id: string; stake?: number | string | null; account_type?: string | null },
  reason: string,
) {
  const stake = Number(trade.stake ?? 0);
  const accountType = trade.account_type === "demo" ? "demo" : "real";
  const balanceField = accountType === "demo" ? "demo_balance_usd" : "balance_usd";

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select(balanceField)
    .eq("id", userId)
    .single();
  if (profileError) throw new Error(profileError.message);

  const { error: balanceError } = await supabaseAdmin
    .from("profiles")
    .update({ [balanceField]: Number(profile?.[balanceField] ?? 0) + stake } as Record<
      string,
      unknown
    >)
    .eq("id", userId);
  if (balanceError) throw new Error(balanceError.message);

  const { error: txError } = await supabaseAdmin.from("transactions").insert({
    user_id: userId,
    kind: "trade_payout",
    method: "system",
    account_type: accountType,
    amount: stake,
    currency: "USD",
    amount_usd: stake,
    status: "completed",
    is_virtual: accountType === "demo",
    meta: { trade_id: trade.id, reason },
  });
  if (txError) throw new Error(txError.message);
}

async function settleTradeWithAdminFallback(
  userId: string,
  tradeId: string,
  won: boolean,
  exitPrice: number | null,
  multiplier: number | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("admin_settle_open_trade", {
    _user_id: userId,
    _trade_id: tradeId,
    _won: won,
    _exit_price: exitPrice,
    _multiplier: multiplier,
  });
  if (!rpcError) return rpcResult as TradeCloseResult;
  if (isTradeStatusCompletedEnumError(rpcError.message ?? String(rpcError))) {
    console.warn(
      "[Trades] admin_settle_open_trade has stale trade_status enum, using direct fallback",
      {
        userId,
        tradeId,
        error: rpcError.message ?? String(rpcError),
      },
    );
  } else if (
    !/function public\.admin_settle_open_trade|Could not find the function|schema cache/i.test(
      rpcError.message ?? "",
    )
  ) {
    throw new Error(
      `Could not settle trade with admin fallback: ${rpcError.message ?? String(rpcError)}`,
    );
  }

  const { data: trade, error: tradeError } = await supabaseAdmin
    .from("trades")
    .select("id,user_id,stake,payout,account_type,status")
    .eq("id", tradeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (tradeError)
    throw new Error(`Could not load trade for fallback settlement: ${tradeError.message}`);
  if (!trade) throw new Error(`Could not settle trade ${tradeId}: trade not found`);
  if (trade.status !== "open") {
    return {
      ok: true,
      payout: Number(trade.payout ?? 0),
      status: trade.status,
      exit_price: exitPrice,
    };
  }

  const stake = Number(trade.stake ?? 0);
  const payout = won ? Number((stake * Number(multiplier ?? 1.95)).toFixed(2)) : 0;
  const closedAt = new Date().toISOString();
  const nextStatus = won ? "won" : "lost";

  const { error: updateError } = await supabaseAdmin
    .from("trades")
    .update({
      status: nextStatus,
      payout,
      exit_price: exitPrice,
      closed_at: closedAt,
    } as Record<string, unknown>)
    .eq("id", trade.id)
    .eq("user_id", userId)
    .eq("status", "open");
  if (updateError) throw new Error(`Could not settle trade with fallback: ${updateError.message}`);

  if (payout > 0) {
    const accountType = trade.account_type === "demo" ? "demo" : "real";
    const balanceField = accountType === "demo" ? "demo_balance_usd" : "balance_usd";
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(balanceField)
      .eq("id", userId)
      .single();
    if (profileError)
      throw new Error(`Could not load wallet for fallback payout: ${profileError.message}`);

    const { error: balanceError } = await supabaseAdmin
      .from("profiles")
      .update({ [balanceField]: Number(profile?.[balanceField] ?? 0) + payout } as Record<
        string,
        unknown
      >)
      .eq("id", userId);
    if (balanceError) throw new Error(`Could not credit fallback payout: ${balanceError.message}`);

    const { error: txError } = await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      kind: "trade_payout",
      method: "system",
      account_type: accountType,
      amount: payout,
      currency: "USD",
      amount_usd: payout,
      status: "completed",
      is_virtual: accountType === "demo",
      meta: { trade_id: trade.id, reason: "settle_trade_fallback" },
    });
    if (txError) throw new Error(`Could not write fallback payout transaction: ${txError.message}`);
  }

  return {
    ok: true,
    payout,
    status: nextStatus,
    exit_price: exitPrice,
  };
}

function normalizeTradeStatus(status: string) {
  if (status === "closed" || status === "settled") return "won";
  return status;
}

async function adjustSettledPayout(
  supabase: any,
  userId: string,
  tradeId: string,
  originalPayout: number,
  adjustedPayout: number,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const delta = adjustedPayout - originalPayout;
  const { data: trade } = await supabase
    .from("trades")
    .select("account_type")
    .eq("id", tradeId)
    .maybeSingle();
  const profileField = trade?.account_type === "real" ? "balance_usd" : "demo_balance_usd";

  await supabaseAdmin
    .from("profiles")
    .update({
      [profileField]:
        (await supabaseAdmin.from("profiles").select(profileField).eq("id", userId).single())
          .data?.[profileField] + delta,
    } as Record<string, unknown>)
    .eq("id", userId);

  await supabaseAdmin.from("trades").update({ payout: adjustedPayout }).eq("id", tradeId);
}

export const cancelTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trade_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as unknown as RpcClient).rpc(
      "cancel_open_trade",
      { _trade_id: data.trade_id },
    );
    if (error) {
      const message = error.message ?? String(error);
      if (isTradeStatusCompletedEnumError(message) || /Trade not found/i.test(message)) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cancelled = await cancelOpenTradeWithRefund(
          supabaseAdmin,
          context.userId,
          data.trade_id,
          "cancel_rpc_fallback",
        );
        if (cancelled) {
          return {
            ok: true,
            payout: Number(cancelled.stake ?? 0),
            status: "cancelled",
          } as TradeCloseResult;
        }
        return { ok: true, payout: 0, status: "missing" } as TradeCloseResult;
      }
      throw new Error(`Could not cancel trade: ${message}`);
    }
    return result as TradeCloseResult;
  });

export const cancelTradeDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trade_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cancelled = await cancelOpenTradeWithRefund(
      supabaseAdmin,
      context.userId,
      data.trade_id,
      "direct_cancel",
    );
    if (cancelled) {
      return {
        ok: true,
        payout: Number(cancelled.stake ?? 0),
        status: "cancelled",
      } as TradeCloseResult;
    }
    return { ok: true, payout: 0, status: "missing" } as TradeCloseResult;
  });

export const closeTradeAtPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trade_id: z.string().uuid(), exit_price: z.number().positive() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as unknown as RpcClient).rpc(
      "close_trade_at_price",
      {
        _trade_id: data.trade_id,
        _exit_price: data.exit_price,
      },
    );
    if (error) throw new Error(`Could not close trade: ${error.message ?? String(error)}`);
    return result as TradeCloseResult;
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (data) {
      if (Number(data.demo_balance_usd ?? 0) === 0) {
        const [{ count: tradeCount }, { count: txCount }] = await Promise.all([
          context.supabase
            .from("trades")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .eq("account_type", "demo"),
          context.supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .eq("account_type", "demo"),
        ]);

        if ((tradeCount ?? 0) === 0 && (txCount ?? 0) === 0) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: repaired } = await supabaseAdmin
            .from("profiles")
            .update({ demo_balance_usd: 10000, active_account: "real" })
            .eq("id", context.userId)
            .select("*")
            .single();
          return repaired ?? data;
        }
      }
      return data;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user.user?.email ?? null;
    const fullName =
      typeof user.user?.user_metadata?.full_name === "string"
        ? user.user.user_metadata.full_name
        : null;
    const username =
      (typeof user.user?.user_metadata?.username === "string" &&
        user.user.user_metadata.username) ||
      email?.split("@")[0] ||
      "client";

    const { data: created, error } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: context.userId,
        email,
        username,
        full_name: fullName,
        demo_balance_usd: 10000,
        active_account: "real",
      })
      .select("*")
      .single();
    if (error) throw error;

    await supabaseAdmin.from("user_settings").upsert({ user_id: context.userId });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "client" }, { onConflict: "user_id,role" });

    return created;
  });
