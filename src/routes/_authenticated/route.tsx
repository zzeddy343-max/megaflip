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

  const isAdminConsole = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

  useEffect(() => {
    setIsFullWidth(location.pathname === "/binary" || location.pathname.startsWith("/binary/"));
  }, [location.pathname]);

  const shellHeightClass = isAdminConsole ? "min-h-[100dvh]" : "h-[100dvh]";
  const shellOverflowClass = isAdminConsole ? "overflow-x-hidden" : "overflow-hidden";
  const mainOverflowClass = isFullWidth
    ? "overflow-hidden"
    : isAdminConsole
      ? "overflow-visible"
      : "overflow-y-auto overflow-x-hidden";
  const contentOverflowClass = isFullWidth ? "overflow-hidden" : "overflow-visible";

  return (
    <div className={`flex ${shellHeightClass} w-full max-w-full flex-col ${shellOverflowClass} bg-background pb-20 lg:pb-0`}>
      <AppHeader />
      <main className={`min-h-0 flex-1 w-full max-w-full px-0 py-0 ${mainOverflowClass}`}>
        {isAdmin && (supportUnread?.count ?? 0) > 0 && (
          <div className="border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold text-primary">
            Support: {supportUnread?.count} unread user message
            {(supportUnread?.count ?? 0) === 1 ? "" : "s"}
          </div>
        )}
        <div className={`min-h-full w-full max-w-full ${contentOverflowClass}`}>
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
