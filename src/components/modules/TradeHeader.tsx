import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Sun, Moon, Wallet, LogOut, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/trades.functions";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { LOGO_URL } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface TradeHeaderProps {
  assetSymbol?: string;
  currentPrice?: number;
  priceChange?: number;
  accountBalance?: number;
}

export function TradeHeader({
  assetSymbol = "Vol 75",
  currentPrice = 9554.32,
  priceChange = 0.14,
  accountBalance = 5000.0,
}: TradeHeaderProps) {
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    refetchInterval: 5000,
  });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const priceChangePercent = ((priceChange / currentPrice) * 100).toFixed(2);
  const isPositive = priceChange >= 0;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="h-16 px-4 flex items-center justify-between">
        {/* Left Section - Logo & Branding */}
        <div className="flex items-center gap-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="h-9 w-9 grid place-items-center rounded-lg hover:bg-surface border border-border transition-colors"
                aria-label="Menu"
              >
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-background border-border p-0">
              <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
                <SheetTitle className="flex items-center gap-2">
                  <img src={LOGO_URL} alt="Megaflip" className="h-8 w-8 object-contain" />
                  <span className="text-base font-extrabold tracking-tight">MEGAFLIP</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="p-2 space-y-1">
                <AccountSwitcher />
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <img src={LOGO_URL} alt="MEGAFLIP" className="h-8 w-8 object-contain" />
            <span className="hidden sm:inline text-base font-extrabold tracking-wider text-foreground">
              MEGAFLIP
            </span>
          </Link>
        </div>

        {/* Center Section - Asset Selector */}
        <div className="hidden md:flex items-center gap-4 flex-1 justify-center max-w-xs">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface border border-border transition-colors group">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Active Asset</div>
                  <div className="text-sm font-bold text-foreground">{assetSymbol}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem>Binary Indices</DropdownMenuItem>
              <DropdownMenuItem>Forex Pairs</DropdownMenuItem>
              <DropdownMenuItem>Crypto Assets</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Price Display */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface/50 border border-border">
            <div className="text-right">
              <div className="text-sm font-bold text-foreground">{currentPrice.toFixed(2)}</div>
              <div className={`text-xs font-semibold ${isPositive ? "text-bull" : "text-bear"}`}>
                {isPositive ? "+" : ""}
                {priceChangePercent}%
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Account & Controls */}
        <div className="flex items-center gap-2">
          {/* Account Balance */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br from-gold/20 to-primary/20 border border-gold/30">
            <Wallet className="h-4 w-4 text-gold" />
            <div>
              <div className="text-xs text-muted-foreground font-semibold">Balance</div>
              <div className="text-sm font-bold text-foreground">${accountBalance.toFixed(2)}</div>
            </div>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-surface border border-border transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-gold" />
            ) : (
              <Moon className="h-4 w-4 text-foreground" />
            )}
          </button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-9 px-3 flex items-center gap-2 rounded-lg hover:bg-surface border border-border transition-colors">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-semibold text-foreground">
                    {profile?.user?.email?.split("@")[0] || "User"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {profile?.account_type || "Demo"}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => navigate({ to: "/profile" })}>
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/wallet" })}>
                Wallet
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
