// NewsArchiv — wiederverwendbare UI-Bausteine
import { useState } from "react";
import { sources as NA_SOURCES, categories as NA_CATEGORIES } from "../data/articles.js";
import { articleCategories, similarityLabel, similarityVariant, sharedCategories } from "../utils/articleMeta.js";
import { proxiedImageUrl } from "../config/constants.js";
import { isBookmarked, toggleBookmark } from "../utils/localStore.js";
import { Skeleton } from "./ui/skeleton.jsx";
import { Badge } from "./ui/badge.jsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.jsx";

function stripHtml(text) {
  if (!text) return "";
  const decoded = String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n");
  const doc = new DOMParser().parseFromString(decoded, "text/html");
  return (doc.body.textContent || "")
    .replace(/\s+/g, " ")
    .replace(/ Continue reading\.\.\./gi, "")
    .trim();
}

function formatDateDE(dateStr) {
  if (!dateStr) return "–";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function SourceLogo({ source, size = "sm", plain = false }) {
  const [failed, setFailed] = useState(false);
  const box = plain
    ? (size === "sm" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]")
    : (size === "sm" ? "h-3.5 w-3.5 text-[8px]" : "h-5 w-5 text-[9px]");
  const abbr = source.abbr || (source.name || "?").slice(0, 2);

  if (source.logoUrl && !failed) {
    return (
      <img
        src={proxiedImageUrl(source.logoUrl)}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={
          "shrink-0 object-contain " + box +
          (plain ? "" : " rounded-sm bg-white p-px")
        }
      />
    );
  }

  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center font-extrabold leading-none " + box +
        (plain ? " rounded-sm bg-[color:var(--bg-muted)]" : " rounded-sm bg-white/95")
      }
      style={{ color: source.color }}
      aria-hidden
    >
      {abbr}
    </span>
  );
}

function SourceBadge({ sourceId, size, variant = "filled" }) {
  const s = NA_SOURCES[sourceId] || { name: sourceId, color: "#64748B", text: "#ffffff", id: sourceId, abbr: "?" };
  if (variant === "plain") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--text-muted)]">
        <SourceLogo source={s} size={size} plain />
        <span className="text-[color:var(--text)]">{s.name}</span>
      </span>
    );
  }
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={"inline-flex items-center gap-1.5 rounded font-semibold tracking-wide " + pad}
      style={{ backgroundColor: s.color, color: s.text }}
    >
      <SourceLogo source={s} size={size} />
      {s.name}
    </span>
  );
}

function StoryClusterBadge({ clusterSize }) {
  if (!clusterSize || clusterSize <= 1) return null;
  return (
    <Badge variant="story" className="whitespace-nowrap">
      Gleiche Story · {clusterSize} Quellen
    </Badge>
  );
}

