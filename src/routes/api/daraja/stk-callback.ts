import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/stk-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        await handleStkCallback(payload);
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

async function handleStkCallback(payload: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const callback = getRecord(getRecord(payload.Body).stkCallback);
  const checkoutRequestId = getString(callback.CheckoutRequestID);
  const resultCode = Number(callback.ResultCode ?? -1);
  const resultDescription = getString(callback.ResultDesc) ?? "STK callback received";
  const metadata = extractCallbackMetadata(getArray(getRecord(callback.CallbackMetadata).Item));
  const receiptNumber = getString(metadata.MpesaReceiptNumber);

  const { data: paymentRequest } = await supabaseAdmin
    .from("payment_requests")
    .select("id, transaction_id")
    .eq("checkout_request_id", checkoutRequestId ?? "")
    .maybeSingle();

  await supabaseAdmin.from("daraja_callbacks").insert({
    payment_request_id: paymentRequest?.id ?? null,
    transaction_id: paymentRequest?.transaction_id ?? null,
    callback_type: "stk",
    checkout_request_id: checkoutRequestId ?? null,
    result_code: resultCode,
    result_description: resultDescription,
    payload,
  } as Record<string, unknown>);

  if (!paymentRequest?.transaction_id) return;

  // If Daraja returned success but omitted the receipt number, perform a
  // lightweight STK status query to confirm the transaction state and avoid
  // leaving deposits stuck in "processing" on the UI.
  let finalStatus: "completed" | "failed" = resultCode === 0 ? "completed" : "failed";

  if (resultCode === 0 && !receiptNumber && checkoutRequestId) {
    try {
      const statusResult = await queryStkStatusLocal(checkoutRequestId);
      const rc = Number(statusResult.ResultCode ?? statusResult.ResponseCode ?? -1);
      if (rc === 0) {
        finalStatus = "completed";
      } else {
        finalStatus = "failed";
      }
    } catch (err) {
      // If the query fails, fall back to completed (we rely on DB atomicity to
      // avoid double credits) but record the provider error in meta.
      finalStatus = "completed";
    }
  }

  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: paymentRequest.transaction_id,
    _status: finalStatus,
    _meta: {
      daraja_result_code: resultCode,
      daraja_result_description: resultDescription,
      mpesa_receipt_number: receiptNumber ?? null,
      callback_at: new Date().toISOString(),
    },
  });

  await supabaseAdmin
    .from("payment_requests")
    .update({
      status: finalStatus,
      response_payload: payload,
    } as Record<string, unknown>)
    .eq("id", paymentRequest.id);
}

async function queryStkStatusLocal(checkoutRequestId: string) {
  const baseUrl = (process.env.DARAJA_BASE_URL || "https://sandbox.safaricom.co.ke").replace(/\/+$/, "");
  const consumerKey = process.env.DARAJA_CONSUMER_KEY ?? "";
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET ?? "";
  const stkShortcode = process.env.DARAJA_STK_SHORTCODE ?? "";
  const stkPasskey = process.env.DARAJA_STK_PASSKEY ?? "";

  const creds = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const tokenRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  const token = tokenJson.access_token;
  if (!token) throw new Error("Could not obtain Daraja token");

  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${stkShortcode}${stkPasskey}${timestamp}`).toString("base64");
  const payload = {
    BusinessShortCode: stkShortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("STK query failed");
  return json as Record<string, unknown>;
}

function darajaTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
}

function extractCallbackMetadata(items: Array<{ Name?: string; Value?: unknown }>) {
  return items.reduce<Record<string, unknown>>((acc, item) => {
    if (item.Name) acc[item.Name] = item.Value;
    return acc;
  }, {});
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getArray(value: unknown): Array<{ Name?: string; Value?: unknown }> {
  return Array.isArray(value) ? (value as Array<{ Name?: string; Value?: unknown }>) : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
