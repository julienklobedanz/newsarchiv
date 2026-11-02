import { useState } from "react";
import { sources as NA_SRC, categories as NA_CATEGORIES } from "../data/articles.js";
import { proxiedImageUrl } from "../config/constants.js";

function SourceNavLogo({ source }) {
  const [failed, setFailed] = useState(false);
  const logoSrc = source.logoUrl?.startsWith("/") ? source.logoUrl : proxiedImageUrl(source.logoUrl);
  if (source.logoUrl && !failed) {
    return (
      <img
        src={logoSrc}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-5 w-5 shrink-0 rounded-md object-contain"
      />
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold leading-none"
      style={{ backgroundColor: source.color, color: source.text }}
      aria-hidden
    >
      {source.abbr || source.name.slice(0, 2)}
    </span>
  );
}

function sidebarItemClass(active) {
  return (
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors " +
    (active
      ? "bg-[color:var(--sidebar-active)] font-medium text-[color:var(--accent)]"
      : "text-[color:var(--text-muted)] hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--text)]")
  );
}

function sidebarCountClass(active) {
  return (
    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums " +
    (active
      ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
      : "bg-[color:var(--bg-muted)] text-[color:var(--text-subtle)]")
  );
}

export function SourceList({ activeSource, onPick, horizontal, sourceCounts = {} }) {
  const items = Object.values(NA_SRC).map((s) => ({ ...s, count: sourceCounts[s.id] ?? 0 }));
  return (
    <nav className={horizontal ? "flex gap-2 overflow-x-auto pb-1" : "flex flex-col gap-0.5"}>
      {items.map((s) => {
        const active = activeSource === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(active ? null : s.id)}
            className={
              horizontal
                ? "flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                  (active
                    ? "border-[color:var(--accent)]/30 bg-[color:var(--surface)] text-[color:var(--text)] shadow-sm"
                    : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)] hover:border-[color:var(--border)] hover:bg-[color:var(--bg-muted)]")
                : sidebarItemClass(active)
            }
          >
            <SourceNavLogo source={s} />
            <span className={horizontal ? "font-medium" : ""}>{s.name}</span>
            <span
              className={
                horizontal
                  ? "ml-auto rounded-full bg-[color:var(--bg-muted)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[color:var(--text-muted)]"
                  : sidebarCountClass(active)
              }
              style={active && !horizontal ? { backgroundColor: `${s.color}22`, color: s.color } : null}
            >
              {s.count.toLocaleString("de-DE")}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function CategoryList({ activeCategory, onPick, categoryCounts = {} }) {
  const items = Object.values(NA_CATEGORIES)
    .map((c) => ({ ...c, count: categoryCounts[c.id] ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  if (items.length === 0) return null;
  return (
    <nav className="mt-5 flex flex-col gap-0.5 border-t border-[color:var(--sidebar-border)] pt-5">
      <h2 className="na-sidebar-heading">Themen</h2>
      {items.map((c) => {
        const active = activeCategory === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(active ? null : c.id)}
            className={sidebarItemClass(active)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-[color:var(--sidebar)]"
              style={{ backgroundColor: c.color }}
            />
            <span>{c.name}</span>
            <span className={sidebarCountClass(active)}>{c.count.toLocaleString("de-DE")}</span>
          </button>
        );
      })}
    </nav>
  );
}
