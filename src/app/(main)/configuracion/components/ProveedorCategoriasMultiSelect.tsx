"use client";

import type { CategoriaProveedor } from "@prisma/client";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { proveedorCategoriaOptions, proveedorCategoriaLabel } from "../categories";

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useDropdownPosition(open: boolean, anchor: { left: number; bottom: number; width: number } | null) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || !anchor) return;
    const update = () => {
      const w = Math.max(anchor.width, 200);
      setStyle({
        position: "fixed",
        top: anchor.bottom + 6,
        left: Math.min(anchor.left, Math.max(8, window.innerWidth - w - 8)),
        minWidth: w,
        zIndex: 200,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, anchor]);

  return style;
}

function buildSummary(selected: CategoriaProveedor[]): string {
  if (selected.length === 0) return "Selecciona categorías...";
  const labels = [...selected]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((v) => proveedorCategoriaLabel(v) ?? v);
  if (labels.length === 1) return labels[0]!;
  return labels.join(", ");
}

export function ProveedorCategoriasMultiSelect({
  value,
  onChange,
  name,
  variant = "default",
  disabled,
  className,
}: {
  value: CategoriaProveedor[];
  onChange: (next: CategoriaProveedor[]) => void;
  /** Si se define, se renderizan inputs hidden `name={name}` por cada valor (formularios). */
  name?: string;
  variant?: "default" | "inline";
  disabled?: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const panelStyle = useDropdownPosition(open, anchor);
  const listId = useId().replace(/:/g, "");

  const openFromButton = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ left: r.left, bottom: r.bottom, width: r.width });
  }, []);

  const toggle = () => {
    if (disabled) return;
    setOpen((prev) => {
      if (prev) {
        setAnchor(null);
        return false;
      }
      openFromButton();
      return true;
    });
  };

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
      setAnchor(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAnchor(null);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const toggleValue = (v: CategoriaProveedor) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const isInline = variant === "inline";
  const btnClass = isInline
    ? "flex w-full min-w-0 items-center justify-between gap-2 rounded border border-border bg-surface-elevated px-1.5 py-1 text-left text-xs text-text-primary outline-none transition hover:border-border-subtle focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
    : "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-left text-sm text-text-primary outline-none transition hover:border-border-subtle focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";

  const summary = buildSummary(value);
  const summaryClass =
    value.length === 0 ? "truncate text-text-tertiary" : "truncate";

  return (
    <div ref={rootRef} data-proveedor-cat-picker className={className ?? "relative w-full"}>
      {name
        ? value.map((c) => <input key={c} type="hidden" name={name} value={c} />)
        : null}

      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        id={`${listId}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${listId}-listbox` : undefined}
        className={btnClass}
        onClick={(e) => {
          e.preventDefault();
          toggle();
        }}
      >
        <span className={summaryClass}>{summary}</span>
        <ChevronDown
          className={`shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={panelRef}
              id={`${listId}-listbox`}
              role="listbox"
              aria-multiselectable="true"
              className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-lg outline-none"
              style={panelStyle}
              onMouseDown={(e) => e.preventDefault()}
            >
              <ul className="space-y-0.5">
                {proveedorCategoriaOptions.map((o) => {
                  const checked = value.includes(o.value);
                  return (
                    <li key={o.value} role="option" aria-selected={checked}>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-elevated ${
                          isInline ? "text-xs" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleValue(o.value)}
                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-2 border-border bg-surface accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        />
                        <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
