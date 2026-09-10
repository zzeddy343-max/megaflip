import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AdminCurrency = "USD" | "KES";

const AdminCurrencyContext = createContext<{
  currency: AdminCurrency;
  setCurrency: (currency: AdminCurrency) => void;
}>({ currency: "USD", setCurrency: () => undefined });

export function AdminCurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<AdminCurrency>("USD");
  const value = useMemo(() => ({ currency, setCurrency }), [currency]);
  return <AdminCurrencyContext.Provider value={value}>{children}</AdminCurrencyContext.Provider>;
}

export function useAdminCurrency() {
  return useContext(AdminCurrencyContext);
}

export function formatAdminMoney(valueUsd: unknown, currency: AdminCurrency) {
  const value = Number(valueUsd ?? 0) * (currency === "KES" ? 130 : 1);
  return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
