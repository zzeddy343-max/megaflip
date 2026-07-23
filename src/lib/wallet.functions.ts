import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  calculateNetWithdrawalAmount,
  readSystemSettings,
  type SystemSettings,
} from "@/lib/system-settings";

const USD_TO_KSH = 130;

const MoneyInput = z.object({
  method: z.enum(["mpesa"]),
  amount: z.number().positive().max(10_000_000),
  account: z.enum(["real", "demo"]),
  phone: z.string().optional(),
});

type TransactionKind = "deposit" | "withdraw";
type PaymentRequestType = "stk_push" | "b2c";

type WalletTransaction = {
  id: string;
  user_id: string;
  kind: TransactionKind;
  method: "mpesa";
  amount: number | string;
  currency: "KSH" | "USD";
  amount_usd: number | string;
  account_type: "real" | "demo";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  meta?: Record<string, unknown> | null;
};

type DarajaMode = "stk" | "b2c";
type DarajaStep = "oauth_token" | "stk_push" | "b2c_payment";

export const createDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoneyInput.parse(d))
  .handler(async ({ data, context }) => {
    const settings = await readSystemSettings();
    const phone = data.method === "mpesa" ? await getProfilePhone(context.userId) : data.phone;
    validateMoney("deposit", data.method, data.amount, phone, settings);

    const tx = await createWalletTransaction(
      {
        userId: context.userId,
        kind: "deposit",
        method: data.method,
        amount: data.amount,
        account: data.account,
        phone,
      },
      settings,
    );

    if (data.method === "mpesa" && data.account === "real") {
      try {
        const daraja = await sendStkPush(tx, phone);
        return { ok: true, transaction: tx, daraja };
      } catch (error) {
        await markTransaction(tx.id, "failed", { provider_error: getErrorMessage(error) });
        throw error;
      }
    }

    return { ok: true, transaction: tx };
  });

export const createWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoneyInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.account === "demo") {
      throw new Error("Demo funds cannot be withdrawn. Switch to your real account to withdraw.");
    }

    const settings = await readSystemSettings();
    const netAmount = calculateNetWithdrawalAmount(data.amount, settings.withdrawal_tax_pct);
    const phone = data.method === "mpesa" ? await getProfilePhone(context.userId) : data.phone;
    validateMoney("withdraw", data.method, data.amount, phone, settings);

    const tx = await createWalletTransaction(
      {
        userId: context.userId,
        kind: "withdraw",
        method: data.method,
        amount: data.amount,
        account: data.account,
        phone,
      },
      settings,
    );

    if (data.method === "mpesa" && data.account === "real") {
      try {
        const daraja = await sendB2cPayment(tx, phone, netAmount);
        return { ok: true, transaction: tx, daraja };
      } catch (error) {
        await markTransaction(tx.id, "failed", { provider_error: getErrorMessage(error) });
        throw error;
      }
    }

    return { ok: true, transaction: tx };
  });

export const syncPendingMpesaDeposits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: requests, error } = await supabaseAdmin
      .from("payment_requests")
      .select("id, transaction_id, checkout_request_id, transactions!inner(id,user_id,kind,status)")
      .eq("request_type", "stk_push")
      .in("status", ["pending", "processing"])
      .eq("transactions.user_id", context.userId)
      .eq("transactions.kind", "deposit")
      .in("transactions.status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);

    const synced: Array<{ transaction_id: string; status: string }> = [];
    for (const request of requests ?? []) {
      const checkoutRequestId = getStringValue(request.checkout_request_id);
      if (!checkoutRequestId) continue;

      const result = await queryStkStatus(checkoutRequestId);
      const resultCode = Number(result.ResultCode ?? result.ResponseCode ?? -1);
      const resultDescription =
        getStringValue(result.ResultDesc) ??
        getStringValue(result.ResponseDescription) ??
        "STK query response";

      if (resultCode === 0) {
        await markTransaction(request.transaction_id, "completed", {
          daraja_result_code: resultCode,
          daraja_result_description: resultDescription,
          synced_by: "stk_query",
          callback_at: new Date().toISOString(),
        });
        await supabaseAdmin
          .from("payment_requests")
          .update({ status: "completed", response_payload: result } as Record<string, unknown>)
          .eq("id", request.id);
        synced.push({ transaction_id: request.transaction_id, status: "completed" });
      } else if ([1, 1032, 1037, 2001].includes(resultCode)) {
        await markTransaction(request.transaction_id, "failed", {
          daraja_result_code: resultCode,
          daraja_result_description: resultDescription,
          synced_by: "stk_query",
          callback_at: new Date().toISOString(),
        });
        await supabaseAdmin
          .from("payment_requests")
          .update({ status: "failed", response_payload: result } as Record<string, unknown>)
          .eq("id", request.id);
        synced.push({ transaction_id: request.transaction_id, status: "failed" });
      }
    }

    return { ok: true, synced };
  });

