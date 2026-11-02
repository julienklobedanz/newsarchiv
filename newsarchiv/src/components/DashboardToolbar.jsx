import { Calendar, ArrowDownWideNarrow } from "lucide-react";
import { FilterSelect } from "./FilterSelect.jsx";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs.jsx";
import { DAYS_OPTIONS, SORT_OPTIONS } from "../config/constants.js";
import { formatDateDE } from "./NewsArchivUI.jsx";

export function DashboardToolbar({
  stats,
  days,
  onDaysChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-muted)] shadow-sm">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="min-w-0 truncate">
          <strong className="font-semibold text-[color:var(--text)]">
            {stats.count.toLocaleString("de-DE")} Artikel
          </strong>
          {" · "}Letzter Import: {formatDateDE(stats.last_import)}
        </span>
      </div>
      <FilterSelect
        icon={Calendar}
        iconLabel="Zeitraum"
        value={days}
        onChange={onDaysChange}
        options={DAYS_OPTIONS}
        triggerClassName="w-[110px]"
      />
      <FilterSelect
        icon={ArrowDownWideNarrow}
        iconLabel="Sortierung"
        value={sort}
        onChange={onSortChange}
        options={SORT_OPTIONS}
        triggerClassName="w-[130px]"
      />
      <Tabs value={view} onValueChange={onViewChange}>
        <TabsList className="h-9">
          <TabsTrigger value="articles" className="px-3 text-xs">
            Artikel
          </TabsTrigger>
          <TabsTrigger value="stories" className="px-3 text-xs">
            Stories
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
