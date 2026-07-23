import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  applyVolatilityToPayout,
  getEffectiveStakeLimits,
  getEnabledEngagementTriggers,
  readSystemSettings,
  type SystemSettings,
} from "@/lib/system-settings";

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
    const { data: result, error } = await supabase.rpc("settle_trade", {
      _trade_id: data.trade_id,
      _won: data.won,
      _exit_price: data.exit_price ?? null,
      _multiplier: data.multiplier ?? null,
    });
    if (error) {
      console.error("[Trades] settle_trade failed", {
        userId: context.userId,
        tradeId: data.trade_id,
        won: data.won,
        error,
      });
      const message = error.message ?? String(error);
      if (/invalid input value for enum trade_status: "completed"/i.test(message)) {
        const fallback = await settleTradeWithAdminFallback(
          context.userId,
          data.trade_id,
          data.won,
          data.exit_price ?? null,
          data.multiplier ?? null,
        );
        return fallback;
      }
      throw new Error(`Could not settle trade ${data.trade_id}: ${error.message ?? String(error)}`);
    }
    const payout = Number((result as { payout?: number | null } | null)?.payout ?? 0);
    if (data.won && payout > 0) {
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
      won: data.won,
      payout,
    });
    return { ...(result as Record<string, unknown>), payout: data.won ? payout : payout };
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
      .select("id,market,direction,stake,payout,status,meta,created_at,closed_at,entry_price,exit_price")
      .eq("user_id", context.userId)
      .eq("module", "binary")
      .order("created_at", { ascending: false })
      .limit(80);

    return (data ?? []).map((trade: any) => {
      const stakeCents = Math.round(Number(trade.stake ?? 0) * 100);
      const payoutCents = Math.round(Number(trade.payout ?? 0) * 100);
      const multiplier =
        stakeCents > 0 && payoutCents > 0 ? payoutCents / stakeCents : Number(trade.meta?.multiplier ?? 1.95);
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
    await cancelStaleBinaryTrades(supabase, userId);
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

  const userStats = await getUserSegmentStats(supabase, userId, accountType);
  const { minStake, maxStake } = getEffectiveStakeLimits(settings, userStats);

  if (input.stake < minStake) {
    throw new Error(`Minimum stake is $${minStake.toFixed(2)}`);
  }

  if (input.stake > maxStake) {
    throw new Error(`Maximum stake is $${maxStake.toFixed(2)}`);
  }

  const [marketExposure, userExposure, dailyLosses, weeklyLosses, monthlyLosses, recentTrades] =
    await Promise.all([
      supabase
        .from("trades")
        .select("stake")
        .eq("status", "open")
        .eq("account_type", accountType)
        .eq("market", input.market),
      supabase
        .from("trades")
        .select("stake")
        .eq("status", "open")
        .eq("account_type", accountType)
        .eq("user_id", userId),
      fetchPeriodLosses(supabase, "daily", userId),
      fetchPeriodLosses(supabase, "weekly", userId),
      fetchPeriodLosses(supabase, "monthly", userId),
      supabase
        .from("trades")
        .select("id,market,direction,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const marketExposureUsd = sumStake(marketExposure?.data ?? []);
  const userExposureUsd = sumStake(userExposure?.data ?? []);
  const systemDailyLosses = await fetchSystemLosses(supabase, "daily");
  const systemWeeklyLosses = await fetchSystemLosses(supabase, "weekly");
  const systemMonthlyLosses = await fetchSystemLosses(supabase, "monthly");

  if (
    settings.liability_limits_market_usd > 0 &&
    marketExposureUsd + input.stake > settings.liability_limits_market_usd
  ) {
    throw new Error(`Market exposure limit reached for ${input.market}`);
  }

  if (
    settings.liability_limits_user_usd > 0 &&
    userExposureUsd + input.stake > settings.liability_limits_user_usd
  ) {
    throw new Error("User exposure limit reached");
  }

  if (
    settings.caps_daily_loss_usd > 0 &&
    (dailyLosses + input.stake > settings.caps_daily_loss_usd ||
      systemDailyLosses + input.stake > settings.caps_daily_loss_usd)
  ) {
    throw new Error("Daily loss cap reached");
  }

  if (
    settings.caps_weekly_loss_usd > 0 &&
    (weeklyLosses + input.stake > settings.caps_weekly_loss_usd ||
      systemWeeklyLosses + input.stake > settings.caps_weekly_loss_usd)
  ) {
    throw new Error("Weekly loss cap reached");
  }

  if (
    settings.caps_monthly_loss_usd > 0 &&
    (monthlyLosses + input.stake > settings.caps_monthly_loss_usd ||
      systemMonthlyLosses + input.stake > settings.caps_monthly_loss_usd)
  ) {
    throw new Error("Monthly loss cap reached");
  }

  if (settings.fraud_detection_enabled) {
    const fraudSignals = detectFraudSignals(
      recentTrades?.data ?? [],
      settings.fraud_detection_rules,
    );
    if (fraudSignals.length) {
      throw new Error(`Fraud checks blocked this trade: ${fraudSignals.join(", ")}`);
    }
  }

  const triggers = getEnabledEngagementTriggers(settings);
  if (triggers.includes("TRADE")) {
    console.info("[Engagement] trade", {
      userId,
      market: input.market,
      stake: input.stake,
      direction: input.direction,
      accountType,
    });
  }
}

async function cancelStaleBinaryTrades(supabase: any, userId: string, accountType?: string) {
  const staleBefore = new Date(Date.now() - 60_000).toISOString();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabase
    .from("trades")
    .select("id,stake,account_type")
    .eq("user_id", userId)
    .eq("module", "binary")
    .eq("status", "open")
    .lt("created_at", staleBefore)
    .limit(1000);

  if (accountType) query = query.eq("account_type", accountType);

  const { data: staleTrades } = await query;

  let released = 0;
  for (const trade of staleTrades ?? []) {
    try {
      const cancelled = await cancelOpenTradeWithRefund(
        supabaseAdmin,
        userId,
        trade.id,
        "stale_binary_timeout",
      );
      if (!cancelled) continue;
      released += 1;
    } catch (error) {
      console.warn("[Trades] stale binary cancellation skipped", {
        userId,
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  released += await cancelDuplicateOpenBinaryTrades(supabaseAdmin, userId, accountType);
  return released;
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
  const { data: trade, error: tradeError } = await supabaseAdmin
    .from("trades")
    .select("id,user_id,stake,payout,account_type,status")
    .eq("id", tradeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (tradeError) throw new Error(`Could not load trade for fallback settlement: ${tradeError.message}`);
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
    if (profileError) throw new Error(`Could not load wallet for fallback payout: ${profileError.message}`);

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

async function getUserSegmentStats(supabase: any, userId: string, accountType: string) {
  const [depositsResult, tradesResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount_usd")
      .eq("user_id", userId)
      .eq("kind", "deposit")
      .eq("status", "completed"),
    supabase.from("trades").select("stake").eq("user_id", userId).eq("account_type", accountType),
  ]);

  const totalDepositsUsd = (depositsResult?.data ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.amount_usd ?? 0),
    0,
  );
  const totalVolumeUsd = (tradesResult?.data ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.stake ?? 0),
    0,
  );

  return {
    totalDepositsUsd,
    totalVolumeUsd,
    totalTrades: tradesResult?.data?.length ?? 0,
  };
}

async function fetchPeriodLosses(
  supabase: any,
  period: "daily" | "weekly" | "monthly",
  userId: string,
) {
  const startedAt = getPeriodStart(period);
  const { data } = await supabase
    .from("trades")
    .select("stake")
    .eq("user_id", userId)
    .eq("status", "lost")
    .gte("closed_at", startedAt.toISOString());
  return sumStake(data ?? []);
}

async function fetchSystemLosses(supabase: any, period: "daily" | "weekly" | "monthly") {
  const startedAt = getPeriodStart(period);
  const { data } = await supabase
    .from("trades")
    .select("stake")
    .eq("status", "lost")
    .gte("closed_at", startedAt.toISOString());
  return sumStake(data ?? []);
}

export function detectFraudSignals(
  recentTrades: Array<{ market?: string; direction?: string; created_at?: string }>,
  rulesText?: string,
) {
  const rules = String(rulesText ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const signals: string[] = [];

  if (!rules.includes("bot") && !rules.includes("arbitrage")) {
    return signals;
  }

  const rapidTrades = recentTrades.filter((trade) => {
    const createdAt = trade.created_at ? new Date(trade.created_at).getTime() : 0;
    const isRecent = Date.now() - createdAt < 60_000;
    return isRecent;
  });

  if (rapidTrades.length >= 5) {
    signals.push("rapid trade burst");
  }

  const repeatedMarkets = new Set(rapidTrades.map((trade) => trade.market).filter(Boolean));
  const directions = rapidTrades
    .map((trade) => trade.direction?.toLowerCase())
    .filter((direction): direction is string => Boolean(direction));
  const hasAlternatingDirections =
    directions.length >= 4 &&
    directions.some((direction, index) => index > 0 && direction !== directions[index - 1]);
  const hasMultipleMarkets = repeatedMarkets.size >= 3;

  if (rapidTrades.length >= 5 && hasAlternatingDirections && hasMultipleMarkets) {
    signals.push("arbitrage-like market switching");
  }

  return signals;
}

function getPeriodStart(period: "daily" | "weekly" | "monthly") {
  const start = new Date();
  if (period === "daily") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "weekly") {
    const day = start.getDay();
    const delta = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + delta);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}

function sumStake(rows: Array<{ stake?: number | string | null }>) {
  return rows.reduce((sum, row) => sum + Number(row.stake ?? 0), 0);
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
      if (/invalid input value for enum trade_status: "completed"|Trade not found/i.test(message)) {
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
