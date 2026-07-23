import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function isAdmin(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          eq: (
            column: string,
            value: string,
          ) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
          };
        };
      };
    };
  },
  userId: string,
) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export const getSupportInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("support_threads")
      .select("*, profiles:user_id(id,email,full_name,username)")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (!admin) q = q.eq("user_id", context.userId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { admin, threads: data ?? [] };
  });

export const getSupportMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ thread_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: thread, error: threadError } = await supabaseAdmin
      .from("support_threads")
      .select("id,user_id")
      .eq("id", data.thread_id)
      .single();
    if (threadError || !thread) throw new Error("Support thread not found");
    if (!admin && thread.user_id !== context.userId) throw new Error("Forbidden");

    await supabaseAdmin
      .from("support_threads")
      .update(admin ? { unread_by_admin: 0 } : { unread_by_user: 0 })
      .eq("id", data.thread_id);

    const { data: messages, error } = await supabaseAdmin
      .from("support_messages")
      .select("*")
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return messages ?? [];
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        thread_id: z.string().uuid().optional(),
        body: z.string().trim().min(1).max(2000),
        subject: z.string().trim().min(1).max(120).default("Support"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let threadId = data.thread_id;

    if (!threadId) {
      if (admin) throw new Error("Choose a user thread before replying");
      const { data: existing } = await supabaseAdmin
        .from("support_threads")
        .select("id")
        .eq("user_id", context.userId)
        .eq("status", "open")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      threadId = existing?.id;
      if (!threadId) {
        const { data: created, error } = await supabaseAdmin
          .from("support_threads")
          .insert({ user_id: context.userId, subject: data.subject })
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "Could not create support chat");
        threadId = created.id;
      }
    }

    const { data: thread, error: threadError } = await supabaseAdmin
      .from("support_threads")
      .select("id,user_id")
      .eq("id", threadId)
      .single();
    if (threadError || !thread) throw new Error("Support thread not found");
    if (!admin && thread.user_id !== context.userId) throw new Error("Forbidden");

    const { error: msgError } = await supabaseAdmin.from("support_messages").insert({
      thread_id: threadId,
      sender_id: context.userId,
      sender_role: admin ? "admin" : "user",
      body: data.body,
    });
    if (msgError) throw new Error(msgError.message);

    const unreadUpdate = admin
      ? { unread_by_user: 1, unread_by_admin: 0 }
      : { unread_by_admin: 1, unread_by_user: 0 };
    const { error: updateError } = await supabaseAdmin
      .from("support_threads")
      .update({ ...unreadUpdate, last_message_at: new Date().toISOString(), status: "open" })
      .eq("id", threadId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, thread_id: threadId };
  });

export const getAdminSupportUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) return { count: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("support_threads")
      .select("unread_by_admin")
      .gt("unread_by_admin", 0);
    if (error) throw new Error(error.message);
    return { count: (data ?? []).reduce((sum, row) => sum + Number(row.unread_by_admin ?? 0), 0) };
  });

export const broadcastSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        body: z.string().trim().min(1).max(2000),
        subject: z.string().trim().min(1).max(120).default("Broadcast"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .order("created_at", { ascending: false });
    if (profilesError) throw new Error(profilesError.message);

    const recipients = (profiles ?? []).map((row) => row.id as string);
    if (recipients.length === 0) return { ok: true, sent: 0 };

    const batch = recipients.map((userId) => ({
      user_id: userId,
      subject: data.subject,
      status: "open",
      last_message_at: new Date().toISOString(),
      unread_by_user: 1,
      unread_by_admin: 0,
    }));

    const { error: threadError } = await supabaseAdmin.from("support_threads").insert(batch);
    if (threadError) throw new Error(threadError.message);

    const { data: threads, error: threadsError } = await supabaseAdmin
      .from("support_threads")
      .select("id")
      .in("user_id", recipients)
      .order("created_at", { ascending: false })
      .limit(recipients.length);
    if (threadsError) throw new Error(threadsError.message);

    const threadRows = threads ?? [];
    const messages = threadRows.map((thread) => ({
      thread_id: thread.id,
      sender_id: context.userId,
      sender_role: "admin",
      body: data.body,
    }));

    if (messages.length) {
      const { error: messageError } = await supabaseAdmin.from("support_messages").insert(messages);
      if (messageError) throw new Error(messageError.message);
    }

    return { ok: true, sent: recipients.length };
  });

export const getAdminNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) return { items: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: supportRows }, { data: transactionRows }] = await Promise.all([
      supabaseAdmin
        .from("support_threads")
        .select("id,user_id,subject,last_message_at,profiles:user_id(id,email,full_name,username)")
        .gt("unread_by_admin", 0)
        .order("last_message_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("transactions")
        .select(
          "id,user_id,kind,amount_usd,created_at,profiles:user_id(id,email,full_name,username)",
        )
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const items = [
      ...(supportRows ?? []).map((row) => ({
        id: `support-${row.id}`,
        type: "support" as const,
        title: row.subject ?? "Support update",
        detail: "A new support reply needs attention.",
        created_at: row.last_message_at,
        user_name: (row.profiles as { full_name?: string | null } | null)?.full_name ?? null,
      })),
      ...(transactionRows ?? []).map((row) => ({
        id: `tx-${row.id}`,
        type: "transaction" as const,
        title: row.kind === "withdrawal" ? "Withdrawal request" : "Deposit request",
        detail: `${Number(row.amount_usd ?? 0).toFixed(2)} USD pending review`,
        created_at: row.created_at,
        user_name: (row.profiles as { full_name?: string | null } | null)?.full_name ?? null,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { items: items.slice(0, 8) };
  });
