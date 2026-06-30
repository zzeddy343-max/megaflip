import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send } from "lucide-react";
import { getSupportInbox, getSupportMessages, sendSupportMessage } from "@/lib/support.functions";
import { toast } from "sonner";

type SupportThread = {
  id: string;
  user_id: string;
  subject: string;
  unread_by_admin: number;
  unread_by_user: number;
  last_message_at: string;
  profiles?: { email?: string | null; full_name?: string | null; username?: string | null } | null;
};

type SupportMessage = {
  id: string;
  thread_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

export function SupportPanel({ adminMode = false }: { adminMode?: boolean }) {
  const inboxFn = useServerFn(getSupportInbox);
  const messagesFn = useServerFn(getSupportMessages);
  const sendFn = useServerFn(sendSupportMessage);
  const qc = useQueryClient();
  const [activeThreadId, setActiveThreadId] = useState("");
  const [body, setBody] = useState("");

  const { data: inbox } = useQuery({
    queryKey: ["support-inbox", adminMode],
    queryFn: () => inboxFn(),
    refetchInterval: adminMode ? 7000 : 12000,
  });

  const threads = useMemo(() => (inbox?.threads ?? []) as SupportThread[], [inbox]);
  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) setActiveThreadId(threads[0].id);
  }, [activeThreadId, threads]);

  const { data: messages = [] } = useQuery({
    queryKey: ["support-messages", activeThreadId],
    queryFn: () => messagesFn({ data: { thread_id: activeThreadId } }) as Promise<SupportMessage[]>,
    enabled: !!activeThreadId,
    refetchInterval: activeThreadId ? 5000 : false,
  });

  const sendMut = useMutation({
    mutationFn: () =>
      sendFn({
        data: { thread_id: activeThreadId || undefined, subject: "Support", body: body.trim() },
      }),
    onSuccess: (result) => {
      setBody("");
      setActiveThreadId(result.thread_id);
      qc.invalidateQueries({ queryKey: ["support-inbox"] });
      qc.invalidateQueries({ queryKey: ["support-messages", result.thread_id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send message"),
  });

  return (
    <div className="space-y-2">
      {adminMode && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {threads.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No support chats yet.
            </div>
          )}
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setActiveThreadId(thread.id)}
              className={
                "shrink-0 rounded-xl border px-3 py-2 text-left text-xs " +
                (activeThreadId === thread.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card")
              }
            >
              <div className="max-w-36 truncate font-bold">
                {thread.profiles?.full_name ||
                  thread.profiles?.username ||
                  thread.profiles?.email ||
                  thread.user_id.slice(0, 8)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {thread.unread_by_admin > 0 ? `${thread.unread_by_admin} new` : "open"}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-bold">
          <MessageCircle className="h-4 w-4 text-primary" />
          {adminMode
            ? activeThread
              ? activeThread.profiles?.email || "Support chat"
              : "Support inbox"
            : "Support chat"}
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto p-3">
          {!activeThreadId && !adminMode && messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground">
              Send a message and support will reply here.
            </div>
          )}
          {activeThreadId && messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground">No messages yet.</div>
          )}
          {(messages as SupportMessage[]).map((message) => {
            const mine = adminMode
              ? message.sender_role === "admin"
              : message.sender_role === "user";
            return (
              <div key={message.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
                <div
                  className={
                    "max-w-[82%] rounded-xl px-3 py-2 text-sm " +
                    (mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface border border-border")
                  }
                >
                  <div>{message.body}</div>
                  <div className="mt-1 text-[9px] opacity-70">
                    {new Date(message.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 border-t border-border p-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={adminMode && !activeThreadId ? "Select a chat" : "Type a message"}
            disabled={adminMode && !activeThreadId}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={() => sendMut.mutate()}
            disabled={sendMut.isPending || !body.trim() || (adminMode && !activeThreadId)}
            className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
