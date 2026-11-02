export const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export const PAGE_SIZE = 12;
export const SEARCH_PAGE_SIZE = 7;

export const SORT_OPTIONS = [
  { id: "newest", label: "Neueste zuerst" },
  { id: "oldest", label: "Älteste zuerst" },
  { id: "title_asc", label: "Titel A–Z" },
  { id: "title_desc", label: "Titel Z–A" },
  { id: "source", label: "Quelle" },
];

export const DAYS_OPTIONS = [
  { id: "", label: "Alle Zeiträume" },
  { id: "7", label: "Letzte 7 Tage" },
  { id: "30", label: "Letzte 30 Tage" },
  { id: "90", label: "Letzte 90 Tage" },
];

export const SEARCH_SUGGESTIONS = [
  "Klimawandel",
  "künstliche Intelligenz",
  "Bundestag",
  "Inflation",
];

export const EMPTY_FILTERS = { source: "", category: "", days: "" };

export function searchBody(query, filters, offset = 0, limit = SEARCH_PAGE_SIZE) {
  const body = { query, limit, offset };
  if (filters.source) body.source = filters.source;
  if (filters.category) body.category = filters.category;
  if (filters.days) body.days = Number(filters.days);
  return body;
}

export function proxiedImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("/")) return url;
  if (url.startsWith(`${API}/image`)) return url;
  return `${API}/image?url=${encodeURIComponent(url)}`;
}