async function createWalletTransaction(
  input: {
    userId: string;
    kind: TransactionKind;
    method: "mpesa";
    amount: number;
    account: "real" | "demo";
    phone?: string;
  },
  settings: SystemSettings,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (input.kind === "withdraw" && input.account === "demo") {
    throw new Error("Demo funds cannot be withdrawn. Switch to your real account to withdraw.");
  }

  const currency = input.method === "mpesa" ? "KSH" : "USD";
  const amountUsd = toUsd(input.amount, currency);
  const netAmount =
    input.kind === "withdraw"
      ? calculateNetWithdrawalAmount(input.amount, settings.withdrawal_tax_pct)
      : input.amount;
  const isVirtual = input.account === "demo";
  const providerPending = input.method === "mpesa" && input.account === "real";
  const status = providerPending ? "pending" : "completed";

  if (input.kind === "withdraw") {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("balance_usd, demo_balance_usd")
      .eq("id", input.userId)
      .single();
    if (error || !profile) throw new Error("Profile not found");

    const balance =
      input.account === "real"
        ? Number(profile.balance_usd ?? 0)
        : Number(profile.demo_balance_usd ?? 0);
    if (balance < amountUsd) throw new Error("Insufficient balance");

    await adjustBalance(input.userId, input.account, -amountUsd, currency, 0);
  }

  const { data: tx, error } = await supabaseAdmin
    .from("transactions")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      method: input.method,
      account_type: input.account,
      amount: input.amount,
      currency,
      amount_usd: amountUsd,
      status,
      is_virtual: isVirtual,
      meta: {
        phone: input.method === "mpesa" ? normalizeKenyanPhone(input.phone) : null,
        usd_to_ksh: USD_TO_KSH,
        withdrawal_tax_pct: input.kind === "withdraw" ? settings.withdrawal_tax_pct : null,
        net_amount: input.kind === "withdraw" ? netAmount : null,
      },
    } as Record<string, unknown>)
    .select("*")
    .single();
  if (error || !tx) throw new Error(error?.message ?? "Could not create transaction");

  if (input.kind === "deposit" && status === "completed") {
    await adjustBalance(
      input.userId,
      input.account,
      amountUsd,
      currency,
      currency === "KSH" ? input.amount : 0,
    );
  }

  return tx as WalletTransaction;
}

async function sendStkPush(transaction: WalletTransaction, phone?: string) {
  const msisdn = normalizeKenyanPhone(phone);
  const env = getDarajaEnv("stk");
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${env.stkShortcode}${env.stkPasskey}${timestamp}`).toString(
    "base64",
  );
  const payload = {
    BusinessShortCode: env.stkShortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(Number(transaction.amount)),
    PartyA: msisdn,
    PartyB: env.stkShortcode,
    PhoneNumber: msisdn,
    CallBackURL: env.stkCallbackUrl,
    AccountReference: `MEGAFLIP-${transaction.id.slice(0, 8)}`,
    TransactionDesc: "MEGAFLIP deposit",
  };

  const response = await darajaRequest("/mpesa/stkpush/v1/processrequest", payload, "stk");
  if (response.ResponseCode && response.ResponseCode !== "0") {
    throw new Error(response.ResponseDescription ?? response.errorMessage ?? "STK push rejected");
  }

  await recordPaymentRequest(transaction.id, "stk_push", msisdn, payload, response);
  return response;
}

async function queryStkStatus(checkoutRequestId: string) {
  const env = getDarajaEnv("stk");
  const token = await getDarajaToken("stk");
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${env.stkShortcode}${env.stkPasskey}${timestamp}`).toString(
    "base64",
  );
  const payload = {
    BusinessShortCode: env.stkShortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await fetch(`${env.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatDarajaError("stk", "stk_push", res.status, json, env.baseUrl));
  }
  return json as Record<string, unknown>;
}

async function sendB2cPayment(
  transaction: WalletTransaction,
  phone?: string,
  payoutAmount?: number,
) {
  const msisdn = normalizeKenyanPhone(phone);
  const env = getDarajaEnv("b2c");
  const payload = {
    InitiatorName: env.b2cInitiatorName,
    SecurityCredential: env.b2cSecurityCredential,
    CommandID: env.b2cCommandId,
    Amount: Math.round(Number(payoutAmount ?? transaction.amount)),
    PartyA: env.b2cShortcode,
    PartyB: msisdn,
    Remarks: "MEGAFLIP withdrawal",
    QueueTimeOutURL: env.b2cTimeoutUrl,
    ResultURL: env.b2cResultUrl,
    Occasion: `MEGAFLIP-${transaction.id.slice(0, 8)}`,
  };

  const response = await darajaRequest("/mpesa/b2c/v1/paymentrequest", payload, "b2c");
  if (response.ResponseCode && response.ResponseCode !== "0") {
    throw new Error(
      response.ResponseDescription ?? response.errorMessage ?? "B2C payment rejected",
    );
  }

  await recordPaymentRequest(transaction.id, "b2c", msisdn, payload, response);
  await markTransaction(transaction.id, "completed", {
    daraja_request_sent: true,
    b2c_request_accepted: true,
    completed_on_b2c_acceptance: true,
    conversation_id: response.ConversationID ?? null,
    originator_conversation_id: response.OriginatorConversationID ?? null,
    response_description: response.ResponseDescription ?? null,
  });
  await markPaymentRequestStatus(transaction.id, "b2c", "completed", response);
  return response;
}

async function darajaRequest(path: string, payload: Record<string, unknown>, mode: DarajaMode) {
  const env = getDarajaEnv(mode);
  const token = await getDarajaToken(mode);
  const step: DarajaStep = mode === "stk" ? "stk_push" : "b2c_payment";
  const res = await fetch(`${env.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatDarajaError(mode, step, res.status, json, env.baseUrl));
  }
  return json as Record<string, unknown>;
}

