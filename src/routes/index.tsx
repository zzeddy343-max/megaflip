import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, BarChart3, Plane, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { LOGO_URL } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "MEGAFLIP - Trading workspace" }] }),
  component: LandingPage,
});

const markets = [
  { label: "Binary", value: "Vol 75", tone: "text-primary", icon: Zap },
  { label: "Forex", value: "EUR/USD", tone: "text-bull", icon: BarChart3 },
  { label: "Crypto", value: "BTC/USD", tone: "text-bear", icon: Activity },
  { label: "Aviator", value: "Global rounds", tone: "text-primary", icon: Plane },
];

function LandingPage() {
  const navigate = useNavigate();
  const [logoClicks, setLogoClicks] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleLogoClick(e: React.MouseEvent) {
    e.preventDefault();
    if (resetTimer.current) clearTimeout(resetTimer.current);
    const next = logoClicks + 1;
    setLogoClicks(next);
    if (next >= 7) {
      setLogoClicks(0);
      navigate({ to: "/admin-setup" });
      return;
    }
    resetTimer.current = setTimeout(() => setLogoClicks(0), 1800);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" onClick={handleLogoClick} className="flex items-center gap-2.5">
            <img src={LOGO_URL} alt="MEGAFLIP" className="h-10 w-10 object-contain" />
            <span className="text-base font-extrabold tracking-wider">MEGAFLIP</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-extrabold text-primary-foreground glow-primary"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate min-h-[92vh] overflow-hidden pt-16">
        <MarketBackdrop />
        <div className="relative mx-auto grid min-h-[calc(92vh-4rem)] max-w-6xl content-center gap-10 px-4 py-12 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handleLogoClick}
                aria-label="MEGAFLIP logo"
                className="rounded-xl"
              >
                <img
                  src={LOGO_URL}
                  alt=""
                  className="h-16 w-16 object-contain drop-shadow-[0_0_24px_color-mix(in_oklab,var(--gold)_55%,transparent)]"
                />
              </button>
              <div className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
                Trading workspace
              </div>
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
              MEGAFLIP
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Trade binary markets, Forex, crypto, prediction events, and synced Aviator rounds from
              one focused dashboard.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground glow-primary"
              >
                Start trading
              </Link>
              <Link
                to="/auth"
                className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-bold text-foreground"
              >
                Access account
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/90 p-3 shadow-2xl backdrop-blur">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Live workspace
              </span>
              <span className="live-dot" />
            </div>
            <div className="space-y-2">
              {markets.map(({ label, value, tone, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
                >
                  <div
                    className={"grid h-9 w-9 place-items-center rounded-lg bg-background " + tone}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{label}</div>
                    <div className="text-xs text-muted-foreground">{value}</div>
                  </div>
                  <div className={"text-sm font-extrabold tabular-nums " + tone}>
                    {label === "Aviator" ? "2.14x" : "+0.42%"}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Feature icon={<Smartphone className="h-4 w-4" />} label="M-Pesa ready" />
              <Feature icon={<ShieldCheck className="h-4 w-4" />} label="Demo + real" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
  );
}

function MarketBackdrop() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-background">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px)",
          backgroundSize: "54px 54px",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,transparent,var(--background)_72%)]" />
      <div className="absolute left-0 right-0 top-[18%] flex h-64 items-end gap-3 px-4 opacity-70 sm:px-10">
        {Array.from({ length: 34 }).map((_, i) => {
          const up = i % 3 !== 0;
          const h = 36 + ((i * 29) % 150);
          return (
            <span key={i} className="relative flex flex-1 items-end justify-center">
              <span
                className={"absolute bottom-0 w-px " + (up ? "bg-bull/70" : "bg-bear/70")}
                style={{ height: `${h + 34}px` }}
              />
              <span
                className={"w-full max-w-3 rounded-sm " + (up ? "bg-bull" : "bg-bear")}
                style={{
                  height: `${h}px`,
                  animation: `market-rise ${2.4 + (i % 5) * 0.22}s ease-in-out infinite`,
                  animationDelay: `${i * 55}ms`,
                }}
              />
            </span>
          );
        })}
      </div>
      <style>{`
        @keyframes market-rise {
          0%, 100% { transform: translateY(0); opacity: 0.82; }
          50% { transform: translateY(-12px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
