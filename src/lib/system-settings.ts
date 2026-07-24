import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type SystemSettings = {
  min_deposit_usd: number;
  min_withdrawal_usd: number;
  withdrawal_tax_pct: number;
  rtp_percent: number;
  limits_min_stake_usd: number;
  limits_max_stake_usd: number;
  volatility_model_variant: string;
  user_segmentation_tags: string;
  liability_limits_market_usd: number;
  liability_limits_user_usd: number;
  fraud_detection_enabled: boolean;
  fraud_detection_rules: string;
  engagement_notification_triggers: string;
  caps_daily_loss_usd: number;
  caps_weekly_loss_usd: number;
  caps_monthly_loss_usd: number;
  updated_at?: string | null;
};

const SYSTEM_SETTINGS_ID = "default";

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  min_deposit_usd: 3,
  min_withdrawal_usd: 3,
  withdrawal_tax_pct: 5,
  rtp_percent: 95,
  limits_min_stake_usd: 1,
  limits_max_stake_usd: 1000,
  volatility_model_variant: "standard",
  user_segmentation_tags: "VIP,HIGH ROLLER",
  liability_limits_market_usd: 5000,
  liability_limits_user_usd: 2000,
  fraud_detection_enabled: false,
  fraud_detection_rules: "",
  engagement_notification_triggers: "trade,withdrawal",
  caps_daily_loss_usd: 10000,
  caps_weekly_loss_usd: 50000,
  caps_monthly_loss_usd: 100000,
  updated_at: null,
};

const SystemSettingsInput = z.object({
  min_deposit_usd: z.number().min(0).max(1000000).optional(),
  min_withdrawal_usd: z.number().min(0).max(1000000).optional(),
  withdrawal_tax_pct: z.number().min(0).max(100).optional(),
  rtp_percent: z.number().min(0).max(100).optional(),
  limits_min_stake_usd: z.number().min(0).max(10000000).optional(),
  limits_max_stake_usd: z.number().min(0).max(10000000).optional(),
  volatility_model_variant: z.string().optional(),
  user_segmentation_tags: z.string().optional(),
  liability_limits_market_usd: z.number().min(0).max(10000000).optional(),
  liability_limits_user_usd: z.number().min(0).max(10000000).optional(),
  fraud_detection_enabled: z.boolean().optional(),
  fraud_detection_rules: z.string().optional(),
  engagement_notification_triggers: z.string().optional(),
  caps_daily_loss_usd: z.number().min(0).max(10000000).optional(),
  caps_weekly_loss_usd: z.number().min(0).max(10000000).optional(),
  caps_monthly_loss_usd: z.number().min(0).max(10000000).optional(),
});

export const getPublicSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => readSystemSettings());

export const getSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    return readSystemSettings();
  });

export const updateSystemSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SystemSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const nextSettings = await writeSystemSettings(data);
    return nextSettings;
  });

export async function readSystemSettings(): Promise<SystemSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const allColumnsQuery = supabaseAdmin
    .from("system_settings")
    .select(
      "id, min_deposit_usd, min_withdrawal_usd, withdrawal_tax_pct, rtp_percent, limits_min_stake_usd, limits_max_stake_usd, volatility_model_variant, user_segmentation_tags, liability_limits_market_usd, liability_limits_user_usd, fraud_detection_enabled, fraud_detection_rules, engagement_notification_triggers, caps_daily_loss_usd, caps_weekly_loss_usd, caps_monthly_loss_usd, updated_at",
    )
    .eq("id", SYSTEM_SETTINGS_ID)
    .maybeSingle();

  const fallbackQuery = supabaseAdmin
    .from("system_settings")
    .select("id, min_deposit_usd, min_withdrawal_usd, withdrawal_tax_pct, rtp_percent, updated_at")
    .eq("id", SYSTEM_SETTINGS_ID)
    .maybeSingle();

  const { data, error } = await allColumnsQuery;
  if (error && isMissingColumnError(error)) {
    const fallback = await fallbackQuery;
    if (fallback.error) throw new Error(fallback.error.message);
    if (!fallback.data) {
      return writeSystemSettings(DEFAULT_SYSTEM_SETTINGS, true);
    }
    return mapSystemSettingsRow(fallback.data);
  }
  if (error) throw new Error(error.message);

  if (!data) {
    return writeSystemSettings(DEFAULT_SYSTEM_SETTINGS, true);
  }

  return mapSystemSettingsRow(data);
}

