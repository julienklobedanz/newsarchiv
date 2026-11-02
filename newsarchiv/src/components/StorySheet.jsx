import { useEffect, useState } from "react";
import { API } from "../config/constants.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.jsx";
import { SourceBadge, stripHtml, formatDateDE, Spinner } from "./NewsArchivUI.jsx";

export function StorySheet({ clusterId, open, onClose, onOpenArticle }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !clusterId) {
      setItems([]);
      return;
    }
    setLoading(true);
    fetch(`${API}/stories/${clusterId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, clusterId]);

  const headline = items[0]?.title || "Story";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{headline}</SheetTitle>
          <SheetDescription>
            {items.length > 0
              ? `${items.length} Berichte aus verschiedenen Quellen`
              : "Lade Story …"}
          </SheetDescription>
        </SheetHeader>
        {loading ? (
          <Spinner label="Story wird geladen …" />
        ) : (
          <ul className="flex flex-col gap-3 overflow-y-auto pb-4">
            {items.map((article) => (
              <li key={article.url_id}>
                <button
                  type="button"
                  onClick={() => onOpenArticle(article.url_id)}
                  className="flex w-full flex-col gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-muted)]/40 p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge sourceId={article.source} size="sm" variant="plain" />
                    <span className="text-[11px] text-[color:var(--text-subtle)]">
                      {formatDateDE(article.date)}
                    </span>
                  </div>
                  <span className="text-[14px] font-bold leading-snug">{article.title}</span>
                  <p className="line-clamp-3 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                    {stripHtml(article.body)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
