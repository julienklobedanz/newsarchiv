import { cn } from "../../lib/utils.js";

function Badge({ className, variant = "default", ...props }) {
  const variants = {
    default: "bg-[color:var(--accent)]/10 text-[color:var(--accent)] border border-[color:var(--accent)]/20",
    secondary: "bg-[color:var(--bg-muted)] text-[color:var(--text-muted)] border border-[color:var(--border)]",
    story: "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
    keyword: "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
    semantic: "bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300",
    "similarity-high": "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    "similarity-medium": "bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
    "similarity-low": "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
    "similarity-muted": "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  );
}

export { Badge };