function mapSystemSettingsRow(data: Record<string, unknown>): SystemSettings {
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    min_deposit_usd: Number(data.min_deposit_usd ?? DEFAULT_SYSTEM_SETTINGS.min_deposit_usd),
    min_withdrawal_usd: Number(
      data.min_withdrawal_usd ?? DEFAULT_SYSTEM_SETTINGS.min_withdrawal_usd,
    ),
    withdrawal_tax_pct: Number(
      data.withdrawal_tax_pct ?? DEFAULT_SYSTEM_SETTINGS.withdrawal_tax_pct,
    ),
    rtp_percent: Number(data.rtp_percent ?? DEFAULT_SYSTEM_SETTINGS.rtp_percent),
    limits_min_stake_usd: Number(
      data.limits_min_stake_usd ?? DEFAULT_SYSTEM_SETTINGS.limits_min_stake_usd,
    ),
    limits_max_stake_usd: Number(
      data.limits_max_stake_usd ?? DEFAULT_SYSTEM_SETTINGS.limits_max_stake_usd,
    ),
    volatility_model_variant: String(
      data.volatility_model_variant ?? DEFAULT_SYSTEM_SETTINGS.volatility_model_variant,
    ),
    user_segmentation_tags: String(
      data.user_segmentation_tags ?? DEFAULT_SYSTEM_SETTINGS.user_segmentation_tags,
    ),
    liability_limits_market_usd: Number(
      data.liability_limits_market_usd ?? DEFAULT_SYSTEM_SETTINGS.liability_limits_market_usd,
    ),
    liability_limits_user_usd: Number(
      data.liability_limits_user_usd ?? DEFAULT_SYSTEM_SETTINGS.liability_limits_user_usd,
    ),
    fraud_detection_enabled: Boolean(
      data.fraud_detection_enabled ?? DEFAULT_SYSTEM_SETTINGS.fraud_detection_enabled,
    ),
    fraud_detection_rules: String(
      data.fraud_detection_rules ?? DEFAULT_SYSTEM_SETTINGS.fraud_detection_rules,
    ),
    engagement_notification_triggers: String(
      data.engagement_notification_triggers ??
        DEFAULT_SYSTEM_SETTINGS.engagement_notification_triggers,
    ),
    caps_daily_loss_usd: Number(
      data.caps_daily_loss_usd ?? DEFAULT_SYSTEM_SETTINGS.caps_daily_loss_usd,
    ),
    caps_weekly_loss_usd: Number(
      data.caps_weekly_loss_usd ?? DEFAULT_SYSTEM_SETTINGS.caps_weekly_loss_usd,
    ),
    caps_monthly_loss_usd: Number(
      data.caps_monthly_loss_usd ?? DEFAULT_SYSTEM_SETTINGS.caps_monthly_loss_usd,
    ),
    updated_at: (data.updated_at as string | null | undefined) ?? null,
  };
}

export async function writeSystemSettings(
  changes: Partial<SystemSettings>,
  initialize = false,
): Promise<SystemSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = initialize ? DEFAULT_SYSTEM_SETTINGS : await readSystemSettings();
  const nextSettings: SystemSettings = {
    ...current,
    ...changes,
    min_deposit_usd: normalizeNumber(changes.min_deposit_usd ?? current.min_deposit_usd, 3),
    min_withdrawal_usd: normalizeNumber(
      changes.min_withdrawal_usd ?? current.min_withdrawal_usd,
      3,
    ),
    withdrawal_tax_pct: normalizeNumber(
      changes.withdrawal_tax_pct ?? current.withdrawal_tax_pct,
      5,
    ),
    rtp_percent: normalizeNumber(changes.rtp_percent ?? current.rtp_percent, 95),
    limits_min_stake_usd: normalizeNumber(
      changes.limits_min_stake_usd ?? current.limits_min_stake_usd,
      1,
    ),
    limits_max_stake_usd: normalizeNumber(
      changes.limits_max_stake_usd ?? current.limits_max_stake_usd,
      1000,
    ),
    volatility_model_variant: normalizeText(
      changes.volatility_model_variant ?? current.volatility_model_variant,
      "standard",
    ),
    user_segmentation_tags: normalizeText(
      changes.user_segmentation_tags ?? current.user_segmentation_tags,
      "VIP,HIGH ROLLER",
    ),
    liability_limits_market_usd: normalizeNumber(
      changes.liability_limits_market_usd ?? current.liability_limits_market_usd,
      5000,
    ),
    liability_limits_user_usd: normalizeNumber(
      changes.liability_limits_user_usd ?? current.liability_limits_user_usd,
      2000,
    ),
    fraud_detection_enabled: changes.fraud_detection_enabled ?? current.fraud_detection_enabled,
    fraud_detection_rules: normalizeText(
      changes.fraud_detection_rules ?? current.fraud_detection_rules,
      "",
    ),
    engagement_notification_triggers: normalizeText(
      changes.engagement_notification_triggers ?? current.engagement_notification_triggers,
      "trade,withdrawal",
    ),
    caps_daily_loss_usd: normalizeNumber(
      changes.caps_daily_loss_usd ?? current.caps_daily_loss_usd,
      10000,
    ),
    caps_weekly_loss_usd: normalizeNumber(
      changes.caps_weekly_loss_usd ?? current.caps_weekly_loss_usd,
      50000,
    ),
    caps_monthly_loss_usd: normalizeNumber(
      changes.caps_monthly_loss_usd ?? current.caps_monthly_loss_usd,
      100000,
    ),
  };

  const basePayload = {
    id: SYSTEM_SETTINGS_ID,
    min_deposit_usd: nextSettings.min_deposit_usd,
    min_withdrawal_usd: nextSettings.min_withdrawal_usd,
    withdrawal_tax_pct: nextSettings.withdrawal_tax_pct,
    rtp_percent: nextSettings.rtp_percent,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>;

  const fullPayload = {
    ...basePayload,
    limits_min_stake_usd: nextSettings.limits_min_stake_usd,
    limits_max_stake_usd: nextSettings.limits_max_stake_usd,
    volatility_model_variant: nextSettings.volatility_model_variant,
    user_segmentation_tags: nextSettings.user_segmentation_tags,
    liability_limits_market_usd: nextSettings.liability_limits_market_usd,
    liability_limits_user_usd: nextSettings.liability_limits_user_usd,
    fraud_detection_enabled: nextSettings.fraud_detection_enabled,
    fraud_detection_rules: nextSettings.fraud_detection_rules,
    engagement_notification_triggers: nextSettings.engagement_notification_triggers,
    caps_daily_loss_usd: nextSettings.caps_daily_loss_usd,
    caps_weekly_loss_usd: nextSettings.caps_weekly_loss_usd,
    caps_monthly_loss_usd: nextSettings.caps_monthly_loss_usd,
  } as Record<string, unknown>;

  const { error } = initialize
    ? await supabaseAdmin.from("system_settings").insert(fullPayload)
    : await supabaseAdmin.from("system_settings").upsert(fullPayload);
  if (error && isMissingColumnError(error)) {
    const fallback = initialize
      ? await supabaseAdmin.from("system_settings").insert(basePayload)
      : await supabaseAdmin.from("system_settings").upsert(basePayload);
    if (fallback.error) throw new Error(fallback.error.message);
    return nextSettings;
  }
  if (error) throw new Error(error.message);

  return nextSettings;
}

