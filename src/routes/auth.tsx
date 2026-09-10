import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { useServerFn } from "@tanstack/react-start";
import { signUpWithoutEmailVerification } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — MEGAFLIP" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const signUpNow = useServerFn(signUpWithoutEmailVerification);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/binary" });
    });
  }, [navigate]);

  function validate(): string | null {
    if (mode === "signup") {
      if (!fullName.trim() || fullName.trim().length < 2) return "Enter your full name";
      if (!isValidKenyanPhone(phone)) return "Enter a valid Safaricom number";
      if (password.length < 8) return "Password must be at least 8 characters";
      if (!/[A-Z]/.test(password) || !/[0-9]/.test(password))
        return "Use an uppercase letter and a number";
      if (password !== confirm) return "Passwords don't match";
    } else if (password.length < 6) return "Password too short";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email";
    return null;
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpNow({
          data: { email, password, fullName, phone, referralCode: referralCode || undefined },
        });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Account created. Welcome aboard.");
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        const { data: profile } = await supabase
          .from("profiles")
          .select("account_state,freeze_until")
          .eq("id", signInData.user.id)
          .maybeSingle();
        if (profile?.account_state === "closed") {
          await supabase.auth.signOut();
          throw new Error("This account has been closed by an administrator.");
        }
        if (
          profile?.account_state === "frozen" &&
          profile.freeze_until &&
          new Date(profile.freeze_until).getTime() > Date.now()
        ) {
          await supabase.auth.signOut();
          throw new Error("This account is frozen until the selected unlock date.");
        }
        if (profile?.account_state === "frozen") {
          await supabase
            .from("profiles")
            .update({ account_state: "active", freeze_until: null })
            .eq("id", signInData.user.id);
        }
      }
      navigate({ to: "/binary" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <img
              src={LOGO_URL}
              alt="MEGAFLIP"
              className="h-11 w-11 object-contain drop-shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_55%,transparent)]"
            />
            <span className="text-xl font-extrabold tracking-wider">MEGAFLIP</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Forex · Crypto · Binaries · Polymarket · Aviator
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-2xl">
          <div className="flex gap-1.5 mb-4 p-1 bg-surface rounded-xl">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "flex-1 py-2 rounded-lg text-sm font-semibold transition " +
                  (mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")
                }
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleEmail} className="space-y-2.5">
            {mode === "signup" && (
              <Field label="Full name">
                <input
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="auth-input"
                />
              </Field>
            )}
            {mode === "signup" && (
              <Field label="Safaricom number">
                <input
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0712345678"
                  className="auth-input"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="auth-input"
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={mode === "signup" ? 8 : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 8, 1 uppercase, 1 number" : "Your password"}
                  className="auth-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label="Toggle password"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {mode === "signup" && (
              <>
                <Field label="Confirm password">
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      className="auth-input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      aria-label="Toggle confirm"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Referral code (optional)">
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="e.g. AGENT123"
                    className="auth-input uppercase tracking-wider"
                    maxLength={16}
                  />
                </Field>
              </>
            )}
            <button
              disabled={busy}
              className="w-full mt-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm glow-primary disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            By continuing you agree to our terms. Trading involves risk.
          </p>
        </div>
      </div>

      <style>{`
        .auth-input { width: 100%; padding: 0.65rem 0.9rem; border-radius: 0.7rem; background: var(--color-surface); border: 1px solid var(--color-border); outline: none; font-size: 0.875rem; }
        .auth-input:focus { border-color: var(--color-primary); }
      `}</style>
    </div>
  );
}

function isValidKenyanPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return (
    (digits.startsWith("254") && digits.length === 12) ||
    (digits.startsWith("0") && digits.length === 10) ||
    digits.length === 9
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
