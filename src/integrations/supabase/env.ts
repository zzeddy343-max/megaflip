const FALLBACK_SUPABASE_URL = "https://lopagdylpmrqhjfeskyj.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cmX8pET2UN-4JQJft4nc4Q_KIoJvmei";

function getProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
}

export function getSupabaseUrl() {
  return (
    import.meta.env.VITE_SUPABASE_URL ||
    getProcessEnv("SUPABASE_URL") ||
    getProcessEnv("VITE_SUPABASE_URL") ||
    FALLBACK_SUPABASE_URL
  );
}

export function getSupabasePublishableKey() {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    getProcessEnv("SUPABASE_PUBLISHABLE_KEY") ||
    getProcessEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY
  );
}
