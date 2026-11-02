import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { API } from "../config/constants.js";
import {
  SourceBadge,
  CategoryBadgeList,
  BookmarkButton,
  ArticleImage,
  RelatedCard,
  StorySiblingCard,
  ArticleCardSkeleton,
  stripHtml,
  formatDateDE,
} from "../components/NewsArchivUI.jsx";
import { Button } from "../components/ui/button.jsx";
import { useBookmarks } from "../context/BookmarkContext.jsx";

function SectionHeading({ children }) {
  return (
    <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[color:var(--text-subtle)]">
      {children}
    </h2>
  );
}

export default function ArticlePage() {
  const { urlId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { bumpBookmarks } = useBookmarks();
  const [article, setArticle] = useState(null);
  const [related, setRelated] = useState([]);
  const [cluster, setCluster] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/articles/${urlId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((found) => {
        if (!found) {
          setArticle(null);
          setCluster([]);
          setRelated([]);
          return;
        }
        setArticle(found);
        const clusterPromise = found.story_cluster_id
          ? fetch(`${API}/stories/${found.story_cluster_id}`)
              .then((r) => (r.ok ? r.json() : []))
              .then((items) => setCluster(items.filter((a) => a.url_id !== found.url_id)))
          : Promise.resolve(setCluster([]));
        const relatedPromise = fetch(`${API}/articles/${urlId}/related`)
          .then((r) => (r.ok ? r.json() : []))
          .then(setRelated);
        return Promise.all([clusterPromise, relatedPromise]);
      })
      .finally(() => setLoading(false));
  }, [urlId]);

  const goBack = () => {
    if (location.state?.from === "search" && location.state?.search) {
      navigate(`/suche?${location.state.search}`);
    } else {
      navigate(-1);
    }
  };

  const openArticle = (id) => navigate(`/artikel/${id}`, { state: location.state });

  if (loading) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
        <ArticleCardSkeleton />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-12 text-center text-[color:var(--text-muted)]">
        Artikel nicht gefunden.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
      <Button variant="outline" className="mb-5" onClick={goBack}>
        {location.state?.from === "search" ? "← Zurück zur Suche" : "← Zurück"}
      </Button>
      <article className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
        <ArticleImage article={article} className="!aspect-[21/9] !rounded-none" />
        <div className="p-6 sm:p-9">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SourceBadge sourceId={article.source} />
            <CategoryBadgeList article={article} />
            <span className="text-sm text-[color:var(--text-subtle)]">{formatDateDE(article.date)}</span>
            {article.author ? (
              <span className="text-sm text-[color:var(--text-muted)]">· {article.author}</span>
            ) : null}
            <span className="ml-auto">
              <BookmarkButton urlId={article.url_id} onChange={bumpBookmarks} />
            </span>
          </div>
          <h1 className="font-serif text-3xl font-black leading-tight tracking-tight sm:text-4xl">{article.title}</h1>
          <hr className="my-6 border-[color:var(--border)]" />
          <p className="text-[16px] leading-[1.75] text-[color:var(--text-muted)]">{stripHtml(article.body)}</p>
          {article.url ? (
            <p className="mt-6">
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[color:var(--accent)] hover:underline">
                Originalartikel lesen →
              </a>
            </p>
          ) : null}
        </div>
      </article>

      {cluster.length > 0 ? (
        <section className="mt-10">
          <SectionHeading>Dieselbe Story in anderen Quellen</SectionHeading>
          <div className="grid grid-cols-4 gap-4">
            {cluster.map((hit) => (
              <StorySiblingCard key={hit.url_id} article={hit} onOpen={openArticle} />
            ))}
          </div>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className={cluster.length > 0 ? "mt-10" : "mt-10"}>
          <SectionHeading>Ähnliche Artikel</SectionHeading>
          <div className="grid grid-cols-4 gap-4">
            {related.map((hit) => (
              <RelatedCard
                key={hit.url_id}
                hit={hit}
                baseArticle={article}
                onOpen={openArticle}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
