import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_state,freeze_until")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profile?.account_state === "deleted") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (profile?.account_state === "closed") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (profile?.account_state === "frozen" && profile.freeze_until && new Date(profile.freeze_until).getTime() > Date.now()) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (profile?.account_state === "frozen") {
      await supabase.from("profiles").update({ account_state: "active", freeze_until: null }).eq("id", data.user.id);
    }

    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const [isAdmin, setIsAdmin] = useState(false);
    const [lastUnread, setLastUnread] = useState(0);
    const [isFullWidth, setIsFullWidth] = useState(false);
  const location = useLocation();
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

  useEffect(() => {
    setIsFullWidth(location.pathname === "/binary" || location.pathname.startsWith("/binary/"));
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background pb-20 lg:pb-0">
      <AppHeader />
      <main className={isFullWidth ? "flex-1 overflow-y-auto px-0 py-3 lg:py-4" : "flex-1 overflow-y-auto px-3 py-3 sm:px-4 lg:px-6 lg:py-4"}>
        {isAdmin && (supportUnread?.count ?? 0) > 0 && (
          <div className="mx-3 mt-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary sm:mx-4">
            Support: {supportUnread?.count} unread user message
            {(supportUnread?.count ?? 0) === 1 ? "" : "s"}
          </div>
        )}
        <div className="mx-auto w-full max-w-6xl pb-6">
          <Outlet />
        </div>
      </main>
      {isAdmin && <DebugConsole />}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
