import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/b2c-timeout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        await handleB2cTimeout(payload);
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

async function handleB2cTimeout(payload: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = getRecord(payload.Result);
  const conversationId = getString(result.ConversationID);
  const originatorConversationId = getString(result.OriginatorConversationID);

  let query = supabaseAdmin.from("payment_requests").select("id, transaction_id").limit(1);
  if (conversationId) query = query.eq("conversation_id", conversationId);
  else if (originatorConversationId) {
    query = query.eq("originator_conversation_id", originatorConversationId);
  } else {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: paymentRequest } = await query.maybeSingle();

  await supabaseAdmin.from("daraja_callbacks").insert({
    payment_request_id: paymentRequest?.id ?? null,
    transaction_id: paymentRequest?.transaction_id ?? null,
    callback_type: "b2c_timeout",
    conversation_id: conversationId ?? null,
    result_code: -1,
    result_description: "B2C request timed out",
    payload,
  } as Record<string, unknown>);

  if (!paymentRequest?.transaction_id) return;

  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: paymentRequest.transaction_id,
    _status: "failed",
    _meta: {
      daraja_result_code: -1,
      daraja_result_description: "B2C request timed out",
      callback_at: new Date().toISOString(),
    },
  });

  await supabaseAdmin
    .from("payment_requests")
    .update({ status: "failed", response_payload: payload } as Record<string, unknown>)
    .eq("id", paymentRequest.id);
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
