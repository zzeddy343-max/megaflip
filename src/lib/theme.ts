// Tiny theme manager: toggles `.dark` / `.light` on <html>.
export type Theme = "dark" | "light";
const KEY = "megaflip-theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(t);
  window.localStorage.setItem(KEY, t);
}
