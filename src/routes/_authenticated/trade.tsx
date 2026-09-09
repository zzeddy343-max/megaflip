import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/trade")({
  beforeLoad: () => {
    throw redirect({ to: "/binary" });
  },
});
