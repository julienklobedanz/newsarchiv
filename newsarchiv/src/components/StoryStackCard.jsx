import { ArticleImage,
  BookmarkButton,
  CategoryBadgeList,
  formatDateDE,
  stripHtml,
} from "./NewsArchivUI.jsx";
import { Badge } from "./ui/badge.jsx";
import { SourceLogoPlain } from "./SourceLogoPlain.jsx";

function articleTeaser(article) {
  return stripHtml(article.teaser ?? article.body ?? "");
}

export function StoryStackCard({ story, onOpen, onBookmarkChange, staggerIndex }) {
  const clusterSize = story.cluster_size || 1;
  const sources = story.sources?.length ? story.sources : [story.source];
  const visibleSources = sources.slice(0, 4);
  const extra = sources.length - visibleSources.length;
  const style = staggerIndex != null ? { animationDelay: `${staggerIndex * 40}ms` } : undefined;

  return (
    <button
      type="button"
      onClick={() => onOpen(story.story_cluster_id)}
      style={style}
      className="group relative w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
    >
      {clusterSize >= 2 ? (
        <>
          <div
            aria-hidden
            className="absolute inset-x-3 top-3 h-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] opacity-40 shadow-sm"
            style={{ transform: "translate(6px, 6px) scale(0.97)" }}
          />
          <div
            aria-hidden
            className="absolute inset-x-1.5 top-1.5 h-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] opacity-70 shadow-sm"
            style={{ transform: "translate(3px, 3px) scale(0.985)" }}
          />
        </>
      ) : null}
      <div className="relative flex flex-col gap-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <span className="absolute right-3 top-3 z-10">
          <BookmarkButton urlId={story.url_id} size="sm" onChange={onBookmarkChange} />
        </span>
        <ArticleImage article={story} />
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {visibleSources.map((sourceId) => (
              <SourceLogoPlain key={sourceId} sourceId={sourceId} />
            ))}
            {extra > 0 ? (
              <span className="text-[10px] font-semibold text-[color:var(--text-muted)]">+{extra}</span>
            ) : null}
          </div>
          <CategoryBadgeList article={story} size="sm" max={2} />
          <Badge variant="story" className="whitespace-nowrap">
            {clusterSize} Quellen
          </Badge>
          <span className="text-xs text-[color:var(--text-subtle)]">{formatDateDE(story.date)}</span>
        </div>
        <h3 className="text-[15px] font-bold leading-snug transition-colors group-hover:text-[color:var(--accent)]">
          {story.title}
        </h3>
        <p className="text-[13px] leading-relaxed text-[color:var(--text-muted)]">{articleTeaser(story)}</p>
      </div>
    </button>
  );
}
