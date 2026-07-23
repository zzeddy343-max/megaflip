import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  function doHardReload() {
    try {
      if (typeof window !== "undefined") {
        if (navigator && "serviceWorker" in navigator) {
          navigator.serviceWorker
            .getRegistrations()
            .then((regs) => regs.forEach((r) => r.unregister()))
            .catch(() => {});
        }
        const u = new URL(window.location.href);
        u.searchParams.set("_tbust", String(Date.now()));
        window.location.replace(u.toString());
      }
    } catch (e) {
      console.error(e);
      window.location.reload();
    }
  }

  const isDynamicImportFailure = error?.message?.includes?.(
    "Failed to fetch dynamically imported module",
  );

  return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-5 text-center space-y-3">
        <div className="h-12 w-12 mx-auto rounded-full bg-bear/15 text-bear grid place-items-center">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="font-bold text-base">Something broke on this screen</h2>
        <p className="text-xs text-muted-foreground">
          {error.message?.slice(0, 180) || "An unexpected error occurred."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (isDynamicImportFailure) return doHardReload();
              router.invalidate();
              reset();
            }}
            className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm glow-primary"
          >
            {isDynamicImportFailure ? "Hard reload" : "Try again"}
          </button>
          <button
            onClick={() => {
              if (isDynamicImportFailure) return doHardReload();
              router.push("/binary");
            }}
            className="flex-1 py-2.5 rounded-lg bg-surface border border-border font-bold text-sm"
          >
            Trade
          </button>
        </div>
      </div>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <div className="text-center">
        <div className="text-5xl font-extrabold text-primary">404</div>
        <p className="text-sm text-muted-foreground mt-2">This screen doesn't exist.</p>
        <Link
          to="/binary"
          className="inline-block mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm"
        >
          Back to trading
        </Link>
      </div>
    </div>
  );
}
