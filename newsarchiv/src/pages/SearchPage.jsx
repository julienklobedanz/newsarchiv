import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { sources as NA_SRC, categories as NA_CATEGORIES } from "../data/articles.js";
import { API, SEARCH_PAGE_SIZE, DAYS_OPTIONS, searchBody } from "../config/constants.js";
import { getSearchHistory } from "../utils/localStore.js";
import { mapSemanticResults, mergeHybridResults } from "../utils/searchMerge.js";
import { FilterSelect } from "../components/FilterSelect.jsx";
import { ResultCard, ArticleCardSkeleton } from "../components/NewsArchivUI.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.jsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.jsx";
import { Button } from "../components/ui/button.jsx";
import { useBookmarks } from "../context/BookmarkContext.jsx";

function SearchColumnHeader({ color, title, subtitle, count, tooltip }) {
  return (
    <header className="mb-3 flex items-center gap-2">
      <span className={"h-2.5 w-2.5 rounded-full " + color} />
      <Tooltip>
        <TooltipTrigger asChild>
          <h2 className="cursor-help text-sm font-bold uppercase tracking-wide text-[color:var(--text)]">
            {title} <span className="font-mono text-[11px] font-normal normal-case text-[color:var(--text-subtle)]">({subtitle})</span>
          </h2>
        </TooltipTrigger>
        {tooltip ? <TooltipContent>{tooltip}</TooltipContent> : null}
      </Tooltip>
      <span className={"ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold " + (color === "bg-blue-500" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300")}>
        {count} Treffer
      </span>
    </header>
  );
}

function ResultList({ items, query, mode, onOpen, onBookmarkChange, emptyLabel }) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-[color:var(--text-muted)]">{emptyLabel}</p>;
  }
  return items.map((item) => {
    const article = item.article || item;
    const kind = item.kind === "keyword" || item.kind === "both" ? (item.inBoth ? "semantic" : "keyword") : "semantic";
    return (
      <ResultCard
        key={article.url_id}
        article={article}
        term={query}
        kind={kind}
        score={item.score}
        noKeyword={item.noKeyword}
        query={query}
        onOpen={onOpen}
        onBookmarkChange={onBookmarkChange}
      />
    );
  });
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bumpBookmarks } = useBookmarks();
  const query = searchParams.get("q") || "";
  const filterSource = searchParams.get("source") || "";
  const filterCategory = searchParams.get("category") || "";
  const filterDays = searchParams.get("days") || "";
  const filters = useMemo(
    () => ({ source: filterSource, category: filterCategory, days: filterDays }),
    [filterSource, filterCategory, filterDays]
  );

  const [tab, setTab] = useState("keyword");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState({ kw: false, sem: false, hybrid: false });
  const [keyword, setKeyword] = useState([]);
  const [semantic, setSemantic] = useState([]);
  const [hasMore, setHasMore] = useState({ kw: true, sem: true });
  const [history] = useState(getSearchHistory);

  const updateFilters = (next) => {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    setSearchParams(params);
  };

  const fetchKeyword = async (offset) => {
    const res = await fetch(`${API}/search/keyword`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody(query, filters, offset)),
    });
    return res.json();
  };

  const fetchSemanticRaw = async (offset) => {
    const res = await fetch(`${API}/search/semantic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody(query, filters, offset)),
    });
    return res.json();
  };

  useEffect(() => {
    const t = query?.trim();
    if (!t) {
      setKeyword([]);
      setSemantic([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setKeyword([]);
    setSemantic([]);
    setHasMore({ kw: true, sem: true });
    let cancelled = false;

    const body = searchBody(t, filters, 0);

    Promise.all([
      fetch(`${API}/search/keyword`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
      fetch(`${API}/search/semantic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    ])
      .then(([kw, sem]) => {
        if (cancelled) return;
        setKeyword(kw);
        setSemantic(mapSemanticResults(sem, kw));
        setHasMore({ kw: kw.length >= SEARCH_PAGE_SIZE, sem: sem.length >= SEARCH_PAGE_SIZE });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [query, filterSource, filterCategory, filterDays]);

  const loadMore = async (kind) => {
    setLoadingMore((s) => ({ ...s, [kind]: true }));
    try {
      if (kind === "kw") {
        const more = await fetchKeyword(keyword.length);
        setKeyword((prev) => [...prev, ...more]);
        if (more.length < SEARCH_PAGE_SIZE) setHasMore((h) => ({ ...h, kw: false }));
      } else {
        const moreRaw = await fetchSemanticRaw(semantic.length);
        const more = mapSemanticResults(moreRaw, keyword);
        setSemantic((prev) => [...prev, ...more]);
        if (moreRaw.length < SEARCH_PAGE_SIZE) setHasMore((h) => ({ ...h, sem: false }));
      }
    } finally {
      setLoadingMore((s) => ({ ...s, [kind]: false }));
    }
  };

  const sourceOptions = [{ id: "", label: "Alle Quellen" }, ...Object.values(NA_SRC).map((s) => ({ id: s.id, label: s.name }))];
  const categoryOptions = [{ id: "", label: "Alle Themen" }, ...Object.values(NA_CATEGORIES).map((c) => ({ id: c.id, label: c.name }))];
  const hybrid = mergeHybridResults(keyword, semantic, query);
  const openArticle = (id) => navigate(`/artikel/${id}`, { state: { from: "search", search: searchParams.toString() } });

  if (!query?.trim()) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-12 text-center sm:px-6">
        <p className="text-[color:var(--text-muted)]">Gib einen Suchbegriff in der Kopfzeile ein.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Ergebnisse für „{query}"</h1>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">Keyword (MongoDB), Semantik (Milvus) oder kombiniert</p>
        {history.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-subtle)]">Zuletzt:</span>
            {history.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set("q", term);
                  setSearchParams(params);
                }}
                className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-medium text-[color:var(--text-muted)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
              >
                {term}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 shadow-sm">
        <FilterSelect label="Quelle" value={filters.source} onChange={(v) => updateFilters({ ...filters, source: v })} options={sourceOptions} />
        <FilterSelect label="Thema" value={filters.category} onChange={(v) => updateFilters({ ...filters, category: v })} options={categoryOptions} />
        <FilterSelect label="Zeitraum" value={filters.days} onChange={(v) => updateFilters({ ...filters, days: v })} options={DAYS_OPTIONS} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <ArticleCardSkeleton key={i} />)}
        </div>
      ) : (
        <>
          <div className="md:hidden">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-4 w-full justify-start">
                <TabsTrigger value="keyword">Keyword</TabsTrigger>
                <TabsTrigger value="semantic">Semantik</TabsTrigger>
                <TabsTrigger value="hybrid">Kombiniert</TabsTrigger>
              </TabsList>
              <TabsContent value="keyword">
                <SearchColumnHeader color="bg-blue-500" title="Keyword" subtitle="MongoDB" count={keyword.length} tooltip="Exakter Wortlaut in Titel oder Teaser." />
                <div className="flex flex-col gap-3">
                  <ResultList items={keyword.map((a) => ({ article: a, kind: "keyword" }))} query={query} onOpen={openArticle} onBookmarkChange={bumpBookmarks} emptyLabel={`Keine exakten Treffer für „${query}".`} />
                  {hasMore.kw ? <Button variant="outline" disabled={loadingMore.kw} onClick={() => loadMore("kw")}>{loadingMore.kw ? "Lädt …" : "Weitere 7"}</Button> : null}
                </div>
              </TabsContent>
              <TabsContent value="semantic">
                <SearchColumnHeader color="bg-violet-500" title="Semantik" subtitle="Milvus" count={semantic.length} tooltip="Thematisch ähnlich, auch ohne exaktes Suchwort." />
                <div className="flex flex-col gap-3">
                  <ResultList items={semantic} query={query} onOpen={openArticle} onBookmarkChange={bumpBookmarks} emptyLabel={`Keine semantischen Treffer für „${query}".`} />
                  {hasMore.sem ? <Button variant="outline" disabled={loadingMore.sem} onClick={() => loadMore("sem")}>{loadingMore.sem ? "Lädt …" : "Weitere 7"}</Button> : null}
                </div>
              </TabsContent>
              <TabsContent value="hybrid">
                <p className="mb-3 text-sm text-[color:var(--text-muted)]">Treffer aus beiden Welten, dedupliziert.</p>
                <div className="flex flex-col gap-3">
                  <ResultList items={hybrid} query={query} onOpen={openArticle} onBookmarkChange={bumpBookmarks} emptyLabel="Keine kombinierten Treffer." />
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div className="hidden gap-5 md:grid md:grid-cols-2">
            <section>
              <SearchColumnHeader color="bg-blue-500" title="Keyword-Suche" subtitle="MongoDB $text" count={keyword.length} tooltip="Exakter Wortlaut." />
              <div className="flex flex-col gap-3">
                {keyword.map((a) => <ResultCard key={a.url_id} article={a} term={query} kind="keyword" onOpen={openArticle} onBookmarkChange={bumpBookmarks} />)}
                {hasMore.kw ? <Button variant="outline" disabled={loadingMore.kw} onClick={() => loadMore("kw")}>{loadingMore.kw ? "Lädt …" : "Weitere 7 Treffer"}</Button> : null}
              </div>
            </section>
            <section>
              <SearchColumnHeader color="bg-violet-500" title="Semantische Suche" subtitle="Milvus" count={semantic.length} tooltip="Bedeutungsähnlichkeit." />
              <div className="flex flex-col gap-3">
                {semantic.map((h) => <ResultCard key={h.article.url_id} article={h.article} kind="semantic" score={h.score} noKeyword={h.noKeyword} query={query} onOpen={openArticle} onBookmarkChange={bumpBookmarks} />)}
                {hasMore.sem ? <Button variant="outline" disabled={loadingMore.sem} onClick={() => loadMore("sem")}>{loadingMore.sem ? "Lädt …" : "Weitere 7 Treffer"}</Button> : null}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
