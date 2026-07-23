import { Link } from "@tanstack/react-router";
import { Zap, Cpu, Crosshair, Clock } from "lucide-react";

const items = [
  { to: "/binary", label: "Trade", icon: Zap },
  { to: "/bot-builder", label: "Builder", icon: Cpu },
  { to: "/scanner", label: "AI Scanner", icon: Crosshair },
  { to: "/positions", label: "Positions", icon: Clock },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-md border-t border-border">
      <ul className="grid grid-cols-4 max-w-3xl mx-auto">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      "grid place-items-center h-8 w-11 rounded-full transition-all " +
                      (isActive
                        ? "bg-primary/10 text-primary shadow-[0_0_22px_color-mix(in_oklab,var(--gold)_28%,transparent)]"
                        : "")
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="leading-none">{label}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