async function getDarajaToken(mode: DarajaMode) {
  const env = getDarajaEnv(mode);
  const credentials = Buffer.from(`${env.consumerKey}:${env.consumerSecret}`).toString("base64");
  const res = await fetch(`${env.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(formatDarajaError(mode, "oauth_token", res.status, json, env.baseUrl));
  }
  return json.access_token as string;
}

async function adjustBalance(
  userId: string,
  account: "real" | "demo",
  usdDelta: number,
  currency: "KSH" | "USD",
  kshDelta: number,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("balance_usd, demo_balance_usd, balance_ksh")
    .eq("id", userId)
    .single();
  if (error || !profile) throw new Error("Profile not found");

  const update =
    account === "real"
      ? {
          balance_usd: Number(profile.balance_usd ?? 0) + usdDelta,
          balance_ksh: Number(profile.balance_ksh ?? 0) + (currency === "KSH" ? kshDelta : 0),
        }
      : {
          demo_balance_usd: Number(profile.demo_balance_usd ?? 0) + usdDelta,
          balance_ksh: Number(profile.balance_ksh ?? 0) + (currency === "KSH" ? kshDelta : 0),
        };

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update(update as Record<string, unknown>)
    .eq("id", userId);
  if (updateError) throw new Error(updateError.message);
}

async function markTransaction(
  transactionId: string,
  status: WalletTransaction["status"],
  meta: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: transactionId,
    _status: status,
    _meta: meta,
  });
}

async function recordPaymentRequest(
  transactionId: string,
  requestType: PaymentRequestType,
  phone: string,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("payment_requests").insert({
    transaction_id: transactionId,
    request_type: requestType,
    phone,
    checkout_request_id: responsePayload.CheckoutRequestID ?? null,
    conversation_id: responsePayload.ConversationID ?? null,
    originator_conversation_id: responsePayload.OriginatorConversationID ?? null,
    status: "pending",
    request_payload: requestPayload,
    response_payload: responsePayload,
  } as Record<string, unknown>);
  if (error) throw new Error(error.message);
}

async function markPaymentRequestStatus(
  transactionId: string,
  requestType: PaymentRequestType,
  status: WalletTransaction["status"],
  responsePayload: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("payment_requests")
    .update({ status, response_payload: responsePayload } as Record<string, unknown>)
    .eq("transaction_id", transactionId)
    .eq("request_type", requestType);
  if (error) throw new Error(error.message);
}

function validateMoney(
  kind: TransactionKind,
  method: "mpesa",
  amount: number,
  phone?: string,
  settings?: SystemSettings,
) {
  const minUsd =
    kind === "deposit" ? (settings?.min_deposit_usd ?? 3) : (settings?.min_withdrawal_usd ?? 3);
  const minKsh = minUsd * USD_TO_KSH;
  if (amount < minKsh) {
    throw new Error(`Minimum ${kind} is KSh ${minKsh} ($${minUsd})`);
  }
  normalizeKenyanPhone(phone);
}

async function getProfilePhone(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("phone")
    .eq("id", userId)
    .single();
  if (error || !data?.phone) {
    throw new Error("Add your M-Pesa phone number in Profile before using M-Pesa.");
  }
  return normalizeKenyanPhone(String(data.phone));
}

function toUsd(amount: number, currency: "KSH" | "USD") {
  return currency === "KSH" ? roundMoney(amount / USD_TO_KSH) : roundMoney(amount);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeKenyanPhone(phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error("Enter a valid Kenyan Safaricom number");
}

function darajaTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
}

function getDarajaEnv(mode: DarajaMode) {
  const baseUrl = normalizeDarajaBaseUrl(
    readEnv("DARAJA_BASE_URL") ?? "https://sandbox.safaricom.co.ke",
  );
  assertDarajaEnvironment(mode, baseUrl);
  const appUrl = getPublicAppUrl();
  const shared = {
    consumerKey: readEnv("DARAJA_CONSUMER_KEY"),
    consumerSecret: readEnv("DARAJA_CONSUMER_SECRET"),
  };
  const stk = {
    stkShortcode: readEnv("DARAJA_STK_SHORTCODE"),
    stkPasskey: readEnv("DARAJA_STK_PASSKEY"),
    stkCallbackUrl: readEnv("DARAJA_STK_CALLBACK_URL") ?? `${appUrl}/api/daraja/stk-callback`,
  };
  const b2c = {
    b2cInitiatorName: readEnv("DARAJA_B2C_INITIATOR_NAME"),
    b2cSecurityCredential: readEnv("DARAJA_B2C_SECURITY_CREDENTIAL"),
    b2cShortcode: readEnv("DARAJA_B2C_SHORTCODE"),
    b2cCommandId: readEnv("DARAJA_B2C_COMMAND_ID") ?? "BusinessPayment",
    b2cResultUrl: readEnv("DARAJA_B2C_RESULT_URL") ?? `${appUrl}/api/daraja/b2c-result`,
    b2cTimeoutUrl: readEnv("DARAJA_B2C_TIMEOUT_URL") ?? `${appUrl}/api/daraja/b2c-timeout`,
  };
  const required = mode === "stk" ? { ...shared, ...stk } : { ...shared, ...b2c };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing Daraja environment variable(s): ${missing.join(", ")}`);
  }
  return { baseUrl, ...(required as Record<string, string>) };
}

