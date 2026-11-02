import { useState } from "react";
import { sources as NA_SOURCES } from "../data/articles.js";
import { proxiedImageUrl } from "../config/constants.js";

export function SourceLogoPlain({ sourceId, size = "sm" }) {
  const [failed, setFailed] = useState(false);
  const s = NA_SOURCES[sourceId] || { name: sourceId, color: "#64748B", abbr: "?" };
  const box = size === "sm" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  const abbr = s.abbr || (s.name || sourceId).slice(0, 2);

  if (s.logoUrl && !failed) {
    return (
      <img
        src={proxiedImageUrl(s.logoUrl)}
        alt=""
        title={s.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-md object-contain ${box}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md bg-[color:var(--bg-muted)] font-extrabold leading-none ${box}`}
      style={{ color: s.color }}
      title={s.name}
      aria-hidden
    >
      {abbr}
    </span>
  );
}
