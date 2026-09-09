import { createFileRoute } from "@tanstack/react-router";
import { BinaryPanel } from "@/components/modules/BinaryPanel";

export const Route = createFileRoute("/_authenticated/binary")({
  component: () => <BinaryPanel />,
});
