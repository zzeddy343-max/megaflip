import { useEffect, useState } from "react";
import { Bug, Copy, Trash2, X } from "lucide-react";
import {
  clearDebugEvents,
  getDebugEvents,
  logDebugEvent,
  type DebugEvent,
} from "@/lib/debug-logger";
import { toast } from "sonner";

export function DebugConsole() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<DebugEvent[]>([]);

  useEffect(() => {
    setEvents(getDebugEvents());

    const onLog = () => setEvents(getDebugEvents());
    const onError = (event: ErrorEvent) => {
      logDebugEvent("error", "window", event.message, {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
      });
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      logDebugEvent("error", "promise", "Unhandled promise rejection", event.reason);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button,a") : null;
      if (!target) return;
      logDebugEvent("info", "ui.click", describeElement(target), {
        disabled: target instanceof HTMLButtonElement ? target.disabled : undefined,
      });
    };

    window.addEventListener("megaflip-debug-log", onLog);
    window.addEventListener("megaflip-debug-log-cleared", onLog);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("megaflip-debug-log", onLog);
      window.removeEventListener("megaflip-debug-log-cleared", onLog);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  async function copyLogs() {
    await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
    toast.success("Debug logs copied");
  }

  function clearLogs() {
    clearDebugEvents();
    setEvents([]);
    toast("Debug logs cleared");
  }

  const errors = events.filter((event) => event.level === "error").length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-50 h-11 w-11 rounded-full bg-card border border-border shadow-xl grid place-items-center text-primary"
        aria-label="Open debug logs"
      >
        <Bug className="h-5 w-5" />
        {errors > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-bear text-bear-foreground text-[10px] font-bold grid place-items-center px-1">
            {errors}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-2xl max-h-[82vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div>
                <div className="text-sm font-extrabold">Debug logs</div>
                <div className="text-[10px] text-muted-foreground">{events.length} events</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={copyLogs}
                  className="h-8 w-8 rounded-lg bg-surface grid place-items-center"
                  aria-label="Copy debug logs"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={clearLogs}
                  className="h-8 w-8 rounded-lg bg-surface grid place-items-center text-bear"
                  aria-label="Clear debug logs"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="h-8 w-8 rounded-lg bg-surface grid place-items-center"
                  aria-label="Close debug logs"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-auto divide-y divide-border">
              {events.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No logs yet.</div>
              )}
              {events.map((event) => (
                <div key={event.id} className="p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={
                        "font-bold " +
                        (event.level === "error"
                          ? "text-bear"
                          : event.level === "warn"
                            ? "text-primary"
                            : "text-foreground")
                      }
                    >
                      {event.scope}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold">{event.message}</div>
                  {event.data !== undefined && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-background/70 border border-border p-2 text-[10px] leading-relaxed whitespace-pre-wrap">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function describeElement(element: Element) {
  const label = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const aria = element.getAttribute("aria-label");
  const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") : null;
  return aria || label || href || element.tagName.toLowerCase();
}
