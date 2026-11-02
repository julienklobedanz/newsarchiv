const THEME_KEY = "na_theme";

export function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* ignore */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch { /* ignore */ }
}

export function toggleTheme() {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(next);
  return next;
}
