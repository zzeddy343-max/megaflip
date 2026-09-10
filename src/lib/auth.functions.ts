import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SignUpInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(9).max(16),
  referralCode: z.string().max(16).optional(),
});

const AdminSetupInput = z.object({
  setupPassword: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(9).max(16).optional(),
});

const AdminSetupPasswordInput = z.object({
  setupPassword: z.string().min(1),
});

export async function createAdminUser(data: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = data.email.trim().toLowerCase();
  const fullName = data.fullName.trim();
  const username = fullName.split(/\s+/)[0] || email.split("@")[0];
  const phone = data.phone ? normalizeKenyanPhone(data.phone) : null;

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      username,
      phone,
    },
  });

  if (error) {
    const existingAccount = /already registered|already been registered|already exists/i.test(
      error.message,
    );
    if (!existingAccount) throw error;

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) throw error;

    await supabaseAdmin.from("profiles").upsert({
      id: existing.id,
      email,
      username,
      full_name: fullName,
      phone,
      active_account: "real",
    });
    await supabaseAdmin.from("user_settings").upsert({ user_id: existing.id });
    await supabaseAdmin.from("user_roles").upsert(
      [
        { user_id: existing.id, role: "client" },
        { user_id: existing.id, role: "admin" },
      ],
      { onConflict: "user_id,role" },
    );

    return { ok: true, userId: existing.id, email, promotedExisting: true };
  }

  if (!created.user) throw new Error("Admin account could not be created");

  await supabaseAdmin.from("profiles").upsert({
    id: created.user.id,
    email,
    username,
    full_name: fullName,
    phone,
    demo_balance_usd: 10000,
    active_account: "real",
  });
  await supabaseAdmin.from("user_settings").upsert({ user_id: created.user.id });
  await supabaseAdmin.from("user_roles").upsert(
    [
      { user_id: created.user.id, role: "client" },
      { user_id: created.user.id, role: "admin" },
    ],
    { onConflict: "user_id,role" },
  );

  return { ok: true, userId: created.user.id, email, promotedExisting: false };
}

export const signUpWithoutEmailVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignUpInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.fullName.trim().split(/\s+/)[0] || data.email.split("@")[0];
    const phone = normalizeKenyanPhone(data.phone);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName.trim(),
        username,
        phone,
      },
    });
    if (error) throw error;
    if (!created.user) throw new Error("Account could not be created");

    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      email: data.email,
      username,
      full_name: data.fullName.trim(),
      phone,
      demo_balance_usd: 10000,
      active_account: "real",
    });
    await supabaseAdmin.from("user_settings").upsert({ user_id: created.user.id });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: created.user.id, role: "client" }, { onConflict: "user_id,role" });

    const referralCode = data.referralCode?.trim().toUpperCase();
    if (referralCode) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();

      await supabaseAdmin.from("referrals").upsert({
        client_id: created.user.id,
        agent_id: agent?.id ?? null,
        referral_code: referralCode,
      });
    }

    return { ok: true };
  });

export const createAdminWithSetupPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AdminSetupInput.parse(d))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_SETUP_PASSWORD ?? "@12Incorrect";
    if (data.setupPassword !== expected) throw new Error("Incorrect admin setup password");
    return createAdminUser({
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      phone: data.phone,
    });
  });

export const verifyAdminSetupPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AdminSetupPasswordInput.parse(d))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_SETUP_PASSWORD ?? "@12Incorrect";
    if (data.setupPassword !== expected) throw new Error("Incorrect admin setup password");
    return { ok: true };
  });

function normalizeKenyanPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error("Enter a valid Kenyan Safaricom number");
}
