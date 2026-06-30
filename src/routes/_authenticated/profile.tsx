import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/trades.functions";
import { changePassword, updateProfile } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { User, KeyRound, ShieldCheck, Eye, EyeOff, Lock, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { RouteError, RouteNotFound } from "@/components/RouteError";
import { AccountsReportPanel } from "@/components/AccountsReportPanel";
import { SupportPanel } from "@/components/SupportPanel";

type ProfileWithPhone = {
  full_name?: string | null;
  username?: string | null;
  phone?: string | null;
};

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — TRONIXOPTION" }] }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const save = useServerFn(updateProfile);
  const setPwd = useServerFn(changePassword);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const [kycStatus, setKycStatus] = useState<"unverified" | "pending" | "verified">("unverified");
  const [isAgent, setIsAgent] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setUsername(profile.username ?? "");
      const phoneValue = (profile as ProfileWithPhone).phone;
      setPhone(typeof phoneValue === "string" ? phoneValue : "");
    }
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const roles = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (!cancelled) setIsAgent(!!roles.data?.some((row) => row.role === "agent"));
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  async function saveProfile() {
    if (fullName.trim().length < 2) {
      toast.error("Full name too short");
      return;
    }
    if (!isValidKenyanPhone(phone)) {
      toast.error("Enter a valid Safaricom number");
      return;
    }
    setSavingProfile(true);
    try {
      await save({
        data: { full_name: fullName.trim(), username: username.trim() || undefined, phone },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (pwd1.length < 8) {
      toast.error("Min 8 characters");
      return;
    }
    if (!/[A-Z]/.test(pwd1) || !/[0-9]/.test(pwd1)) {
      toast.error("Need uppercase + number");
      return;
    }
    if (pwd1 !== pwd2) {
      toast.error("Passwords don't match");
      return;
    }
    setSavingPwd(true);
    try {
      await setPwd({ data: { new_password: pwd1 } });
      setPwd1("");
      setPwd2("");
      toast.success("Password updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingPwd(false);
    }
  }

  function submitKyc() {
    setKycStatus("pending");
    toast.success("KYC documents submitted — review takes 1–3 business days");
  }

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/15 grid place-items-center text-primary font-extrabold text-lg">
          {(fullName || email || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate">{fullName || "Unnamed"}</div>
          <div className="text-[10px] text-muted-foreground truncate">{email}</div>
        </div>
      </div>

      <Section icon={<User className="h-4 w-4" />} title="Profile details">
        <Labeled label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="profile-input"
          />
        </Labeled>
        <Labeled label="Username">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="profile-input"
          />
        </Labeled>
        <Labeled label="M-Pesa number">
          <div className="relative">
            <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678"
              className="profile-input pl-9"
            />
          </div>
        </Labeled>
        <Labeled label="Email (read only)">
          <input value={email} disabled className="profile-input opacity-60" />
        </Labeled>
        <button
          onClick={saveProfile}
          disabled={savingProfile}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm glow-primary disabled:opacity-50"
        >
          {savingProfile ? "Saving…" : "Save profile"}
        </button>
      </Section>

      <Section icon={<KeyRound className="h-4 w-4" />} title="Change password">
        <Labeled label="New password">
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
              placeholder="Min 8, 1 uppercase, 1 number"
              className="profile-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Labeled>
        <Labeled label="Confirm new password">
          <input
            type={showPwd ? "text" : "password"}
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            className="profile-input"
          />
        </Labeled>
        <button
          onClick={savePassword}
          disabled={savingPwd}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm glow-primary disabled:opacity-50"
        >
          {savingPwd ? "Updating…" : "Update password"}
        </button>
      </Section>

      <Section icon={<ShieldCheck className="h-4 w-4" />} title="Identity verification (KYC)">
        <div className="text-[11px] text-muted-foreground">
          Required to withdraw above $1,000 USD or KSh 130,000. Upload a government ID and a selfie.
        </div>
        <div
          className={
            "rounded-lg p-2 text-xs font-bold flex items-center justify-between " +
            (kycStatus === "verified"
              ? "bg-bull/15 text-bull"
              : kycStatus === "pending"
                ? "bg-primary/15 text-primary"
                : "bg-bear/10 text-bear")
          }
        >
          <span>Status</span>
          <span className="capitalize">{kycStatus}</span>
        </div>
        {kycStatus === "unverified" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled
              className="py-2 rounded-lg bg-surface border border-border text-xs font-bold flex items-center justify-center gap-1.5 opacity-60"
            >
              <Lock className="h-3 w-3" /> ID upload unavailable
            </button>
            <button
              disabled
              className="py-2 rounded-lg bg-surface border border-border text-xs font-bold flex items-center justify-center gap-1.5 opacity-60"
            >
              <Lock className="h-3 w-3" /> Selfie upload unavailable
            </button>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          KYC flow is a stub — full document upload + provider check (Smile ID / Onfido) wires up
          when going to real funds.
        </div>
      </Section>

      <Section icon={<ShieldCheck className="h-4 w-4" />} title="Support">
        <SupportPanel />
      </Section>

      {isAgent && (
        <Section icon={<ShieldCheck className="h-4 w-4" />} title="Agent accounts">
          <AccountsReportPanel scope="agent" />
        </Section>
      )}

      <style>{`
        .profile-input { width: 100%; padding: 0.55rem 0.75rem; border-radius: 0.6rem; background: var(--color-surface); border: 1px solid var(--color-border); outline: none; font-size: 0.85rem; }
        .profile-input:focus { border-color: var(--color-primary); }
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

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="text-primary">{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
