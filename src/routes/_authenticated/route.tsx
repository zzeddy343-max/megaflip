import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DebugConsole } from "@/components/DebugConsole";
import { getAdminSupportUnreadCount } from "@/lib/support.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastUnread, setLastUnread] = useState(0);
  const unreadSupport = useServerFn(getAdminSupportUnreadCount);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.user.id);
      if (!cancelled) setIsAdmin(!!data?.some((row) => row.role === "admin"));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: supportUnread } = useQuery({
    queryKey: ["admin-support-unread"],
    queryFn: () => unreadSupport(),
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  useEffect(() => {
    const count = supportUnread?.count ?? 0;
    if (!isAdmin) return;
    if (count > lastUnread)
      toast.info(`Support has ${count} unread user message${count === 1 ? "" : "s"}`);
    setLastUnread(count);
  }, [isAdmin, lastUnread, supportUnread?.count]);

  return (
    <div className="min-h-screen pb-20 max-w-3xl mx-auto">
      <AppHeader />
      <main className="px-3 py-3">
        {isAdmin && (supportUnread?.count ?? 0) > 0 && (
          <div className="mx-3 mt-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
            Support: {supportUnread?.count} unread user message
            {(supportUnread?.count ?? 0) === 1 ? "" : "s"}
          </div>
        )}
        <Outlet />
      </main>
      {isAdmin && <DebugConsole />}
      <BottomNav />
    </div>
  );
}