export function calculateHouseEdgePercent(rtpPercent?: number) {
  const rtp = Number(rtpPercent ?? DEFAULT_SYSTEM_SETTINGS.rtp_percent);
  return Math.max(0, Math.min(100, 100 - rtp));
}

export function calculateNetWithdrawalAmount(amount: number, taxPct: number) {
  const rate = Math.max(0, Math.min(100, Number(taxPct ?? 0)));
  return Math.round(amount * (1 - rate / 100) * 100) / 100;
}

export function parseSettingsList(value?: string | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

export function getEffectiveStakeLimits(
  settings: SystemSettings,
  userStats?: { totalDepositsUsd?: number; totalVolumeUsd?: number; totalTrades?: number },
) {
  const minStake = Math.max(0, Number(settings.limits_min_stake_usd ?? 0));
  const baseMaxStake = Math.max(minStake, Number(settings.limits_max_stake_usd ?? minStake));
  const tags = parseSettingsList(settings.user_segmentation_tags);
  const segmentMultiplier = getSegmentationMultiplier(tags, userStats);

  return {
    minStake,
    maxStake: roundMoney(baseMaxStake * segmentMultiplier),
    segmentMultiplier,
  };
}

export function getVolatilityMultiplier(settings: SystemSettings) {
  switch (String(settings.volatility_model_variant ?? "standard").toLowerCase()) {
    case "aggressive":
      return 1.25;
    case "conservative":
      return 0.9;
    default:
      return 1;
  }
}

export function applyVolatilityToPayout(payout: number, settings: SystemSettings) {
  return roundMoney(Number(payout ?? 0) * getVolatilityMultiplier(settings));
}

export function getEnabledEngagementTriggers(settings: SystemSettings) {
  return parseSettingsList(settings.engagement_notification_triggers);
}

function getSegmentationMultiplier(
  tags: string[],
  userStats?: { totalDepositsUsd?: number; totalVolumeUsd?: number; totalTrades?: number },
) {
  const depositsUsd = Number(userStats?.totalDepositsUsd ?? 0);
  const volumeUsd = Number(userStats?.totalVolumeUsd ?? 0);
  const tradeCount = Number(userStats?.totalTrades ?? 0);

  if (
    tags.includes("HIGH ROLLER") &&
    (depositsUsd >= 5000 || volumeUsd >= 15000 || tradeCount >= 100)
  ) {
    return 1.5;
  }

  if (tags.includes("VIP") && (depositsUsd >= 2000 || volumeUsd >= 8000 || tradeCount >= 50)) {
    return 1.25;
  }

  return 1;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!data?.some((row) => row.role === "admin")) {
    throw new Error("Admin access required");
  }
}

function normalizeNumber(value: number | null | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeText(value: string | null | undefined, fallback: string) {
  const parsed = String(value ?? fallback).trim();
  return parsed || fallback;
}

function isMissingColumnError(error: { message?: string | null }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("unknown column") ||
    message.includes("could not find the column")
  );
}
