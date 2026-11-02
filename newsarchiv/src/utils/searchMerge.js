export function mapSemanticResults(semData, kwArticles) {
  const kwUrls = new Set(kwArticles.map((a) => a.url_id));
  return semData.map((a) => ({
    article: a,
    score: a.score,
    noKeyword: !kwUrls.has(a.url_id),
  }));
}

export function mergeHybridResults(keyword, semantic, query) {
  const kwUrls = new Set(keyword.map((a) => a.url_id));
  const byId = new Map();

  for (const a of keyword) {
    byId.set(a.url_id, {
      article: a,
      kind: "keyword",
      score: 1,
      noKeyword: false,
      inBoth: false,
    });
  }

  for (const h of semantic) {
    const existing = byId.get(h.article.url_id);
    if (existing) {
      existing.inBoth = true;
      existing.kind = "both";
      existing.score = Math.max(existing.score, h.score || 0);
    } else {
      byId.set(h.article.url_id, {
        article: h.article,
        kind: "semantic",
        score: h.score || 0,
        noKeyword: h.noKeyword,
        inBoth: false,
      });
    }
  }

  const merged = [...byId.values()];
  merged.sort((a, b) => {
    if (a.inBoth !== b.inBoth) return a.inBoth ? -1 : 1;
    if (a.kind === "keyword" && b.kind !== "keyword") return -1;
    if (b.kind === "keyword" && a.kind !== "keyword") return 1;
    return (b.score || 0) - (a.score || 0);
  });

  return merged.map((item) => ({
    ...item,
    query,
  }));
}