function ArticleImage({ article, className = "" }) {
  const [failed, setFailed] = useState(false);
  const s = NA_SOURCES[article.source] || { color: "#64748B", name: "?" };
  if (!article.image_url || failed) {
    return (
      <div
        className={"flex aspect-video w-full items-center justify-center rounded-lg text-2xl font-black text-white " + className}
        style={{ backgroundColor: s.color }}
        aria-hidden
      >
        {(s.name || "?").slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={proxiedImageUrl(article.image_url)}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={"aspect-video w-full rounded-lg object-cover " + className}
    />
  );
}

function BookmarkButton({ urlId, onChange, size }) {
  const [active, setActive] = useState(() => isBookmarked(urlId));
  const iconSize = size === "sm" ? "text-base" : "text-lg";
  return (
    <button
      type="button"
      aria-label={active ? "Lesezeichen entfernen" : "Lesezeichen setzen"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const next = toggleBookmark(urlId);
        setActive(next);
        onChange?.();
      }}
      className={"shrink-0 leading-none transition-colors " + iconSize + (active ? " text-amber-500" : " text-[color:var(--text-subtle)] hover:text-amber-400")}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

function CategoryBadgeList({ article, size, max = 3 }) {
  const ids = articleCategories(article).slice(0, max);
  if (ids.length === 0) return null;
  return (
    <>
      {ids.map((id) => (
        <CategoryBadge key={id} categoryId={id} size={size} />
      ))}
    </>
  );
}

function CategoryBadge({ categoryId, size }) {
  const c = NA_CATEGORIES[categoryId] || NA_CATEGORIES.gesellschaft;
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={"inline-flex items-center rounded font-medium " + pad} style={{ backgroundColor: c.color, color: c.text }}>
      {c.name}
    </span>
  );
}

function Highlight({ text, term }) {
  if (!term) return <span>{text}</span>;
  const parts = String(text).split(new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"));
  return (
    <span>
      {parts.map((p, i) =>
        p.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="rounded px-0.5 font-semibold" style={{ backgroundColor: "var(--kw-mark-bg)", color: "var(--kw-mark-fg)" }}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-[color:var(--text-muted)]">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[color:var(--border)]" style={{ borderTopColor: "var(--accent)" }} />
      <div className="text-sm">{label}</div>
    </div>
  );
}

function ArticleCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
      <Skeleton className="aspect-video w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

function ScoreBadge({ kind, score, similarity }) {
  if (kind === "keyword") {
    return <Badge variant="keyword">Exakter Treffer</Badge>;
  }
  const meta = similarityLabel(score);
  const label = meta?.label || similarity;
  if (!label) return null;
  const variant = similarityVariant(score, similarity);
  const display = label.charAt(0).toUpperCase() + label.slice(1);
  return <Badge variant={variant}>{display}</Badge>;
}

function NoKeywordInfo({ query }) {
  const text = query
    ? `Thematisch ähnlich — enthält nicht „${query}"`
    : "Thematisch ähnlich — enthält das Suchwort nicht";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex h-[18px] w-[18px] cursor-help items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white"
          aria-label="Info"
        >
          i
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function articleId(article) {
  return article.url_id || article.id;
}

function articleTeaser(article) {
  const raw = article.teaser ?? article.body ?? "";
  return stripHtml(raw);
}

function ArticleTile({ article, onOpen, onBookmarkChange, staggerIndex }) {
  const id = articleId(article);
  const style = staggerIndex != null ? { animationDelay: `${staggerIndex * 40}ms` } : undefined;
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      style={style}
      className="group relative flex flex-col items-start gap-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
    >
      <span className="absolute right-3 top-3 z-10">
        <BookmarkButton urlId={id} size="sm" onChange={onBookmarkChange} />
      </span>
      <ArticleImage article={article} />
      <div className="flex w-full flex-wrap items-center gap-2">
        <SourceBadge sourceId={article.source} size="sm" variant="plain" />
        <CategoryBadgeList article={article} size="sm" />
        <StoryClusterBadge clusterSize={article.cluster_size} />
        <span className="text-xs text-[color:var(--text-subtle)]">{formatDateDE(article.date)}</span>
      </div>
      <h3 className="text-[15px] font-bold leading-snug transition-colors group-hover:text-[color:var(--accent)]">{article.title}</h3>
      <p className="text-[13px] leading-relaxed text-[color:var(--text-muted)]">{articleTeaser(article)}</p>
    </button>
  );
}

function ResultCard({ article, term, kind, score, noKeyword, query, onOpen, onBookmarkChange }) {
  const id = articleId(article);
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className={
        "flex w-full flex-col gap-2 rounded-lg border bg-[color:var(--surface)] p-4 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none " +
        (noKeyword ? "border-violet-300 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-950/20" : "border-[color:var(--border)]")
      }
    >
      <ArticleImage article={article} className="!aspect-[2/1]" />
      <div className="flex w-full flex-wrap items-center gap-2">
        <SourceBadge sourceId={article.source} size="sm" variant="plain" />
        <CategoryBadgeList article={article} size="sm" />
        <StoryClusterBadge clusterSize={article.cluster_size} />
        <span className="text-[11px] text-[color:var(--text-subtle)]">{formatDateDE(article.date)}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          {noKeyword ? <NoKeywordInfo query={query || term} /> : null}
          {score != null || article.similarity ? <ScoreBadge kind={kind} score={score} similarity={article.similarity} /> : null}
          <BookmarkButton urlId={id} size="sm" onChange={onBookmarkChange} />
        </span>
      </div>
      <h4 className="text-[14.5px] font-bold leading-snug">
        {kind === "keyword" ? <Highlight text={article.title} term={term} /> : article.title}
      </h4>
      <p className="text-[12.5px] leading-relaxed text-[color:var(--text-muted)]">
        {kind === "keyword" ? <Highlight text={articleTeaser(article)} term={term} /> : articleTeaser(article)}
      </p>
      {noKeyword ? (
        <p className="text-[11.5px] font-medium text-violet-700 dark:text-violet-300">Enthält das Suchwort nicht — thematisch gefunden</p>
      ) : null}
    </button>
  );
}

function StorySiblingCard({ article, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article.url_id)}
      className="flex flex-col gap-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-left shadow-sm transition-shadow hover:border-[color:var(--accent)]/40 hover:shadow-md"
    >
      <ArticleImage article={article} className="!aspect-[2/1]" />
      <div className="flex w-full flex-wrap items-center gap-2">
        <SourceBadge sourceId={article.source} size="sm" variant="plain" />
        <CategoryBadgeList article={article} size="sm" max={2} />
        <span className="text-[11px] text-[color:var(--text-subtle)]">{formatDateDE(article.date)}</span>
      </div>
      <span className="text-[13.5px] font-bold leading-snug">{article.title}</span>
      <p className="line-clamp-2 text-[12px] leading-relaxed text-[color:var(--text-muted)]">{articleTeaser(article)}</p>
    </button>
  );
}

function RelatedCard({ hit, baseArticle, onOpen }) {
  const overlap = sharedCategories(baseArticle, hit);
  return (
    <button
      type="button"
      onClick={() => onOpen(hit.url_id)}
      className="flex flex-col gap-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <ArticleImage article={hit} />
      <div className="flex w-full flex-wrap items-center gap-2">
        <SourceBadge sourceId={hit.source} size="sm" variant="plain" />
        <CategoryBadgeList article={hit} size="sm" max={2} />
        <span className="ml-auto">
          <ScoreBadge kind="semantic" score={hit.score} similarity={hit.similarity} />
        </span>
      </div>
      <span className="text-[13.5px] font-bold leading-snug">{hit.title}</span>
      {overlap.length > 0 ? (
        <p className="text-[11px] text-[color:var(--text-muted)]">
          Gemeinsame Themen: {overlap.map((id) => NA_CATEGORIES[id]?.name || id).join(", ")}
        </p>
      ) : null}
    </button>
  );
}

export {
  SourceBadge,
  CategoryBadge,
  CategoryBadgeList,
  BookmarkButton,
  Highlight,
  Spinner,
  ScoreBadge,
  NoKeywordInfo,
  ArticleTile,
  ResultCard,
  RelatedCard,
  StorySiblingCard,
  ArticleImage,
  ArticleCardSkeleton,
  StoryClusterBadge,
  stripHtml,
  formatDateDE,
};
