import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/b2c-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        await handleB2cCallback(payload, "b2c");
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

async function handleB2cCallback(
  payload: Record<string, unknown>,
  callbackType: "b2c" | "b2c_timeout",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = getRecord(payload.Result);
  const conversationId = getString(result.ConversationID);
  const originatorConversationId = getString(result.OriginatorConversationID);
  const resultCode = Number(result.ResultCode ?? -1);
  const resultDescription = getString(result.ResultDesc) ?? "B2C callback received";
  const transactionRef = extractTransactionRef(result);
  const paymentRequest = await findB2cPaymentRequest(
    supabaseAdmin,
    conversationId,
    originatorConversationId,
    transactionRef,
  );

  await supabaseAdmin.from("daraja_callbacks").insert({
    payment_request_id: paymentRequest?.id ?? null,
    transaction_id: paymentRequest?.transaction_id ?? null,
    callback_type: callbackType,
    conversation_id: conversationId ?? null,
    result_code: resultCode,
    result_description: resultDescription,
    payload,
  } as Record<string, unknown>);

  if (!paymentRequest?.transaction_id) return;

  const status = resultCode === 0 ? "completed" : "failed";
  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: paymentRequest.transaction_id,
    _status: status,
    _meta: {
      daraja_result_code: resultCode,
      daraja_result_description: resultDescription,
      callback_at: new Date().toISOString(),
    },
  });

  await supabaseAdmin
    .from("payment_requests")
    .update({ status, response_payload: payload } as Record<string, unknown>)
    .eq("id", paymentRequest.id);
}

async function findB2cPaymentRequest(
  supabaseAdmin: any,
  conversationId?: string,
  originatorConversationId?: string,
  transactionRef?: string,
) {
  const select = "id, transaction_id, request_payload";
  if (conversationId) {
    const { data } = await supabaseAdmin
      .from("payment_requests")
      .select(select)
      .eq("request_type", "b2c")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (originatorConversationId) {
    const { data } = await supabaseAdmin
      .from("payment_requests")
      .select(select)
      .eq("request_type", "b2c")
      .eq("originator_conversation_id", originatorConversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (transactionRef) {
    const { data } = await supabaseAdmin
      .from("payment_requests")
      .select(select)
      .eq("request_type", "b2c")
      .order("created_at", { ascending: false })
      .limit(100);
    const match = (data ?? []).find((row: { transaction_id?: string; request_payload?: Record<string, unknown> }) => {
      const occasion = getString(row.request_payload?.Occasion);
      return row.transaction_id?.toLowerCase().startsWith(transactionRef) ||
        parseTronixRef(occasion) === transactionRef;
    });
    if (match) return match;
  }

  // Fallback: if we still don't have a payment_request, try to locate the
  // transaction directly by the TRONIX reference (first 8 hex chars of UUID)
  if (transactionRef) {
    const { data: tx } = await supabaseAdmin
      .from("transactions")
      .select("id")
      .ilike("id", `${transactionRef}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tx && (tx as any).id) {
      return { id: null, transaction_id: (tx as any).id, request_payload: null } as any;
    }
  }

  return null;
}

function extractTransactionRef(result: Record<string, unknown>) {
  const direct = getString(result.Occasion) ?? getString(result.OriginatorConversationID);
  const fromDirect = parseTronixRef(direct);
  if (fromDirect) return fromDirect;

  const referenceData = getRecord(result.ReferenceData);
  const item = referenceData.ReferenceItem;
  const items = Array.isArray(item) ? item : item ? [item] : [];
  for (const raw of items) {
    const row = getRecord(raw);
    const value = getString(row.Value) ?? getString(row.value);
    const ref = parseTronixRef(value);
    if (ref) return ref;
  }
  return undefined;
}

function parseTronixRef(value?: string) {
  const match = value?.match(/TRONIX-([0-9a-f]{8})/i);
  return match?.[1]?.toLowerCase();
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
