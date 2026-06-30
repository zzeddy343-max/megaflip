import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAdminUser } from "@/lib/auth.functions";
import { z } from "zod";

// Inline admin gate (has_role EXECUTE is locked down to service_role only)
async function assertAdmin(supabase: any, userId: string) {
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

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email(),
      commission_pct: z.number().min(0).max(50).default(10),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find user by email via auth admin
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);
    const user = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user) throw new Error(`No user found with email ${data.email}. Ask them to sign up first.`);

    // Grant agent role (idempotent)
    await supabaseAdmin.from("user_roles").upsert({ user_id: user.id, role: "agent" }, { onConflict: "user_id,role" });

    // Generate unique referral code
    let code = randomCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabaseAdmin.from("agents").select("id").eq("referral_code", code).maybeSingle();
      if (!existing) break;
      code = randomCode();
    }

    const { data: agent, error } = await supabaseAdmin.from("agents").upsert({
      user_id: user.id,
      referral_code: code,
      commission_pct: data.commission_pct,
    }, { onConflict: "user_id" }).select().single();
    if (error) throw new Error(error.message);

    return { ok: true, agent };
  });

export const creditAgentVirtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agent_user_id: z.string().uuid(),
      amount_usd: z.number().positive().max(1_000_000),
    }).parse(d)
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
    z.object({
      search: z.string().max(120).optional(),
      agent_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d)
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

    let q = supabaseAdmin.from("profiles").select("*").limit(data.limit).order("created_at", { ascending: false });
    if (referralFilter) q = q.in("id", referralFilter);
    if (data.search) q = q.or(`username.ilike.%${data.search}%,full_name.ilike.%${data.search}%`);

    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    return profiles ?? [];
  });

export const failStaleMpesaWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      older_than_minutes: z.number().int().min(1).max(60).default(2),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await (supabaseAdmin as any).rpc("fail_stale_mpesa_withdrawals", {
      _older_than: `${data.older_than_minutes} minutes`,
    });
    if (error) throw new Error(error.message);
    return { ok: true, repaired: rows ?? [] };
  });

export const reconcileSuccessfulB2cCallbacks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callbackRows, error } = await (supabaseAdmin as any).rpc("reconcile_successful_b2c_callbacks");
    if (error) throw new Error(error.message);

    const { data: acceptedRows, error: acceptedError } = await (supabaseAdmin as any).rpc(
      "complete_accepted_b2c_withdrawals",
    );
    if (acceptedError) throw new Error(acceptedError.message);

    return { ok: true, repaired: [...(callbackRows ?? []), ...(acceptedRows ?? [])] };
  });

export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(2).max(120),
    }).parse(d)
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

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,username,created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return profiles ?? [];
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ new_password: z.string().min(8).max(72) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.auth.updateUser({ password: data.new_password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      full_name: z.string().trim().min(2).max(120).optional(),
      username: z.string().trim().min(2).max(40).optional(),
      phone: z.string().trim().min(9).max(16).optional(),
    }).parse(d)
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
