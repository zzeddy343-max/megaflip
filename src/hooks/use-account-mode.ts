import { useState } from "react";

export function useAccountMode() {
  return useState<"real" | "demo">("real");
}
