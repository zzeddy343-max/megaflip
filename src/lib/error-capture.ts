// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error ?? event;
    record(err);
    // Client-side: attempt recovery for dynamic import fetch failures
    tryRecoverDynamicImport(err);
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    record(reason);
    tryRecoverDynamicImport(reason);
  });
}

function tryRecoverDynamicImport(error: unknown) {
  if (typeof window === "undefined") return;
  try {
    const msg = String((error && (error as any).message) ?? error ?? "");
    if (!msg.includes("Failed to fetch dynamically imported module")) return;

    // Avoid reload loops: only attempt once every 5 minutes per tab
    const last = Number(window.sessionStorage.getItem("megaflip-dynamic-import-reload") ?? "0");
    if (Date.now() - last < 1000 * 60 * 5) {
      // already tried recently — notify user
      try {
        // eslint-disable-next-line no-alert
        alert("App resources out of sync. Please hard reload (Shift+Refresh) to update.");
      } catch {}
      return;
    }
    window.sessionStorage.setItem("megaflip-dynamic-import-reload", String(Date.now()));

    // Unregister service workers to avoid stale cached HTML/manifest
    if (navigator && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    }

    // Reload with a cache-busting query param so clients request fresh assets
    const u = new URL(window.location.href);
    u.searchParams.set("_tbust", String(Date.now()));
    // Use replace to avoid polluting history
    window.location.replace(u.toString());
  } catch (e) {
    // swallow errors here — we don't want to make failures worse
    console.error("Dynamic import recovery failed", e);
  }
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