function getPublicAppUrl() {
  const explicit =
    readEnv("DARAJA_PUBLIC_BASE_URL") ?? readEnv("PUBLIC_APP_URL") ?? readEnv("APP_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new Error("Missing public app URL. Set DARAJA_PUBLIC_BASE_URL or APP_URL.");
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1).trim() : value;
}

function normalizeDarajaBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function assertDarajaEnvironment(mode: DarajaMode, baseUrl: string) {
  const isProdRuntime =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.NITRO_PRESET === "vercel";
  const usesSandbox = /sandbox/i.test(baseUrl);

  if (isProdRuntime && usesSandbox) {
    throw new Error(
      `Deposits are blocked because Daraja is configured for sandbox in production. Update DARAJA_BASE_URL and the related shortcode/keys to production values before processing ${mode.toUpperCase()} payments.`,
    );
  }
}

function formatDarajaError(
  mode: DarajaMode,
  step: DarajaStep,
  status: number,
  json: Record<string, unknown>,
  baseUrl: string,
) {
  const providerMessage =
    getStringValue(json.errorMessage) ??
    getStringValue(json.error_description) ??
    getStringValue(json.ResponseDescription) ??
    getStringValue(json.ResultDesc);
  const failingStep = describeDarajaStep(step);
  const providerPart = providerMessage ? ` Provider said: ${providerMessage}.` : "";

  if (providerMessage?.toLowerCase().includes("invalid access token")) {
    return [
      `${failingStep} failed because Daraja rejected the OAuth access token.`,
      `This usually means DARAJA_BASE_URL (${baseUrl}) is using sandbox while the credentials/shortcode are production, or production while they are sandbox.`,
      "Check DARAJA_BASE_URL, DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_STK_SHORTCODE, and DARAJA_STK_PASSKEY, then redeploy.",
      `Provider said: ${providerMessage}.`,
    ].join(" ");
  }

  if (step === "oauth_token") {
    return [
      `${failingStep} failed.`,
      "Daraja did not return an access token.",
      `Check DARAJA_CONSUMER_KEY and DARAJA_CONSUMER_SECRET for the ${darajaEnvironmentName(baseUrl)} app.`,
      `HTTP status: ${status}.${providerPart}`,
    ].join(" ");
  }

  return [
    `${failingStep} failed.`,
    `Check the ${mode.toUpperCase()} payload settings for the ${darajaEnvironmentName(baseUrl)} Daraja app.`,
    `HTTP status: ${status}.${providerPart}`,
  ].join(" ");
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function describeDarajaStep(step: DarajaStep) {
  if (step === "oauth_token") return "Daraja OAuth token request";
  if (step === "stk_push") return "Daraja STK push request";
  return "Daraja B2C payment request";
}

function darajaEnvironmentName(baseUrl: string) {
  return baseUrl.includes("sandbox") ? "sandbox" : "production";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
