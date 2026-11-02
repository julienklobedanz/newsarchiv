/** Qualitative Ähnlichkeitsstufen statt Prozentwerten. */
export function articleCategories(article) {
  if (Array.isArray(article?.categories) && article.categories.length > 0) {
    return article.categories.slice(0, 3);
  }
  return article?.category ? [article.category] : [];
}

export function similarityLabel(score) {
  if (score == null) return null;
  if (score >= 0.88) return { label: "Sehr ähnlich", tone: "high", variant: "similarity-high" };
  if (score >= 0.80) return { label: "Ähnlich", tone: "medium", variant: "similarity-medium" };
  if (score >= 0.72) return { label: "Verwandt", tone: "low", variant: "similarity-low" };
  return { label: "Thematisch nah", tone: "muted", variant: "similarity-muted" };
}

const SIMILARITY_VARIANT_BY_LABEL = {
  "sehr ähnlich": "similarity-high",
  "ähnlich": "similarity-medium",
  "verwandt": "similarity-low",
  "thematisch nah": "similarity-muted",
};

export function similarityVariant(score, similarityText) {
  const meta = similarityLabel(score);
  if (meta?.variant) return meta.variant;
  if (similarityText) {
    return SIMILARITY_VARIANT_BY_LABEL[similarityText.toLowerCase()] || "similarity-muted";
  }
  return "similarity-muted";
}

export function sharedCategories(baseArticle, otherArticle) {
  const base = new Set(articleCategories(baseArticle));
  return articleCategories(otherArticle).filter((id) => base.has(id));
}
