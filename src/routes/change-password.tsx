import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/change-password")({ component: ChangePasswordPage });

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error("Use at least 8 characters, one uppercase letter, and one number");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.auth.updateUser({
        password,
        data: { ...(userData.user?.user_metadata ?? {}), must_change_password: false, password_reset_at: null },
      });
      if (error) throw error;
      toast.success("Password updated successfully");
      navigate({ to: "/binary" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-8">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div>
          <h1 className="text-xl font-extrabold">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your password was reset by an administrator. Choose a private password before continuing.</p>
        </div>
        <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="auth-input" />
        <input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Confirm new password" className="auth-input" />
        <p className="text-xs text-muted-foreground">At least 8 characters, including one uppercase letter and one number.</p>
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50">{busy ? "Updating..." : "Set new password"}</button>
      </form>
    </div>
  );
}
