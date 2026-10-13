import { useCallback, useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Barcode,
  ClipboardList,
  FlaskConical,
  Search,
  Stethoscope,
  User,
  Zap
} from "lucide-react";
import { commandSearch, type CommandResult, type CommandResultType } from "../lib/commandSearch.service";
import { cn } from "../lib/utils";

const typeIcons: Record<CommandResultType, JSX.Element> = {
  patient: <User size={16} className="text-medical-cyan" />,
  order: <ClipboardList size={16} className="text-medical-indigo" />,
  sample: <Barcode size={16} className="text-medical-emerald" />,
  test: <FlaskConical size={16} className="text-medical-amber" />,
  action: <Zap size={16} className="text-medical-indigo" />
};

const typeLabels: Record<CommandResultType, string> = {
  patient: "Patients",
  order: "Orders",
  sample: "Samples",
  test: "Lab Tests",
  action: "Quick Actions"
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CommandPalette = ({ open, onOpenChange }: Props): JSX.Element | null => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void commandSearch(query).then((items) => {
        if (!cancelled) {
          setResults(items);
          setLoading(false);
        }
      });
    }, query ? 120 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const run = useCallback(
    (item: CommandResult) => {
      onOpenChange(false);
      if (item.href) navigate(item.href);
    },
    [navigate, onOpenChange]
  );

  if (!open) return null;

  const grouped = results.reduce<Record<string, CommandResult[]>>((acc, item) => {
    const key = typeLabels[item.type];
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal aria-label="Command palette">
      <div className="cmdk-overlay" onClick={() => onOpenChange(false)} aria-hidden />
      <div className="cmdk-dialog">
        <Command shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search size={18} className="shrink-0 text-foreground-muted" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search patients, orders, barcodes, tests…"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-subtle"
              autoFocus
            />
            <kbd className="hidden rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground-muted sm:inline">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[min(420px,50vh)] overflow-y-auto p-2">
            {loading ? (
              <div className="px-3 py-8 text-center text-sm text-foreground-muted">Searching…</div>
            ) : results.length === 0 ? (
              <Command.Empty className="px-3 py-8 text-center text-sm text-foreground-muted">
                No results for &ldquo;{query}&rdquo;
              </Command.Empty>
            ) : (
              Object.entries(grouped).map(([group, items]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-subtle"
                >
                  {items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      onSelect={() => run(item)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                        "aria-selected:bg-medical-cyan/10 aria-selected:text-foreground",
                        "data-[selected=true]:bg-medical-cyan/10"
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
                        {typeIcons[item.type]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        {item.subtitle ? (
                          <span className="block truncate text-xs text-foreground-muted">{item.subtitle}</span>
                        ) : null}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))
            )}
          </Command.List>

          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-foreground-subtle">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Activity size={12} /> Live search
              </span>
              <span className="flex items-center gap-1">
                <Stethoscope size={12} /> DiagLab LIS
              </span>
            </span>
            <span>
              <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd> navigate ·{" "}
              <kbd className="rounded border border-border px-1 font-mono">↵</kbd> open
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
};

export const useCommandPalette = (): {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
} => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen, toggle: () => setOpen((v) => !v) };
};
