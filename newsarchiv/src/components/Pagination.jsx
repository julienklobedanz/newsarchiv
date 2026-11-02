import { PAGE_SIZE } from "../config/constants.js";
import { Button } from "./ui/button.jsx";

export function Pagination({ page, totalPages, total, onPage }) {
  if (totalPages <= 1) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
      <Button variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>
        ← Zurück
      </Button>
      <span className="text-sm text-[color:var(--text-muted)]">
        Seite <strong className="text-[color:var(--text)]">{page + 1}</strong> von{" "}
        <strong className="text-[color:var(--text)]">{totalPages}</strong>
        <span className="text-[color:var(--text-subtle)]">
          {" "}
          · {from}–{to} von {total.toLocaleString("de-DE")}
        </span>
      </span>
      <Button variant="outline" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>
        Weiter →
      </Button>
    </div>
  );
}
