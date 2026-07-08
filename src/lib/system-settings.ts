import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type SystemSettings = {
  min_deposit_usd: number;
  min_withdrawal_usd: number;
  withdrawal_tax_pct: number;
  rtp_percent: number;
  updated_at?: string | null;
};

const SYSTEM_SETTINGS_ID = "default";

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  min_deposit_usd: 3,
  min_withdrawal_usd: 3,
  withdrawal_tax_pct: 5,
  rtp_percent: 95,
  updated_at: null,
};

const SystemSettingsInput = z.object({
  min_deposit_usd: z.number().min(0).max(1000000).optional(),
  min_withdrawal_usd: z.number().min(0).max(1000000).optional(),
  withdrawal_tax_pct: z.number().min(0).max(100).optional(),
  rtp_percent: z.number().min(0).max(100).optional(),
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
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("id, min_deposit_usd, min_withdrawal_usd, withdrawal_tax_pct, rtp_percent, updated_at")
    .eq("id", SYSTEM_SETTINGS_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    return writeSystemSettings(DEFAULT_SYSTEM_SETTINGS, true);
  }

  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    min_deposit_usd: Number(data.min_deposit_usd ?? DEFAULT_SYSTEM_SETTINGS.min_deposit_usd),
    min_withdrawal_usd: Number(data.min_withdrawal_usd ?? DEFAULT_SYSTEM_SETTINGS.min_withdrawal_usd),
    withdrawal_tax_pct: Number(data.withdrawal_tax_pct ?? DEFAULT_SYSTEM_SETTINGS.withdrawal_tax_pct),
    rtp_percent: Number(data.rtp_percent ?? DEFAULT_SYSTEM_SETTINGS.rtp_percent),
    updated_at: data.updated_at ?? null,
  };
}

export async function writeSystemSettings(
  changes: Partial<SystemSettings>,
  initialize = false,
): Promise<SystemSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = await readSystemSettings();
  const nextSettings: SystemSettings = {
    ...current,
    ...changes,
    min_deposit_usd: normalizeNumber(changes.min_deposit_usd ?? current.min_deposit_usd, 3),
    min_withdrawal_usd: normalizeNumber(changes.min_withdrawal_usd ?? current.min_withdrawal_usd, 3),
    withdrawal_tax_pct: normalizeNumber(changes.withdrawal_tax_pct ?? current.withdrawal_tax_pct, 5),
    rtp_percent: normalizeNumber(changes.rtp_percent ?? current.rtp_percent, 95),
  };

  if (initialize) {
    const { error } = await supabaseAdmin.from("system_settings").insert({
      id: SYSTEM_SETTINGS_ID,
      min_deposit_usd: nextSettings.min_deposit_usd,
      min_withdrawal_usd: nextSettings.min_withdrawal_usd,
      withdrawal_tax_pct: nextSettings.withdrawal_tax_pct,
      rtp_percent: nextSettings.rtp_percent,
    } as Record<string, unknown>);
    if (error) throw new Error(error.message);
    return nextSettings;
  }

  const { error } = await supabaseAdmin.from("system_settings").upsert({
    id: SYSTEM_SETTINGS_ID,
    min_deposit_usd: nextSettings.min_deposit_usd,
    min_withdrawal_usd: nextSettings.min_withdrawal_usd,
    withdrawal_tax_pct: nextSettings.withdrawal_tax_pct,
    rtp_percent: nextSettings.rtp_percent,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>);
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

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
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
