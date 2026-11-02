const CLIENT_KEY = "na_client_id";
const HISTORY_KEY = "na_search_history";
const BOOKMARKS_KEY = "na_bookmarks";
const MAX_HISTORY = 10;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getClientId() {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export function getSearchHistory() {
  return readJson(HISTORY_KEY, []);
}

export function pushSearchHistory(term) {
  const t = term?.trim();
  if (!t) return;
  const next = [t, ...getSearchHistory().filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, MAX_HISTORY);
  writeJson(HISTORY_KEY, next);
}

export function getBookmarks() {
  return readJson(BOOKMARKS_KEY, []);
}

export function isBookmarked(urlId) {
  return getBookmarks().includes(urlId);
}

export function toggleBookmark(urlId) {
  const ids = getBookmarks();
  const next = ids.includes(urlId) ? ids.filter((id) => id !== urlId) : [...ids, urlId];
  writeJson(BOOKMARKS_KEY, next);
  return next.includes(urlId);
}
