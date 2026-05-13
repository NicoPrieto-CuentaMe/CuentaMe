"use client";

import type { CategoriaProveedor, Insumo, Plato, Proveedor } from "@prisma/client";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { proveedorCategoriaLabel, proveedorCategoriaOptions } from "../categories";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "../cop-price";
import {
  checkInsumoEnUso,
  deleteDish,
  deleteInsumo,
  deleteSupplier,
  updateInsumo,
  updatePlato,
  updateProveedor,
} from "../actions";
import { UNIT_OPTIONS } from "../units";
import { AddSupplierForm, AddSupplyForm } from "./AddForms";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { ProveedorCategoriasMultiSelect } from "./ProveedorCategoriasMultiSelect";

const inlineField =
  "w-full min-w-0 rounded border border-border bg-surface-elevated px-1.5 py-1 text-sm text-text-primary outline-none focus:border-accent";

const btnSave =
  "rounded bg-accent px-2 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60";
const btnCancel =
  "rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border";
const btnEdit =
  "rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border";

const popoverPanel =
  "min-w-[200px] max-w-[min(100vw-2rem,320px)] rounded-lg border border-border bg-surface p-3 text-sm text-text-primary shadow-md outline-none";

const listScroll = "max-h-[9rem] overflow-y-auto pr-1";

const unitLabel = new Map(UNIT_OPTIONS.map((u) => [u.value, u.label] as const));

