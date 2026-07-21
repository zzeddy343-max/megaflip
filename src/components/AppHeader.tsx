import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Sparkles, Rocket, Wallet, User, LogOut, Sun, Moon, Zap, LineChart, Bitcoin, Shield, Crosshair, Cpu, Home, Download, Upload, RotateCcw, MessageSquare, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/trades.functions";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { LOGO_URL } from "@/lib/brand";

export function AppHeader() {
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    refetchInterval: 5000,
  });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      if (!cancelled) setIsAdmin(!!data?.some((r) => r.role === "admin"));
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const menu = [
    { to: "/binary", label: "Binary", icon: Zap },
    { to: "/bot-builder", label: "Bot Builder", icon: Cpu },
    { to: "/forex", label: "Forex", icon: LineChart },
    { to: "/crypto", label: "Crypto", icon: Bitcoin },
    { to: "/predict", label: "Polymarket", icon: Sparkles },
    { to: "/aviator", label: "Aviator", icon: Rocket },
    { to: "/wallet", label: "Wallet", icon: Wallet },
  ] as const;

  const desktopNav = [
    { to: "/binary", label: "Trader's Hub", icon: Home },
    { to: "/wallet", label: "Deposit", icon: Download },
    { to: "/wallet", label: "Withdraw", icon: Upload },
    { to: "/positions", label: "History", icon: RotateCcw },
    { to: "/scanner", label: "Chat", icon: MessageSquare },
  ] as const;

  return (
    <header className="sticky top-0 z-40 flex h-[3.25rem] md:h-14 items-center gap-2.5 px-3 lg:px-4 bg-background/95 backdrop-blur-md border-b border-border">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="h-10 w-10 grid place-items-center rounded-lg bg-surface border border-primary/35 text-primary shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_18%,transparent)] shrink-0" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-background border-border p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <img src={LOGO_URL} alt="Megaflip" className="h-8 w-8 object-contain" />
              <span className="text-base font-extrabold tracking-tight">MEGAFLIP</span>
            </SheetTitle>
          </SheetHeader>
          <nav className="p-2">
            {menu.map((m) => (
              <Link key={m.to} to={m.to} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
                <m.icon className="h-4 w-4 text-primary" />
                {m.label}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
                <Shield className="h-4 w-4 text-primary" />
                Admin
              </Link>
            )}
            <div className="my-2 h-px bg-border" />
            <div className="my-2 h-px bg-border" />
            <Link to="/scanner" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
              <Crosshair className="h-4 w-4 text-primary" />
              AI Scanner
            </Link>
            <Link to="/profile" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
              <User className="h-4 w-4 text-primary" />
              Profile
            </Link>
            <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
              {theme === "dark" ? <Sun className="h-4 w-4 text-primary" /> : <Moon className="h-4 w-4 text-primary" />}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </button>
            <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold text-bear">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      <Link to="/binary" className="flex items-center gap-1.5 shrink-0">
        <img src={LOGO_URL} alt="Megaflip" className="h-9 w-9 rounded-xl object-contain bg-primary/10 p-1 drop-shadow-[0_0_10px_color-mix(in_oklab,var(--gold)_55%,transparent)]" />
        <span className="hidden sm:inline text-xs font-extrabold tracking-wider">MEGAFLIP</span>
      </Link>

      <nav className="hidden xl:flex items-center gap-6 text-muted-foreground">
        {desktopNav.map((m) => (
          <Link key={m.label} to={m.to} className="flex items-center gap-2 text-sm font-medium hover:text-foreground">
            <m.icon className="h-4 w-4" />
            {m.label}
          </Link>
        ))}
      </nav>

      <button className="hidden lg:flex mx-auto h-10 min-w-[200px] items-center justify-between rounded-lg border border-border bg-surface px-3 text-sm font-bold">
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[10px] font-black text-primary-foreground">MF</span>
          Megaflip Trader
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      <button onClick={toggleTheme} className="hidden lg:grid h-11 w-11 place-items-center rounded-lg border border-border bg-surface text-primary" aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="ml-auto lg:ml-0">
        <AccountSwitcher />
      </div>
      <Link to="/wallet" className="hidden lg:inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-extrabold text-primary-foreground">
        Deposit
      </Link>
      <Link to="/profile" className="hidden lg:grid h-11 w-11 place-items-center rounded-full border border-border bg-surface text-muted-foreground">
        <User className="h-5 w-5" />
      </Link>
    </header>
  );
}
