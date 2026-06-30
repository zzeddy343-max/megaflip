import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: TradeResult | unknown; error: { message?: string } | null }>;
};

type TradeResult = {
  id?: string;
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
    const { data: trade, error } = await (context.supabase as unknown as RpcClient).rpc(
      "place_trade",
      {
        _module: data.module,
        _market: data.market,
        _direction: data.direction,
        _stake: data.stake,
        _entry_price: data.entry_price ?? null,
        _meta: data.meta ?? {},
      },
    );
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
    const { data: result, error } = await (context.supabase as unknown as RpcClient).rpc(
      "settle_trade",
      {
        _trade_id: data.trade_id,
        _won: data.won,
        _exit_price: data.exit_price ?? null,
        _multiplier: data.multiplier ?? null,
      },
    );
    if (error) {
      console.error("[Trades] settle_trade failed", {
        userId: context.userId,
        tradeId: data.trade_id,
        won: data.won,
        error,
      });
      throw new Error(`Could not settle trade ${data.trade_id}: ${error.message ?? String(error)}`);
    }
    console.info("[Trades] settle_trade succeeded", {
      userId: context.userId,
      tradeId: data.trade_id,
      won: data.won,
    });
    return result;
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
