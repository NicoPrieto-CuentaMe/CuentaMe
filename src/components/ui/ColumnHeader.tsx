"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 pr-8 text-sm text-text-primary outline-none focus:border-accent";

export function ColumnHeader({
  label,
  columnKey,
  sortColumn,
  sortDirection,
  onSort,
  searchValue,
  onSearch,
  onClear,
  sortable = true,
  searchable = true,
}: {
  label: string;
  columnKey: string;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSort: (key: string, dir: "asc" | "desc") => void;
  searchValue: string;
  onSearch: (key: string, value: string) => void;
  onClear: () => void;
  sortable?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const handleSortAsc = useCallback(() => {
    onSort(columnKey, "asc");
    setOpen(false);
  }, [columnKey, onSort]);

  const handleSortDesc = useCallback(() => {
    onSort(columnKey, "desc");
    setOpen(false);
  }, [columnKey, onSort]);

  const handleClear = useCallback(() => {
    onClear();
    setOpen(false);
  }, [onClear]);

  const isSorted = sortColumn === columnKey;
  const hasSearch = searchValue.trim() !== "";
  const showClearFiltros = isSorted || hasSearch;

  return (
    <div ref={rootRef} className="relative w-full min-w-0 text-left">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex max-w-full items-center gap-1 text-left text-sm font-medium text-text-secondary hover:text-text-primary"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="min-w-0 break-words">{label}</span>
        {isSorted ? (
          <span className="shrink-0 text-accent" aria-hidden>
            {sortDirection === "asc" ? "↑" : "↓"}
          </span>
        ) : null}
        {hasSearch ? (
          <span className="shrink-0 text-emerald-400" title="Búsqueda activa" aria-hidden>
            •
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-surface p-0 shadow-lg"
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {sortable ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={handleSortAsc}
                className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-elevated"
              >
                Ordenar A → Z
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleSortDesc}
                className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-elevated"
              >
                Ordenar Z → A
              </button>
            </>
          ) : null}
          {sortable && searchable ? <div className="h-px w-full bg-border" role="separator" aria-hidden /> : null}
          {searchable ? (
            <div className="p-2">
              <div className="relative">
                <input
                  type="search"
                  value={searchValue}
                  onChange={(e) => onSearch(columnKey, e.target.value)}
                  placeholder="Buscar…"
                  className={inputClass}
                  aria-label={`Buscar en ${label}`}
                  onKeyDown={(e) => e.stopPropagation()}
                />
                {hasSearch ? (
                  <button
                    type="button"
                    onClick={() => onSearch(columnKey, "")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-tertiary hover:bg-border hover:text-text-primary"
                    aria-label="Limpiar búsqueda"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {showClearFiltros ? (
            <>
              <div className="h-px w-full bg-border" role="separator" aria-hidden />
              <button
                type="button"
                role="menuitem"
                onClick={handleClear}
                className="w-full px-3 py-2 text-left text-sm text-text-tertiary hover:bg-danger-light/30 hover:text-danger"
              >
                Limpiar filtros
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
