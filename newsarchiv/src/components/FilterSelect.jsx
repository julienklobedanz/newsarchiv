import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.jsx";

export function FilterSelect({
  label,
  icon: Icon,
  iconLabel,
  value,
  onChange,
  options,
  triggerClassName = "w-[160px]",
}) {
  const selectValue = value === "" ? "__all__" : value;
  const aria = iconLabel || label;

  const selectInner = (
    <Select value={selectValue} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      {Icon ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger className={triggerClassName} aria-label={aria}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <Icon className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" aria-hidden />
                <span className="truncate text-xs">
                  <SelectValue />
                </span>
              </span>
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent>{aria}</TooltipContent>
        </Tooltip>
      ) : (
        <SelectTrigger className={triggerClassName} aria-label={aria}>
          <SelectValue />
        </SelectTrigger>
      )}
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id || "all"} value={o.id === "" ? "__all__" : o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (label && !Icon) {
    return (
      <label className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
        <span className="shrink-0 font-medium">{label}</span>
        {selectInner}
      </label>
    );
  }

  return selectInner;
}
