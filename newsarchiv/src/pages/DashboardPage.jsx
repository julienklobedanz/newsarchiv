import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API, PAGE_SIZE } from "../config/constants.js";
import { SourceList, CategoryList } from "../components/SourceCategoryNav.jsx";
import { Pagination } from "../components/Pagination.jsx";
import { DashboardToolbar } from "../components/DashboardToolbar.jsx";
import { ArticleTile, ArticleCardSkeleton } from "../components/NewsArchivUI.jsx";
import { StoryStackCard } from "../components/StoryStackCard.jsx";
import { StorySheet } from "../components/StorySheet.jsx";
import { useBookmarks } from "../context/BookmarkContext.jsx";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { revision, bumpBookmarks } = useBookmarks();

  const view = searchParams.get("view") === "stories" ? "stories" : "articles";
  const [activeSource, setActiveSource] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("newest");
  const [days, setDays] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ count: 0, last_import: null, by_source: {}, by_category: {} });
  const [openClusterId, setOpenClusterId] = useState(null);

  useEffect(() => {
    fetch(`${API}/stats`).then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(0);
  }, [activeSource, activeCategory, sort, days, view]);

  const setView = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === "stories") params.set("view", "stories");
    else params.delete("view");
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    setLoading(true);
    const endpoint = view === "stories" ? `${API}/stories` : `${API}/articles`;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      skip: String(page * PAGE_SIZE),
      sort,
    });
    if (activeSource) params.set("source", activeSource);
    if (activeCategory) params.set("category", activeCategory);
    if (days) params.set("days", days);

    fetch(`${endpoint}?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [activeSource, activeCategory, page, sort, days, view, revision]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-[1240px] gap-6 px-4 py-5 sm:px-6">
      <aside className="na-sidebar sticky top-[4.5rem] hidden w-[240px] shrink-0 self-start p-4 md:block">
        <h2 className="na-sidebar-heading">Zeitungen</h2>
        <SourceList activeSource={activeSource} onPick={setActiveSource} sourceCounts={stats.by_source} />
        <CategoryList activeCategory={activeCategory} onPick={setActiveCategory} categoryCounts={stats.by_category} />
      </aside>
      <main className="min-w-0 flex-1">
        <DashboardToolbar
          stats={stats}
          days={days}
          onDaysChange={setDays}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
        />
        <div className="mb-4 md:hidden">
          <SourceList activeSource={activeSource} onPick={setActiveSource} horizontal sourceCounts={stats.by_source} />
        </div>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => <ArticleCardSkeleton key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-[color:var(--text-muted)]">
            {view === "stories" ? "Keine Stories mit mehreren Quellen für diese Filter." : "Keine Artikel für diese Filter."}
          </p>
        ) : (
          <div className="na-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((item, i) =>
              view === "stories" ? (
                <StoryStackCard
                  key={item.story_cluster_id}
                  story={item}
                  staggerIndex={i}
                  onOpen={setOpenClusterId}
                  onBookmarkChange={bumpBookmarks}
                />
              ) : (
                <ArticleTile
                  key={item.url_id}
                  article={item}
                  staggerIndex={i}
                  onOpen={(id) => navigate(`/artikel/${id}`)}
                  onBookmarkChange={bumpBookmarks}
                />
              )
            )}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </main>
      <StorySheet
        clusterId={openClusterId}
        open={Boolean(openClusterId)}
        onClose={() => setOpenClusterId(null)}
        onOpenArticle={(id) => {
          setOpenClusterId(null);
          navigate(`/artikel/${id}`);
        }}
      />
    </div>
  );
}
