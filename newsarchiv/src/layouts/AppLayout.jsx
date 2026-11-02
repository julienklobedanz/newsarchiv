import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { Button } from "../components/ui/button.jsx";
import { TooltipProvider } from "../components/ui/tooltip.jsx";
import { pushSearchHistory, getSearchHistory } from "../utils/localStore.js";
import { SEARCH_SUGGESTIONS } from "../config/constants.js";
import { getInitialTheme, applyTheme, toggleTheme } from "../utils/theme.js";

function NavItem({ to, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
        (isActive
          ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
          : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]")
      }
    >
      {children}
    </NavLink>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSearch = location.pathname === "/suche";
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("q") || "");
  const [dark, setDark] = useState(() => getInitialTheme() === "dark");

  useEffect(() => {
    applyTheme(dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (isSearch) {
      const q = new URLSearchParams(location.search).get("q") || "";
      setQuery(q);
    }
  }, [location.search, isSearch]);

  const submitSearch = (term) => {
    const q = (term ?? query).trim();
    if (!q) return;
    pushSearchHistory(q);
    const params = new URLSearchParams(location.search);
    params.set("q", q);
    navigate(`/suche?${params.toString()}`);
  };

  const suggestions = [...new Set([...getSearchHistory(), ...SEARCH_SUGGESTIONS])].slice(0, 8);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]">
        <header className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-[color:var(--surface)]/95 backdrop-blur">
          <div className="mx-auto max-w-[1240px] px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <Link to="/" className="flex shrink-0 items-baseline gap-0.5" aria-label="Zur Übersicht">
                <span className="text-xl font-black tracking-tight">News</span>
                <span className="text-xl font-black tracking-tight text-[color:var(--accent)]">Archiv</span>
              </Link>
              <nav className="hidden items-center gap-1 sm:flex">
                <NavItem to="/" end>Übersicht</NavItem>
                <NavItem to="/insights">Insights</NavItem>
                <NavItem to="/lesezeichen">Lesezeichen</NavItem>
              </nav>
              <form
                className="flex min-w-0 flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSearch();
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-subtle)]">⌕</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={isSearch ? "Neuen Begriff suchen …" : "Archiv durchsuchen …"}
                    className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-muted)] py-2 pl-8 pr-3 text-sm outline-none transition-colors focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)]"
                  />
                </div>
                <Button type="submit" className="shrink-0">Suchen</Button>
              </form>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Theme wechseln"
                onClick={() => setDark(toggleTheme() === "dark")}
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
            {!isSearch && suggestions.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-subtle)]">Vorschläge:</span>
                {suggestions.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => submitSearch(term)}
                    className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-0.5 text-xs font-medium text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </header>
        <main className="na-fade">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
