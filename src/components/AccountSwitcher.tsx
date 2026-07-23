import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/trades.functions";
import { setActiveAccount } from "@/lib/account.functions";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage, logDebugEvent, serializeError } from "@/lib/debug-logger";
import { AdminNotifications } from "@/components/AdminNotifications";

export function AccountSwitcher() {
  const fetchProfile = useServerFn(getMyProfile);
  const setAccount = useServerFn(setActiveAccount);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    refetchInterval: 5000,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      if (!cancelled) setIsAdmin(!!data?.some((row) => row.role === "admin"));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = (profile?.active_account ?? "real") as "real" | "demo";
  const realBal = Number(profile?.balance_usd ?? 0);
  const demoBal = Number(profile?.demo_balance_usd ?? 0);
  const activeBal = active === "real" ? realBal : demoBal;

  async function switchTo(account: "real" | "demo") {
    if (account === active) {
      setOpen(false);
      return;
    }
    logDebugEvent("info", "account.switch", "Switch account requested", {
      from: active,
      to: account,
    });
    try {
      try {
        await setAccount({ data: { account } });
        logDebugEvent("info", "account.switch", "Server account switch succeeded", { account });
      } catch (serverError) {
        logDebugEvent(
          "warn",
          "account.switch",
          "Server account switch failed, trying client fallback",
          serializeError(serverError),
        );
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) throw new Error("Please sign in again");
        const { error } = await supabase
          .from("profiles")
          .update({ active_account: account })
          .eq("id", user.user.id);
        if (error) throw error;
        logDebugEvent("info", "account.switch", "Client fallback account switch succeeded", {
          account,
        });
      }
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(`Switched to ${account.toUpperCase()} account`);
      setOpen(false);
    } catch (e) {
      logDebugEvent("error", "account.switch", "Account switch failed", serializeError(e));
      toast.error(getErrorMessage(e, "Failed to switch"));
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <AdminNotifications isAdmin={isAdmin} />
      <button
        onClick={() => setOpen(!open)}
        className={
          "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold " +
          (active === "real"
            ? "bg-bull/10 border-bull/40 text-bull"
            : "bg-primary/10 border-primary/40 text-primary")
        }
      >
        {active === "real" ? (
          <span className="text-[13px] leading-none">🇺🇸</span>
        ) : (
          <span className="text-[10px] px-1 rounded bg-primary/30 text-primary-foreground font-extrabold">
            D
          </span>
        )}
        <span className="tabular-nums">${activeBal.toFixed(2)}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-border">
              Switch account
            </div>
            <button
              onClick={() => switchTo("real")}
              className={
                "w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface " +
                (active === "real" ? "bg-bull/5" : "")
              }
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">🇺🇸</span>
                <span className="text-sm font-bold">Real USD</span>
              </span>
              <span className="text-sm font-bold tabular-nums text-bull">
                ${realBal.toFixed(2)}
              </span>
            </button>
            <button
              onClick={() => switchTo("demo")}
              className={
                "w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface " +
                (active === "demo" ? "bg-primary/5" : "")
              }
            >
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 grid place-items-center rounded bg-primary text-primary-foreground text-[9px] font-extrabold">
                  D
                </span>
                <span className="text-sm font-bold">Demo USD</span>
              </span>
              <span className="text-sm font-bold tabular-nums text-primary">
                ${demoBal.toFixed(2)}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