function textIncludes(haystack: string, needle: string) {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

const EMPTY_KEY = "__empty__";

/** Posición del popover tomada del botón del embudo en el momento del clic (sin refs en el DOM). */
type PopoverAnchor = { left: number; bottom: number; width: number };

function anchorFromEvent(e: React.MouseEvent<HTMLButtonElement>): PopoverAnchor {
  const r = e.currentTarget.getBoundingClientRect();
  return { left: r.left, bottom: r.bottom, width: r.width };
}

function FunnelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 5h16l-1.5 2.2L13 14.5V19l-2 1v-5.5L5.5 7.2 4 5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function usePopoverPanelStyle(open: boolean, anchor: PopoverAnchor | null) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || !anchor) return;
    const update = () => {
      const w = Math.max(200, anchor.width);
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

function TextFilterMenu({
  value,
  onChange,
  onClear,
  placeholder = "Buscar…",
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        autoFocus
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}

function CategoricalFilterMenu({
  options,
  draft,
  setDraft,
  optionSearch,
  setOptionSearch,
  onApply,
  onClearDraft,
}: {
  options: { value: string; label: string }[];
  draft: Set<string>;
  setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
  optionSearch: string;
  setOptionSearch: (s: string) => void;
  onApply: () => void;
  onClearDraft: () => void;
}) {
  const visible = useMemo(() => {
    const q = optionSearch.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, optionSearch]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((o) => draft.has(o.value));

  const toggleVisibleAll = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const o of visible) next.delete(o.value);
      } else {
        for (const o of visible) next.add(o.value);
      }
      return next;
    });
  };

  const toggleOne = (value: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  if (options.length === 0) {
    return <p className="text-sm text-text-tertiary">Sin datos disponibles</p>;
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={optionSearch}
        onChange={(e) => setOptionSearch(e.target.value)}
        placeholder="Buscar opciones…"
        className="w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={allVisibleSelected && visible.length > 0}
          onChange={toggleVisibleAll}
          className="h-4 w-4 rounded border-border text-accent"
        />
        <span>Seleccionar todo</span>
      </label>
      <div className={listScroll}>
        {visible.length === 0 ? (
          <p className="py-1 text-xs text-text-tertiary">Sin coincidencias</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={draft.has(o.value)}
                    onChange={() => toggleOne(o.value)}
                    className="h-4 w-4 rounded border-border text-accent"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={onClearDraft}
          className="rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

function PriceFilterMenu({
  desde,
  hasta,
  setDesde,
  setHasta,
  onApply,
  onClear,
}: {
  desde: string;
  hasta: string;
  setDesde: (s: string) => void;
  setHasta: (s: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="mb-0.5 block text-xs text-text-secondary">Desde $</label>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="mb-0.5 block text-xs text-text-secondary">Hasta $</label>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

function FilterPopover({
  open,
  anchor,
  onClose,
  onEnterApply,
  children,
}: {
  open: boolean;
  anchor: PopoverAnchor | null;
  onClose: () => void;
  /** Misma acción que el botón Aplicar (o cerrar menú en filtros de texto en vivo). */
  onEnterApply?: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pos = usePopoverPanelStyle(open, anchor);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const panel = panelRef.current;
      if (panel?.contains(t)) return;
      // Clic en otro embudo: no cerrar aquí; el handler del botón abrirá el menú correspondiente.
      if (t instanceof Element && t.closest("[data-funnel-trigger]")) return;
      onClose();
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open, onClose]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-filter-panel
      tabIndex={-1}
      className={popoverPanel}
      style={pos}
      onKeyDownCapture={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        onEnterApply?.();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

type ProveedorRow = Pick<Proveedor, "id" | "nombre" | "telefono" | "categorias">;
type InsumoRow = Pick<Insumo, "id" | "nombre" | "unidadBase" | "categoria">;
type PlatoRow = Pick<Plato, "id" | "nombre" | "categoriaId" | "precioVenta" | "active"> & {
  categoria: { id: string; nombre: string } | null;
};

type DeleteInsumoModalState =
  | { phase: "checking"; id: string; nombre: string }
  | { phase: "ready"; id: string; nombre: string; platoNames: string[] };

function DeleteInsumoDialog({
  state,
  pendingDelete,
  onCancel,
  onConfirm,
}: {
  state: DeleteInsumoModalState;
  pendingDelete: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const inUse = state.phase === "ready" && state.platoNames.length > 0;
  return (
    <div className="fixed inset-0 z-[220] flex items-start justify-center px-4 pt-[18vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onCancel}
        aria-label="Cerrar"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-insumo-title"
        className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg"
      >
        <h3 id="delete-insumo-title" className="text-base font-semibold text-text-primary">
          Eliminar insumo
        </h3>
        {state.phase === "checking" ? (
          <p className="mt-3 text-sm text-text-secondary">Comprobando uso en recetas…</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-text-primary">
            {inUse ? (
              <>
                <p>¿Seguro que quieres eliminar el insumo «{state.nombre}»?</p>
                <p>
                  Está siendo usado en las siguientes recetas:{" "}
                  <span className="font-medium text-text-primary">
                    {state.platoNames.join(", ")}
                  </span>
                  . Si lo eliminas, deberás editar esas recetas.
                </p>
              </>
            ) : (
              <p>
                ¿Seguro que quieres eliminar el insumo «{state.nombre}»? Esta acción no se puede deshacer.
              </p>
            )}
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pendingDelete}
            className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary hover:bg-border disabled:opacity-60"
          >
            Cancelar
          </button>
          {state.phase === "ready" ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={pendingDelete}
              className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-60"
            >
              {pendingDelete ? "Eliminando…" : inUse ? "Eliminar de todas formas" : "Eliminar"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HeaderWithFunnel({
  label,
  funnelActive,
  onFunnelClick,
  onClearColumnFilter,
}: {
  label: string;
  funnelActive: boolean;
  onFunnelClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Si hay filtro activo, muestra × para limpiar solo esta columna (sin abrir el menú). */
  onClearColumnFilter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const showClear = funnelActive && onClearColumnFilter;
  return (
    <>
      <span className="block w-full px-14 text-center font-semibold">{label}</span>
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {showClear ? (
          <button
            type="button"
            className="flex h-6 min-w-[1.25rem] items-center justify-center rounded px-0.5 text-base font-light leading-none text-danger hover:bg-danger-light hover:text-danger"
            aria-label={`Quitar filtro de ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onClearColumnFilter(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        ) : null}
        <button
          data-funnel-trigger
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFunnelClick(e);
          }}
          className="rounded p-0.5 hover:bg-surface-elevated"
          aria-label={`Filtrar ${label}`}
        >
          <FunnelIcon className={funnelActive ? "text-accent" : "text-text-tertiary"} />
        </button>
      </div>
    </>
  );
}

export function ProveedoresTable({ rows }: { rows: ProveedorRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    nombre: string;
    telefono: string;
    categorias: CategoriaProveedor[];
  } | null>(null);

  const [fNombre, setFNombre] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [catApplied, setCatApplied] = useState<Set<string>>(new Set());
  const [catDraft, setCatDraft] = useState<Set<string>>(new Set());
  const [catSearch, setCatSearch] = useState("");

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);

  const catOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.categorias.length === 0) keys.add(EMPTY_KEY);
      else for (const c of r.categorias) keys.add(c);
    }
    return Array.from(keys)
      .sort((a, b) => {
        const la = a === EMPTY_KEY ? "(Sin categoría)" : proveedorCategoriaLabel(a as CategoriaProveedor) ?? a;
        const lb = b === EMPTY_KEY ? "(Sin categoría)" : proveedorCategoriaLabel(b as CategoriaProveedor) ?? b;
        return la.localeCompare(lb, "es");
      })
      .map((value) => ({
        value,
        label:
          value === EMPTY_KEY
            ? "(Sin categoría)"
            : proveedorCategoriaLabel(value as CategoriaProveedor) ?? value,
      }));
  }, [rows]);

  const funnelNombre = fNombre.trim() !== "";
  const funnelTel = fTelefono.trim() !== "";
  const funnelCat = catApplied.size > 0;

  const filteredProveedores = useMemo(() => {
    return rows.filter((s) => {
      if (!textIncludes(s.nombre, fNombre)) return false;
      if (!textIncludes(s.telefono ?? "", fTelefono)) return false;
      if (catApplied.size > 0) {
        let match = false;
        if (catApplied.has(EMPTY_KEY) && s.categorias.length === 0) match = true;
        const enums = Array.from(catApplied).filter((k) => k !== EMPTY_KEY) as CategoriaProveedor[];
        if (s.categorias.some((c) => enums.includes(c))) match = true;
        if (!match) return false;
      }
      return true;
    });
  }, [rows, fNombre, fTelefono, catApplied]);

  const toggleProvMenu = (key: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const anchor = anchorFromEvent(e);
    setOpenMenu((prev) => {
      if (prev === key) {
        setMenuAnchor(null);
        return null;
      }
      setMenuAnchor(anchor);
      if (key === "prov-categoria") {
        setCatDraft(new Set(catApplied));
        setCatSearch("");
      }
      return key;
    });
  };

  const closeMenu = useCallback(() => {
    setOpenMenu(null);
    setMenuAnchor(null);
  }, []);

  const applyCategoria = () => {
    setCatApplied(new Set(catDraft));
    closeMenu();
  };

  const clearCategoriaDraft = () => setCatDraft(new Set());

  const beginEdit = useCallback((r: ProveedorRow) => {
    setEditingId(r.id);
    setError(null);
    setDraft({
      nombre: r.nombre,
      telefono: r.telefono ?? "",
      categorias: [...r.categorias],
    });
  }, []);

  const cancel = useCallback(() => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!editingId || !draft) return;
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("nombre", draft.nombre);
    fd.set("telefono", draft.telefono);
    for (const c of draft.categorias) {
      fd.append("categorias", c);
    }
    startTransition(async () => {
      const res = await updateProveedor(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
      setDraft(null);
      setError(null);
      router.refresh();
    });
  }, [draft, editingId, router]);

  const renderPopover = () => {
    if (!openMenu || !menuAnchor) return null;
    return (
      <FilterPopover
        open
        anchor={menuAnchor}
        onClose={closeMenu}
        onEnterApply={() => {
          if (openMenu === "prov-categoria") applyCategoria();
          else closeMenu();
        }}
      >
        {openMenu === "prov-nombre" ? (
          <TextFilterMenu value={fNombre} onChange={setFNombre} onClear={() => setFNombre("")} />
        ) : null}
        {openMenu === "prov-telefono" ? (
          <TextFilterMenu value={fTelefono} onChange={setFTelefono} onClear={() => setFTelefono("")} />
        ) : null}
        {openMenu === "prov-categoria" ? (
          <CategoricalFilterMenu
            options={catOptions}
            draft={catDraft}
            setDraft={setCatDraft}
            optionSearch={catSearch}
            setOptionSearch={setCatSearch}
            onApply={applyCategoria}
            onClearDraft={clearCategoriaDraft}
          />
        ) : null}
      </FilterPopover>
    );
  };

  return (
    <div className="space-y-2">
      {error && !editingId ? (
        <div className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}
      {renderPopover()}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-elevated">
            <tr className="text-text-secondary">
              <th className="relative border-b border-border px-3 py-2 text-center">
                <HeaderWithFunnel
                  label="Nombre"
                  funnelActive={funnelNombre}
                  onFunnelClick={toggleProvMenu("prov-nombre")}
                  onClearColumnFilter={() => setFNombre("")}
                />
              </th>
              <th className="relative border-b border-border px-3 py-2 text-center">
                <HeaderWithFunnel
                  label="Teléfono"
                  funnelActive={funnelTel}
                  onFunnelClick={toggleProvMenu("prov-telefono")}
                  onClearColumnFilter={() => setFTelefono("")}
                />
              </th>
              <th className="relative border-b border-border px-3 py-2 text-center">
                <HeaderWithFunnel
                  label="Categorías"
                  funnelActive={funnelCat}
                  onFunnelClick={toggleProvMenu("prov-categoria")}
                  onClearColumnFilter={() => setCatApplied(new Set())}
                />
              </th>
              <th className="border-b border-border px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="[&_tr]:bg-surface [&_tr:hover]:bg-surface-elevated">
            {filteredProveedores.length === 0 ? (
              <tr>
                <td colSpan={4} className="border-b border-border px-3 py-6 text-center text-sm text-text-tertiary">
                  No se encontraron resultados para los filtros aplicados
                </td>
              </tr>
            ) : (
              filteredProveedores.map((s) => {
                const isEdit = editingId === s.id;
                return (
                  <tr key={s.id} className="text-text-primary">
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <input
                          className={inlineField}
                          value={draft.nombre}
                          onChange={(e) => setDraft((d) => (d ? { ...d, nombre: e.target.value } : d))}
                        />
                      ) : (
                        s.nombre
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <input
                          className={inlineField}
                          value={draft.telefono}
                          onChange={(e) => setDraft((d) => (d ? { ...d, telefono: e.target.value } : d))}
                        />
                      ) : (
                        (s.telefono ?? "—")
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <ProveedorCategoriasMultiSelect
                          variant="inline"
                          className="min-w-[10rem] max-w-[14rem]"
                          value={draft.categorias}
                          onChange={(next) =>
                            setDraft((d) => (d ? { ...d, categorias: next } : d))
                          }
                        />
                      ) : s.categorias.length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {[...s.categorias]
                            .sort((a, b) => a.localeCompare(b, "es"))
                            .map((c) => (
                              <span
                                key={c}
                                className="inline-flex items-center rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary"
                              >
                                {proveedorCategoriaLabel(c) ?? c}
                              </span>
                            ))}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-middle">
                      <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                        <button type="button" onClick={() => beginEdit(s)}
                          style={{ display:"inline-flex", alignItems:"center", gap:5, height:28, padding:"0 10px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:6, color:"#d0d6e0", font:"510 12px/1 Inter,sans-serif", cursor:"pointer" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Editar
                        </button>
                        <form
                          action={async (fd) => {
                            await deleteSupplier(fd);
                          }}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={s.id} />
                          <button
                            type="submit"
                            onClick={(e) => {
                              if (!confirm("¿Eliminar este proveedor? Esta acción no se puede deshacer.")) e.preventDefault();
                            }}
                            style={{ display:"inline-flex", alignItems:"center", gap:5, height:28, padding:"0 10px", background:"rgba(224,82,82,0.14)", border:"1px solid rgba(224,82,82,0.30)", borderRadius:6, color:"#ff8585", font:"510 12px/1 Inter,sans-serif", cursor:"pointer" }}
                          >
                            Eliminar
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {typeof window !== "undefined" && editingId && draft && createPortal(
        <div style={{ position:"fixed", inset:0, zIndex:500 }}>
          <div onClick={cancel} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.65)" }} />
          <div style={{
            position:"absolute", top:0, right:0, bottom:0,
            width:"min(480px, 100vw)",
            background:"#0c0d0e",
            borderLeft:"1px solid rgba(255,255,255,0.08)",
            display:"flex", flexDirection:"column",
            boxShadow:"-24px 0 60px rgba(0,0,0,0.6)",
          }}>
            {/* Header */}
            <div style={{ padding:"20px 22px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexShrink:0 }}>
              <div>
                <p style={{ font:"590 10px/1 Inter,sans-serif", color:"#7170ff", letterSpacing:"1.2px", textTransform:"uppercase", margin:0 }}>EDITANDO PROVEEDOR</p>
                <h2 style={{ font:"590 20px/1.2 Inter,sans-serif", color:"#f7f8f8", letterSpacing:"-0.3px", margin:"6px 0 0" }}>{draft.nombre || "Proveedor"}</h2>
              </div>
              <button onClick={cancel} style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 12px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:"#d0d6e0", font:"510 12px/1 Inter,sans-serif", cursor:"pointer", flexShrink:0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Cerrar
              </button>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:"auto", padding:"18px 22px", display:"flex", flexDirection:"column", gap:16 }}>

              {/* Nombre */}
              <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"16px 16px 18px", display:"flex", flexDirection:"column", gap:10 }}>
                <span style={{ font:"590 14px/1.2 Inter,sans-serif", color:"#f7f8f8" }}>Nombre</span>
                <input
                  value={draft.nombre}
                  onChange={e => setDraft(d => d ? {...d, nombre: e.target.value} : d)}
                  style={{ width:"100%", height:38, padding:"0 12px", background:"rgba(0,0,0,0.30)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:8, color:"#f7f8f8", font:"510 14px/1 Inter,sans-serif", outline:"none" }}
                />
              </div>

              {/* Teléfono */}
              <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"16px 16px 18px", display:"flex", flexDirection:"column", gap:10 }}>
                <span style={{ font:"590 14px/1.2 Inter,sans-serif", color:"#f7f8f8" }}>Teléfono <span style={{ font:"400 12px/1 Inter,sans-serif", color:"#62666d" }}>opcional</span></span>
                <input
                  value={draft.telefono}
                  onChange={e => setDraft(d => d ? {...d, telefono: e.target.value.replace(/[^0-9+\-\s()]/g, "")} : d)}
                  placeholder="3001234567"
                  inputMode="tel"
                  style={{ width:"100%", height:38, padding:"0 12px", background:"rgba(0,0,0,0.30)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:8, color:"#f7f8f8", font:"510 14px/1 Inter,sans-serif", outline:"none", fontVariantNumeric:"tabular-nums" }}
                />
              </div>

              {/* Categorías */}
              <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"16px 16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
                <span style={{ font:"590 14px/1.2 Inter,sans-serif", color:"#f7f8f8" }}>Categorías</span>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {proveedorCategoriaOptions.map(c => {
                    const on = draft.categorias.includes(c.value as CategoriaProveedor);
                    return (
                      <button key={c.value} type="button"
                        onClick={() => setDraft(d => {
                          if (!d) return d;
                          const cats = on
                            ? d.categorias.filter(x => x !== c.value)
                            : [...d.categorias, c.value as CategoriaProveedor];
                          return {...d, categorias: cats};
                        })}
                        style={{
                          display:"inline-flex", alignItems:"center", gap:6,
                          height:32, padding:"0 13px",
                          background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                          border:"1px solid",
                          borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                          borderRadius:999, color: on ? "#fff" : "#d0d6e0",
                          font:"510 13px/1 Inter,sans-serif", cursor:"pointer",
                          transition:"all 150ms cubic-bezier(0.16,1,0.3,1)",
                        }}>
                        {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ padding:"10px 14px", background:"rgba(224,82,82,0.10)", border:"1px solid rgba(224,82,82,0.25)", borderRadius:8 }}>
                  <span style={{ font:"510 13px/1.4 Inter,sans-serif", color:"#f87171" }}>{error}</span>
                </div>
              )}

            </div>

            {/* Footer */}
            <div style={{ padding:"14px 22px 18px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", gap:8, flexShrink:0 }}>
              <button type="button" onClick={cancel}
                style={{ flex:1, height:42, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#d0d6e0", font:"510 13px/1 Inter,sans-serif", cursor:"pointer" }}>
                Cancelar
              </button>
              <button type="button" onClick={() => void save()} disabled={pending}
                style={{ flex:2, height:42, background:"linear-gradient(180deg,#6b78de,#5e6ad2)", border:"1px solid rgba(113,112,255,0.5)", borderRadius:10, color:"#fff", font:"590 13px/1 Inter,sans-serif", cursor:"pointer", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 14px rgba(94,106,210,0.3)", opacity: pending ? 0.7 : 1 }}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function InsumoGroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h4 className="text-sm font-medium text-text-secondary">{title}</h4>
      <span
        className="inline-flex min-h-[1.25rem] items-center rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-xs tabular-nums text-text-tertiary"
        aria-label={`${count} insumos`}
      >
        {count}
      </span>
    </div>
  );
}

function buildInsumoMenuSections(
  insumos: InsumoRow[],
): { key: string; label: string; count: number; items: InsumoRow[] }[] {
  const byKey = new Map<string, InsumoRow[]>();
  for (const inv of insumos) {
    const key = inv.categoria ?? "__sin__";
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(inv);
  }
  for (const arr of Array.from(byKey.values())) {
    arr.sort((a: InsumoRow, b: InsumoRow) => a.nombre.localeCompare(b.nombre, "es"));
  }

  const sections: { key: string; label: string; count: number; items: InsumoRow[] }[] = [];
  for (const opt of proveedorCategoriaOptions) {
    const list = byKey.get(opt.value) ?? [];
    if (list.length > 0) {
      sections.push({ key: opt.value, label: opt.label, count: list.length, items: list });
    }
  }
  const sin = byKey.get("__sin__") ?? [];
  if (sin.length > 0) {
    sections.push({ key: "__sin__", label: "Sin categoría", count: sin.length, items: sin });
  }
  return sections;
}

export function InsumosTabPanel({ rows }: { rows: InsumoRow[] }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Hero composer */}
      <section style={{
        position:"relative",
        background:"linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)",
        border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:18, padding:"28px 32px 22px",
        display:"flex", flexDirection:"column",
        boxShadow:"0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        <AddSupplyForm />
      </section>

      {/* Mis insumos */}
      <section style={{
        background:"rgba(255,255,255,0.02)",
        border:"1px solid rgba(255,255,255,0.06)",
        borderRadius:14, padding:"20px 22px 24px",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
          <h2 style={{ font:"510 16px/1.2 Inter,sans-serif", color:"#f7f8f8", letterSpacing:"-0.2px", margin:0 }}>Mis insumos</h2>
          <span style={{ font:"510 11px/1 Inter,sans-serif", color:"#8a8f98", background:"rgba(255,255,255,0.04)", padding:"4px 8px", borderRadius:999 }}>{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding:"32px 16px", display:"flex", flexDirection:"column", alignItems:"center", gap:6, textAlign:"center" }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"rgba(94,106,210,0.10)", border:"1px solid rgba(113,112,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:6 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" strokeWidth="1.6" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            </div>
            <p style={{ font:"510 14px/1.4 Inter,sans-serif", color:"#d0d6e0", margin:0 }}>Aún no hay insumos</p>
            <p style={{ font:"400 13px/1.4 Inter,sans-serif", color:"#62666d", margin:0 }}>Agrega uno arriba para empezar</p>
          </div>
        ) : (
          <InsumosTable rows={rows} />
        )}
      </section>
    </div>
  );
}

export function ProveedoresTabPanel({ rows }: { rows: ProveedorRow[] }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const n = rows.length;

  return (
    <>
      {/* Botón Mis proveedores */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:6 }}>
        <button type="button" onClick={() => setDrawerOpen(o => !o)}
          style={{
            display:"inline-flex", alignItems:"center", gap:8,
            height:32, padding:"0 12px",
            background: drawerOpen ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.03)",
            border:"1px solid",
            borderColor: drawerOpen ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)",
            borderRadius:8, color: drawerOpen ? "#a4adff" : "#d0d6e0",
            font:"510 12px/1 Inter,sans-serif", cursor:"pointer",
            transition:"all 150ms cubic-bezier(0.16,1,0.3,1)",
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <span>Mis proveedores</span>
          <span style={{ font:"510 11px/1 Inter,sans-serif", color: drawerOpen ? "#a4adff" : "#8a8f98", background: drawerOpen ? "rgba(113,112,255,0.20)" : "rgba(255,255,255,0.05)", padding:"3px 7px", borderRadius:999, minWidth:20, textAlign:"center" }}>
            {n}
          </span>
        </button>
      </div>

      {/* Hero composer */}
      <section style={{
        position:"relative",
        background:"linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)",
        border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:18, padding:"28px 32px 22px",
        display:"flex", flexDirection:"column", gap:22,
        boxShadow:"0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        <div style={{ font:"590 10px/1 Inter,sans-serif", color:"#62666d", letterSpacing:"1.6px", textTransform:"uppercase" }}>
          NUEVO PROVEEDOR
        </div>
        <AddSupplierForm />
      </section>

      {/* Drawer inferior */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0,
        zIndex:80,
        transform: drawerOpen ? "translateY(0)" : "translateY(100%)",
        transition:"transform 300ms cubic-bezier(0.16,1,0.3,1)",
        display:"flex", flexDirection:"column",
        maxHeight:"55vh",
        background:"#0c0d0e",
        borderTop:"1px solid rgba(255,255,255,0.08)",
        boxShadow:"0 -24px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header del drawer */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px 12px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ font:"590 15px/1.2 Inter,sans-serif", color:"#f7f8f8", letterSpacing:"-0.2px" }}>Mis proveedores</span>
            <span style={{ font:"510 11px/1 Inter,sans-serif", color:"#8a8f98", background:"rgba(255,255,255,0.04)", padding:"3px 8px", borderRadius:999 }}>{n}</span>
          </div>
          <button type="button" onClick={() => setDrawerOpen(false)}
            style={{ width:28, height:28, borderRadius:7, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"#8a8f98", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
            aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {/* Contenido */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {n === 0 ? (
            <div style={{ padding:"32px 16px", display:"flex", flexDirection:"column", alignItems:"center", gap:6, textAlign:"center" }}>
              <div style={{ width:44, height:44, borderRadius:12, background:"rgba(94,106,210,0.10)", border:"1px solid rgba(113,112,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:6 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5e6ad2" strokeWidth="1.6" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <p style={{ font:"510 14px/1.4 Inter,sans-serif", color:"#d0d6e0", margin:0 }}>Aún no hay proveedores</p>
              <p style={{ font:"400 13px/1.4 Inter,sans-serif", color:"#62666d", margin:0 }}>Agrega uno arriba para empezar</p>
            </div>
          ) : (
            <ProveedoresTable rows={rows} />
          )}
        </div>
      </div>
    </>
  );
}

export function InsumosTable({ rows }: { rows: InsumoRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    nombre: string;
    baseUnit: string;
    categoria: string;
  } | null>(null);

  const [deleteModal, setDeleteModal] = useState<DeleteInsumoModalState | null>(null);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const toggleCat = (key: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const menuSections = useMemo(() => buildInsumoMenuSections(rows), [rows]);

  const collapseCard = useCallback(() => {
    setExpandedId(null);
    setDraft(null);
    setError(null);
  }, []);

  const handleCardActivate = useCallback(
    (r: InsumoRow) => {
      setSuccessMessage(null);
      if (expandedId === r.id) {
        collapseCard();
        return;
      }
      setExpandedId(r.id);
      setError(null);
      setDraft({
        nombre: r.nombre,
        baseUnit: r.unidadBase,
        categoria: r.categoria ?? "",
      });
    },
    [expandedId, collapseCard],
  );

  const save = useCallback(async () => {
    if (!expandedId || !draft) return;
    const fd = new FormData();
    fd.set("id", expandedId);
    fd.set("nombre", draft.nombre);
    fd.set("baseUnit", draft.baseUnit);
    fd.set("categoria", draft.categoria);
    startTransition(async () => {
      const res = await updateInsumo(fd);
      if (!res.ok) {
        setError(res.message);
        setSuccessMessage(null);
        return;
      }
      collapseCard();
      setSuccessMessage("Insumo actualizado.");
      router.refresh();
    });
  }, [draft, expandedId, router, collapseCard]);

  const beginDeleteInsumo = useCallback((id: string, nombre: string) => {
    setError(null);
    setSuccessMessage(null);
    setDeleteModal({ phase: "checking", id, nombre });
    void (async () => {
      const res = await checkInsumoEnUso(id);
      if (!res.ok) {
        setDeleteModal(null);
        setError(res.message);
        return;
      }
      if (res.enUso) {
        setDeleteModal({ phase: "ready", id, nombre, platoNames: res.platoNames });
      } else {
        setDeleteModal({ phase: "ready", id, nombre, platoNames: [] });
      }
    })();
  }, []);

  const cancelDeleteInsumo = useCallback(() => {
    if (isDeleting) return;
    setDeleteModal(null);
  }, [isDeleting]);

  const confirmDeleteInsumo = useCallback(() => {
    if (!deleteModal || deleteModal.phase !== "ready") return;
    const { id } = deleteModal;
    startDeleteTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const r = await deleteInsumo(fd);
      if (!r.ok) {
        setError(r.message);
        setDeleteModal(null);
        return;
      }
      setDeleteModal(null);
      setError(null);
      if (expandedId === id) collapseCard();
      router.refresh();
    });
  }, [deleteModal, router, expandedId, collapseCard]);

  return (
    <div className="space-y-4">
      {successMessage ? (
        <div
          className="rounded-lg border border-accent/30 bg-accent-light px-3 py-2 text-sm text-accent"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}
      {deleteModal ? (
        <DeleteInsumoDialog
          state={deleteModal}
          pendingDelete={isDeleting}
          onCancel={cancelDeleteInsumo}
          onConfirm={confirmDeleteInsumo}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-text-tertiary">Aún no tienes insumos. Agrega el primero arriba.</p>
      ) : menuSections.length === 0 ? (
        <p className="text-sm text-text-tertiary">No hay insumos para mostrar por categoría.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {menuSections.map((section) => {
              const isOpen = expandedCats.has(section.key);
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => toggleCat(section.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 13px",
                    background: isOpen ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                    border: "1px solid",
                    borderColor: isOpen ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    color: isOpen ? "#fff" : "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                    transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                    boxShadow: isOpen ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  {isOpen && (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                  <span>{section.label}</span>
                  <span
                    style={{
                      font: "510 11px/1 Inter,sans-serif",
                      color: isOpen ? "rgba(255,255,255,0.7)" : "#62666d",
                      background: isOpen ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                      padding: "2px 6px",
                      borderRadius: 999,
                      minWidth: 18,
                      textAlign: "center",
                    }}
                  >
                    {section.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {menuSections.map((section) => {
              const isOpen = expandedCats.has(section.key);
              if (!isOpen) return null;
              return (
                <div key={section.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span
                      style={{
                        font: "510 13px/1.2 Inter,sans-serif",
                        color: "#d0d6e0",
                        letterSpacing: "-0.1px",
                      }}
                    >
                      {section.label}
                    </span>
                    <span
                      style={{
                        font: "510 11px/1 Inter,sans-serif",
                        color: "#8a8f98",
                        background: "rgba(255,255,255,0.04)",
                        padding: "3px 7px",
                        borderRadius: 999,
                      }}
                    >
                      {section.count}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {section.items.map((r) => {
                      const isExpanded = expandedId === r.id;
                      if (isExpanded && draft) {
                        return (
                          <div
                            key={r.id}
                            style={{
                              gridColumn: "span 1",
                              padding: 14,
                              background: "rgba(94,106,210,0.06)",
                              border: "1px solid rgba(113,112,255,0.40)",
                              borderRadius: 10,
                              boxShadow:
                                "0 0 0 3px rgba(113,112,255,0.10), 0 12px 32px rgba(0,0,0,0.30)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 12,
                            }}
                          >
                            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                              <div>
                                <label className="text-xs font-medium text-text-secondary">Nombre</label>
                                <input
                                  className={`${inlineField} mt-1 w-full`}
                                  value={draft.nombre}
                                  onChange={(e) => setDraft((d) => (d ? { ...d, nombre: e.target.value } : d))}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-text-secondary">Unidad base</label>
                                <select
                                  className={`${inlineField} mt-1 w-full`}
                                  value={draft.baseUnit}
                                  onChange={(e) => setDraft((d) => (d ? { ...d, baseUnit: e.target.value } : d))}
                                >
                                  <option value="" disabled>
                                    Selecciona...
                                  </option>
                                  {UNIT_OPTIONS.map((u) => (
                                    <option key={u.value} value={u.value}>
                                      {u.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-text-secondary">Categoría</label>
                                <select
                                  className={`${inlineField} mt-1 w-full`}
                                  value={draft.categoria}
                                  onChange={(e) =>
                                    setDraft((d) => (d ? { ...d, categoria: e.target.value } : d))
                                  }
                                >
                                  <option value="">Sin categoría</option>
                                  {proveedorCategoriaOptions.map((c) => (
                                    <option key={c.value} value={c.value}>
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                  type="button"
                                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                                  disabled={pending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void save();
                                  }}
                                >
                                  {pending ? "Guardando…" : "Guardar"}
                                </button>
                                <button
                                  type="button"
                                  className={btnCancel}
                                  disabled={pending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    collapseCard();
                                  }}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-danger/30 bg-danger-light px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-60"
                                  disabled={!!deleteModal || pending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    beginDeleteInsumo(r.id, r.nombre);
                                  }}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleCardActivate(r)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            padding: "12px 14px",
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: 10,
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.045)";
                            e.currentTarget.style.borderColor = "rgba(113,112,255,0.25)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.025)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                          }}
                        >
                          <span
                            style={{
                              font: "590 13px/1.3 Inter,sans-serif",
                              color: "#f7f8f8",
                              letterSpacing: "-0.1px",
                            }}
                          >
                            {r.nombre}
                          </span>
                          <span style={{ font: "400 12px/1.3 Inter,sans-serif", color: "#8a8f98" }}>
                            {unitLabel.get(r.unidadBase) ?? r.unidadBase}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PlatoPrecioInline({
  precioDigits,
  onDigitsChange,
}: {
  precioDigits: string;
  onDigitsChange: (digits: string) => void;
}) {
  const display = useMemo(() => formatCopFromDigits(precioDigits), [precioDigits]);
  return (
    <input
      inputMode="numeric"
      className={inlineField}
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onDigitsChange(digits);
      }}
    />
  );
}

export function PlatosTable({ rows }: { rows: PlatoRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    nombre: string;
    categoriaId: string;
    precioDigits: string;
    active: boolean;
  } | null>(null);

  const [fNombre, setFNombre] = useState("");
  const [platoCatApplied, setPlatoCatApplied] = useState<Set<string>>(new Set());
  const [platoCatDraft, setPlatoCatDraft] = useState<Set<string>>(new Set());
  const [platoCatSearch, setPlatoCatSearch] = useState("");
  const [precioApplied, setPrecioApplied] = useState({ desde: "", hasta: "" });
  const [precioDraft, setPrecioDraft] = useState({ desde: "", hasta: "" });
  const [activoApplied, setActivoApplied] = useState<Set<string>>(new Set());
  const [activoDraft, setActivoDraft] = useState<Set<string>>(new Set());
  const [activoSearch, setActivoSearch] = useState("");

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);

  const platoCatOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(r.categoria?.nombre?.trim() ? r.categoria.nombre.trim() : EMPTY_KEY);
    }
    return Array.from(keys)
      .sort((a, b) => {
        const la = a === EMPTY_KEY ? "(Sin categoría)" : a;
        const lb = b === EMPTY_KEY ? "(Sin categoría)" : b;
        return la.localeCompare(lb, "es");
      })
      .map((value) => ({
        value,
        label: value === EMPTY_KEY ? "(Sin categoría)" : value,
      }));
  }, [rows]);

  const platoCategoriaSelectOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.categoria) m.set(r.categoria.id, r.categoria.nombre);
    }
    return Array.from(m.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [rows]);

  const activoOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(r.active ? "Activo" : "Inactivo");
    }
    return Array.from(keys)
      .sort()
      .map((value) => ({ value, label: value }));
  }, [rows]);

  const funnelNombre = fNombre.trim() !== "";
  const funnelPlatoCat = platoCatApplied.size > 0;
  const funnelPrecio = precioApplied.desde.trim() !== "" || precioApplied.hasta.trim() !== "";
  const funnelActivo = activoApplied.size > 0;

  const filteredPlatos = useMemo(() => {
    const parseBound = (s: string): number | null => {
      const t = s.trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    const desde = parseBound(precioApplied.desde);
    const hasta = parseBound(precioApplied.hasta);

    return rows.filter((d) => {
      if (!textIncludes(d.nombre, fNombre)) return false;
      if (platoCatApplied.size > 0) {
        const key = d.categoria?.nombre?.trim() ? d.categoria.nombre.trim() : EMPTY_KEY;
        if (!platoCatApplied.has(key)) return false;
      }
      const precio = Number(d.precioVenta);
      if (desde !== null && precio < desde) return false;
      if (hasta !== null && precio > hasta) return false;
      if (activoApplied.size > 0) {
        const lab = d.active ? "Activo" : "Inactivo";
        if (!activoApplied.has(lab)) return false;
      }
      return true;
    });
  }, [rows, fNombre, platoCatApplied, precioApplied, activoApplied]);

  const togglePlaMenu = (key: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const anchor = anchorFromEvent(e);
    setOpenMenu((prev) => {
      if (prev === key) {
        setMenuAnchor(null);
        return null;
      }
      setMenuAnchor(anchor);
      if (key === "pla-categoria") {
        setPlatoCatDraft(new Set(platoCatApplied));
        setPlatoCatSearch("");
      }
      if (key === "pla-precio") {
        setPrecioDraft({ ...precioApplied });
      }
      if (key === "pla-activo") {
        setActivoDraft(new Set(activoApplied));
        setActivoSearch("");
      }
      return key;
    });
  };

  const closeMenu = useCallback(() => {
    setOpenMenu(null);
    setMenuAnchor(null);
  }, []);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }),
    [],
  );

  const beginEdit = useCallback((r: PlatoRow) => {
    setEditingId(r.id);
    setError(null);
    setDraft({
      nombre: r.nombre,
      categoriaId: r.categoriaId ?? "",
      precioDigits: precioVentaToDigits(r.precioVenta),
      active: r.active,
    });
  }, []);

  const cancel = useCallback(() => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!editingId || !draft) return;
    const salePrice = digitsToSalePriceString(draft.precioDigits);
    if (!salePrice) {
      setError("El precio de venta debe ser mayor a 0.");
      return;
    }
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("nombre", draft.nombre);
    fd.set("categoriaId", draft.categoriaId);
    fd.set("salePrice", salePrice);
    fd.set("active", draft.active ? "true" : "false");
    startTransition(async () => {
      const res = await updatePlato(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
      setDraft(null);
      setError(null);
      router.refresh();
    });
  }, [draft, editingId, router]);

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}
      {openMenu && menuAnchor ? (
        <FilterPopover
          open
          anchor={menuAnchor}
          onClose={closeMenu}
          onEnterApply={() => {
            if (openMenu === "pla-nombre") closeMenu();
            else if (openMenu === "pla-categoria") {
              setPlatoCatApplied(new Set(platoCatDraft));
              closeMenu();
            } else if (openMenu === "pla-precio") {
              setPrecioApplied({ ...precioDraft });
              closeMenu();
            } else if (openMenu === "pla-activo") {
              setActivoApplied(new Set(activoDraft));
              closeMenu();
            }
          }}
        >
          {openMenu === "pla-nombre" ? (
            <TextFilterMenu value={fNombre} onChange={setFNombre} onClear={() => setFNombre("")} />
          ) : null}
          {openMenu === "pla-categoria" ? (
            <CategoricalFilterMenu
              options={platoCatOptions}
              draft={platoCatDraft}
              setDraft={setPlatoCatDraft}
              optionSearch={platoCatSearch}
              setOptionSearch={setPlatoCatSearch}
              onApply={() => {
                setPlatoCatApplied(new Set(platoCatDraft));
                closeMenu();
              }}
              onClearDraft={() => setPlatoCatDraft(new Set())}
            />
          ) : null}
          {openMenu === "pla-precio" ? (
            <PriceFilterMenu
              desde={precioDraft.desde}
              hasta={precioDraft.hasta}
              setDesde={(s) => setPrecioDraft((p) => ({ ...p, desde: s }))}
              setHasta={(s) => setPrecioDraft((p) => ({ ...p, hasta: s }))}
              onApply={() => {
                setPrecioApplied({ ...precioDraft });
                closeMenu();
              }}
              onClear={() => setPrecioDraft({ desde: "", hasta: "" })}
            />
          ) : null}
          {openMenu === "pla-activo" ? (
            <CategoricalFilterMenu
              options={activoOptions}
              draft={activoDraft}
              setDraft={setActivoDraft}
              optionSearch={activoSearch}
              setOptionSearch={setActivoSearch}
              onApply={() => {
                setActivoApplied(new Set(activoDraft));
                closeMenu();
              }}
              onClearDraft={() => setActivoDraft(new Set())}
            />
          ) : null}
        </FilterPopover>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-elevated">
            <tr className="text-text-secondary">
              <th className="relative border-b border-border px-3 py-2 text-center">
                <HeaderWithFunnel
                  label="Nombre"
                  funnelActive={funnelNombre}
                  onFunnelClick={togglePlaMenu("pla-nombre")}
                  onClearColumnFilter={() => setFNombre("")}
                />
              </th>
              <th className="relative border-b border-border px-3 py-2 text-center">
                <HeaderWithFunnel
                  label="Categoría"
                  funnelActive={funnelPlatoCat}
                  onFunnelClick={togglePlaMenu("pla-categoria")}
                  onClearColumnFilter={() => setPlatoCatApplied(new Set())}
                />
              </th>
              <th className="relative border-b border-border px-3 py-2 text-center">
                <HeaderWithFunnel
                  label="Precio"
                  funnelActive={funnelPrecio}
                  onFunnelClick={togglePlaMenu("pla-precio")}
                  onClearColumnFilter={() => setPrecioApplied({ desde: "", hasta: "" })}
                />
              </th>
              <th className="relative border-b border-border px-3 py-2 text-center">
                <HeaderWithFunnel
                  label="Activo"
                  funnelActive={funnelActivo}
                  onFunnelClick={togglePlaMenu("pla-activo")}
                  onClearColumnFilter={() => setActivoApplied(new Set())}
                />
              </th>
              <th className="border-b border-border px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="[&_tr]:bg-surface [&_tr:hover]:bg-surface-elevated">
            {filteredPlatos.length === 0 ? (
              <tr>
                <td colSpan={5} className="border-b border-border px-3 py-6 text-center text-sm text-text-tertiary">
                  No se encontraron resultados para los filtros aplicados
                </td>
              </tr>
            ) : (
              filteredPlatos.map((d) => {
                const isEdit = editingId === d.id;
                return (
                  <tr key={d.id} className="text-text-primary">
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <input
                          className={inlineField}
                          value={draft.nombre}
                          onChange={(e) => setDraft((x) => (x ? { ...x, nombre: e.target.value } : x))}
                        />
                      ) : (
                        d.nombre
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <select
                          className={inlineField}
                          value={draft.categoriaId}
                          onChange={(e) => setDraft((x) => (x ? { ...x, categoriaId: e.target.value } : x))}
                        >
                          <option value="">Sin categoría</option>
                          {platoCategoriaSelectOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        (d.categoria?.nombre ?? "—")
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <PlatoPrecioInline
                          precioDigits={draft.precioDigits}
                          onDigitsChange={(digits) => setDraft((x) => (x ? { ...x, precioDigits: digits } : x))}
                        />
                      ) : (
                        money.format(Number(d.precioVenta))
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-accent"
                            checked={draft.active}
                            onChange={(e) => setDraft((x) => (x ? { ...x, active: e.target.checked } : x))}
                          />
                          <span>{draft.active ? "Activo" : "Inactivo"}</span>
                        </label>
                      ) : d.active ? (
                        <span className="rounded-full bg-accent-light px-2 py-1 text-xs font-semibold text-accent">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full bg-surface-elevated px-2 py-1 text-xs font-semibold text-text-tertiary">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 align-middle">
                      {isEdit ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" className={btnSave} disabled={pending} onClick={() => void save()}>
                            Guardar
                          </button>
                          <button type="button" className={btnCancel} disabled={pending} onClick={cancel}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" className={btnEdit} onClick={() => beginEdit(d)}>
                            Editar
                          </button>
                          <form
                            action={async (fd) => {
                              await deleteDish(fd);
                            }}
                            className="inline"
                          >
                            <input type="hidden" name="id" value={d.id} />
                            <ConfirmSubmitButton
                              confirmMessage="¿Eliminar este plato? Si tiene receta, puede fallar."
                              className="text-danger hover:text-danger border border-danger/30 bg-danger-light px-2 py-1 text-xs font-medium hover:bg-danger/20"
                            >
                              Eliminar
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
