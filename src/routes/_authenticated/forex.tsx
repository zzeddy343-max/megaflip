import { createFileRoute } from "@tanstack/react-router";
import { ForexPanel } from "@/components/modules/ForexPanel";

export const Route = createFileRoute("/_authenticated/forex")({
  component: () => <ForexPanel />,
});
