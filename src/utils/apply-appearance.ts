import type { ThemeMode, UiFontScale } from "../inix.d";

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "dark" : "light");
    return;
  }
  root.setAttribute("data-theme", mode);
}

export function applyFontScale(scale: UiFontScale): void {
  document.documentElement.setAttribute("data-font-scale", scale);
}

export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange(media.matches);
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}
