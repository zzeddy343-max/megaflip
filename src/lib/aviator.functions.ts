import { createServerFn } from "@tanstack/react-start";

export const getAviatorServerTime = createServerFn({ method: "GET" }).handler(async () => ({
  now: Date.now(),
}));
