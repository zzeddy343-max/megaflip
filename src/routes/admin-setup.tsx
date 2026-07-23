import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ShieldPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LOGO_URL } from "@/lib/brand";
import { createAdminWithSetupPassword, verifyAdminSetupPassword } from "@/lib/auth.functions";

export const Route = createFileRoute("/admin-setup")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin setup - MEGAFLIP" }] }),
  component: AdminSetupPage,
});

function AdminSetupPage() {
  const createAdmin = useServerFn(createAdminWithSetupPassword);
  const verifyPassword = useServerFn(verifyAdminSetupPassword);
  const [unlocked, setUnlocked] = useState(false);
  const [setupPassword, setSetupPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyPassword({ data: { setupPassword } });
      setUnlocked(true);
      toast.success("Admin setup unlocked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Incorrect password");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Admin password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const result = await createAdmin({ data: { setupPassword, fullName, email, password } });
      toast.success(
        result.promotedExisting ? "Existing user promoted to admin" : "Admin account created",
      );
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Admin setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src={LOGO_URL} alt="MEGAFLIP" className="mx-auto mb-2 h-14 w-14 object-contain" />
          <div className="text-xl font-extrabold tracking-wider">MEGAFLIP</div>
          <p className="mt-1 text-xs text-muted-foreground">Protected admin registration</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <ShieldPlus className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold">{unlocked ? "Create admin" : "Unlock setup"}</h1>
              <p className="text-xs text-muted-foreground">
                {unlocked
                  ? "Register a new admin account."
                  : "Enter the setup password to continue."}
              </p>
            </div>
          </div>

          {!unlocked ? (
            <form onSubmit={unlock} className="space-y-3">
              <Field label="Setup password">
                <input
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  className="setup-input"
                  autoFocus
                />
              </Field>
              <button
                disabled={busy}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground glow-primary disabled:opacity-50"
              >
                {busy ? "Checking..." : "Unlock"}
              </button>
            </form>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Field label="Full name">
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="setup-input"
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </Field>
              <Field label="Email">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="setup-input"
                  required
                  type="email"
                  autoComplete="email"
                />
              </Field>
              <Field label="Admin password">
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="setup-input pr-10"
                    required
                    minLength={8}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password">
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="setup-input"
                  required
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
              <button
                disabled={busy}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground glow-primary disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create admin"}
              </button>
            </form>
          )}

          <Link
            to="/auth"
            className="mt-4 block text-center text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </div>

      <style>{`
        .setup-input { width: 100%; padding: 0.65rem 0.9rem; border-radius: 0.7rem; background: var(--color-surface); border: 1px solid var(--color-border); outline: none; font-size: 0.875rem; }
        .setup-input:focus { border-color: var(--color-primary); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
