import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { API } from "../config/constants.js";
import { sources as NA_SRC, categories as NA_CATEGORIES } from "../data/articles.js";
import { formatDateDE } from "../components/NewsArchivUI.jsx";
import { Skeleton } from "../components/ui/skeleton.jsx";

export default function InsightsPage() {
  const [timeline, setTimeline] = useState([]);
  const [bySource, setBySource] = useState([]);
  const [trending, setTrending] = useState([]);
  const [importStatus, setImportStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/insights/timeline?days=30`).then((r) => r.json()),
      fetch(`${API}/insights/by-source?days=30`).then((r) => r.json()),
      fetch(`${API}/insights/trending-categories`).then((r) => r.json()),
      fetch(`${API}/insights/import-status`).then((r) => r.json()),
    ])
      .then(([tl, src, tr, imp]) => {
        setTimeline(tl);
        setBySource(src);
        setTrending(tr);
        setImportStatus(imp);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sourceChart = (bySource || []).map((row) => ({
    name: NA_SRC[row.source]?.name || row.source,
    count: row.count,
  }));

  if (loading) {
    return (
      <div className="mx-auto max-w-[1240px] space-y-6 px-4 py-6 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Insights</h1>
      <p className="mt-1 text-sm text-[color:var(--text-muted)]">Aggregationen aus MongoDB — Live-Archivstatistik</p>

      {importStatus ? (
        <div className="mt-6 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--text-subtle)]">Letzter Import</h2>
          <p className="mt-2 text-lg font-semibold">{formatDateDE(importStatus.last_import_at)}</p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            +{importStatus.last_import_count ?? 0} neue Artikel
            {importStatus.last_rss_count != null ? ` · RSS: ${importStatus.last_rss_count}` : ""}
            {importStatus.last_api_count != null ? ` · API: ${importStatus.last_api_count}` : ""}
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[color:var(--text-subtle)]">Artikel pro Tag (30 Tage)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-subtle)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--text-subtle)" />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[color:var(--text-subtle)]">Nach Quelle</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceChart} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--accent)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[color:var(--text-subtle)]">Trending Themen (7 Tage)</h2>
        <ul className="divide-y divide-[color:var(--border)]">
          {(trending || []).map((row) => (
            <li key={row.category} className="flex items-center justify-between py-3 text-sm">
              <span className="font-medium">{NA_CATEGORIES[row.category]?.name || row.category}</span>
              <span className="tabular-nums text-[color:var(--text-muted)]">
                {row.count}
                {row.delta != null ? (
                  <span className={row.delta >= 0 ? " ml-2 text-emerald-600" : " ml-2 text-red-500"}>
                    {row.delta >= 0 ? "↑" : "↓"} {Math.abs(row.delta)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
