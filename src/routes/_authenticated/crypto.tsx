import { createFileRoute } from "@tanstack/react-router";
import { CryptoPanel } from "@/components/modules/CryptoPanel";

export const Route = createFileRoute("/_authenticated/crypto")({
  head: () => ({ meta: [{ title: "Crypto — MEGAFLIP" }] }),
  component: () => <CryptoPanel />,
});
