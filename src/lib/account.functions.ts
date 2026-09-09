import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export const setActiveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.enum(["real", "demo"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as RpcClient).rpc("set_active_account", {
      _account: data.account,
    });
    if (error) {
      console.error("[Account] set_active_account RPC failed", { account: data.account, error });
      const direct = await context.supabase
        .from("profiles")
        .update({ active_account: data.account } as Record<string, unknown>)
        .eq("id", context.userId);

      if (direct.error) {
        console.error("[Account] direct profile update failed", {
          account: data.account,
          error: direct.error,
        });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = await supabaseAdmin
          .from("profiles")
          .update({ active_account: data.account } as Record<string, unknown>)
          .eq("id", context.userId);
        if (admin.error) {
          console.error("[Account] admin profile update failed", {
            account: data.account,
            error: admin.error,
          });
          throw new Error(`Failed to switch account: ${admin.error.message}`);
        }
      }
    }
    return { ok: true, account: data.account };
  });

export const resetDemoBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase as unknown as RpcClient).rpc("reset_demo_account");
    if (error) throw error;
    return { ok: true };
  });
