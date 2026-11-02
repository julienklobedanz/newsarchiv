import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getBookmarks } from "../utils/localStore.js";
import { API } from "../config/constants.js";
import { ArticleTile, ArticleCardSkeleton } from "../components/NewsArchivUI.jsx";
import { useBookmarks } from "../context/BookmarkContext.jsx";

export default function BookmarksPage() {
  const navigate = useNavigate();
  const { revision, bumpBookmarks } = useBookmarks();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = getBookmarks();
    if (ids.length === 0) {
      setArticles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(ids.map((id) => fetch(`${API}/articles/${id}`).then((r) => (r.ok ? r.json() : null))))
      .then((items) => setArticles(items.filter(Boolean)))
      .finally(() => setLoading(false));
  }, [revision]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Lesezeichen</h1>
      <p className="mt-1 text-sm text-[color:var(--text-muted)]">Gespeicherte Artikel in diesem Browser</p>
      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <ArticleCardSkeleton key={i} />)}
        </div>
      ) : articles.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-12 text-center text-[color:var(--text-muted)]">
          Noch keine Lesezeichen — mit ☆ an Artikeln setzen.
        </p>
      ) : (
        <div className="na-stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {articles.map((a, i) => (
            <ArticleTile
              key={a.url_id}
              article={a}
              staggerIndex={i}
              onOpen={(id) => navigate(`/artikel/${id}`)}
              onBookmarkChange={bumpBookmarks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
