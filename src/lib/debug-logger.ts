export type DebugLevel = "info" | "warn" | "error";

export interface DebugEvent {
  id: string;
  level: DebugLevel;
  scope: string;
  message: string;
  data?: unknown;
  createdAt: string;
  path?: string;
}

const STORAGE_KEY = "megaflip.debug.events";
const ENABLED_KEY = "megaflip.debug.enabled";
const MAX_EVENTS = 250;
const REDACT_KEYS = ["password", "passkey", "token", "authorization", "credential", "secret"];

export function logDebugEvent(level: DebugLevel, scope: string, message: string, data?: unknown) {
  const event: DebugEvent = {
    id: makeId(),
    level,
    scope,
    message,
    data: sanitizeDebugData(data),
    createdAt: new Date().toISOString(),
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
  };

  if (typeof window !== "undefined" && !isDebugLoggingEnabled()) return event;

  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  console[method](`[debug:${event.scope}] ${event.message}`, event);

  if (typeof window === "undefined") return event;

  const events = getDebugEvents();
  const next = [event, ...events].slice(0, MAX_EVENTS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("megaflip-debug-log", { detail: event }));
  return event;
}

export function getDebugEvents(): DebugEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DebugEvent[]) : [];
  } catch {
    return [];
  }
}

export function clearDebugEvents() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("megaflip-debug-log-cleared"));
}

export function setDebugLoggingEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) window.localStorage.setItem(ENABLED_KEY, "1");
  else window.localStorage.removeItem(ENABLED_KEY);
}

function isDebugLoggingEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ENABLED_KEY) === "1";
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: sanitizeDebugData((error as Error & { cause?: unknown }).cause),
    };
  }
  if (typeof error === "object" && error !== null) return sanitizeDebugData(error);
  return { message: String(error) };
}

export function getErrorMessage(error: unknown, fallback = "Request failed") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function sanitizeDebugData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeDebugData);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const lower = key.toLowerCase();
      if (REDACT_KEYS.some((part) => lower.includes(part))) return [key, "[redacted]"];
      if (lower.includes("phone")) return [key, redactPhone(item)];
      return [key, sanitizeDebugData(item)];
    }),
  );
}

function redactPhone(value: unknown) {
  const text = String(value ?? "");
  if (text.length < 5) return "[redacted]";
  return `${text.slice(0, 3)}***${text.slice(-2)}`;
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
