import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CircleDollarSign, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { getAdminNotifications } from "@/lib/support.functions";

type NotificationItem = {
  id: string;
  type: "support" | "transaction";
  title: string;
  detail: string;
  created_at: string;
  user_name?: string | null;
};

export function AdminNotifications({ isAdmin }: { isAdmin: boolean }) {
  const notificationsFn = useServerFn(getAdminNotifications);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => notificationsFn(),
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  const items = ((data?.items ?? []) as NotificationItem[]).slice(0, 8);
  if (!isAdmin) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_24%,transparent)]"
        aria-label="View admin notifications"
      >
        <Bell className="h-4 w-4 fill-current" />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-[min(88vw,22rem)] max-w-[22rem] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Critical alerts
            </div>
            {items.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No critical alerts right now.</div>
            ) : (
              <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-2 p-3 text-sm">
                    <div className="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary">
                      {item.type === "support" ? (
                        <MessageSquareText className="h-3.5 w-3.5" />
                      ) : (
                        <CircleDollarSign className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="truncate font-semibold">{item.title}</div>
                      <div className="break-words text-[11px] text-muted-foreground">
                        {item.detail}
                      </div>
                      <div className="mt-1 break-words text-[10px] text-muted-foreground">
                        {item.user_name || "system"} · {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
