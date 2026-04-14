"use client";

import type { CategoriaProveedor, Insumo, Plato, Proveedor } from "@prisma/client";
import { useRouter } from "next/navigation";
import { createPortal, useFormState } from "react-dom";
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
import type { ActionState } from "../actions";
import {
  checkInsumoEnUso,
  createCategoriaInsumo,
  deleteCategoriaInsumo,
  deleteDish,
  deleteInsumo,
  deleteSupplier,
  updateCategoriaInsumo,
  updateInsumo,
  updatePlato,
  updateProveedor,
} from "../actions";
import { UNIT_OPTIONS } from "../units";
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
type InsumoRow = Pick<Insumo, "id" | "nombre" | "unidadBase" | "categoriaInsumoId"> & {
  categoriaInsumo: { id: string; nombre: string } | null;
};

export type CategoriaInsumoTabRow = {
  id: string;
  nombre: string;
  _count: { insumos: number };
};

const insumoCategoriaFormIdle: ActionState = { ok: false, message: "" };
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
      {error ? (
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
                          <button type="button" className={btnEdit} onClick={() => beginEdit(s)}>
                            Editar
                          </button>
                          <form
                            action={async (fd) => {
                              await deleteSupplier(fd);
                            }}
                            className="inline"
                          >
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmitButton
                              confirmMessage="¿Eliminar este proveedor? Esta acción no se puede deshacer."
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

function InsumoCategoriaFormFeedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  if (!state.message?.trim()) return null;
  return (
    <div className="mt-2 rounded-lg border border-danger/30 bg-danger-light px-2 py-1.5 text-xs text-danger">{state.message}</div>
  );
}

export function InsumosCategoriasSection({ rows }: { rows: CategoriaInsumoTabRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renamePending, startRenameTransition] = useTransition();
  const [inlineOpen, setInlineOpen] = useState(false);
  const [state, formAction] = useFormState(createCategoriaInsumo, insumoCategoriaFormIdle);
  const [deleteTarget, setDeleteTarget] = useState<CategoriaInsumoTabRow | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok && state.message) {
      router.refresh();
      setInlineOpen(false);
    }
  }, [state.ok, state.message, router]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteCategoriaInsumo(insumoCategoriaFormIdle, fd);
      if (res.ok) {
        setDeleteTarget(null);
        router.refresh();
      }
    });
  }, [deleteTarget, router]);

  const cancelRename = useCallback(() => {
    setRenameId(null);
    setRenameDraft("");
    setRenameError(null);
  }, []);

  const commitRename = useCallback(
    (c: CategoriaInsumoTabRow) => {
      if (renameId !== c.id) return;
      const next = renameDraft.trim();
      if (!next) {
        cancelRename();
        return;
      }
      if (next === c.nombre) {
        cancelRename();
        return;
      }
      startRenameTransition(async () => {
        const res = await updateCategoriaInsumo(c.id, next);
        if (!res.ok) {
          setRenameError(res.message);
          return;
        }
        cancelRename();
        router.refresh();
      });
    },
    [renameDraft, renameId, cancelRename, router],
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-text-primary">Categorías de insumos</h4>
      <p className="mt-2 text-xs text-text-tertiary">
        Agrupa insumos por tipo o uso. Pueden quedar sin categoría.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {rows.map((c) => (
          <div key={c.id} className="inline-flex max-w-full flex-col gap-0.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-secondary">
              {renameId === c.id ? (
                <input
                  autoFocus
                  disabled={renamePending}
                  value={renameDraft}
                  onChange={(e) => {
                    setRenameDraft(e.target.value);
                    setRenameError(null);
                  }}
                  onBlur={() => commitRename(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRenameDraft(c.nombre);
                      cancelRename();
                    }
                  }}
                  className="min-h-[1.875rem] min-w-[80px] max-w-[200px] rounded-full border border-accent bg-surface-elevated px-2 py-1 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="max-w-[160px] truncate text-left font-medium text-text-primary no-underline decoration-none hover:no-underline"
                    style={{ textDecoration: "none" }}
                    onClick={() => {
                      setRenameId(c.id);
                      setRenameDraft(c.nombre);
                      setRenameError(null);
                    }}
                  >
                    {c.nombre}
                  </button>
                  <span className="shrink-0 text-xs text-text-tertiary" title="Insumos en esta categoría">
                    ({c._count.insumos})
                  </span>
                  <button
                    type="button"
                    className="rounded px-1 text-base leading-none text-text-tertiary hover:bg-border hover:text-danger"
                    aria-label={`Eliminar categoría ${c.nombre}`}
                    onClick={() => setDeleteTarget(c)}
                  >
                    ×
                  </button>
                </>
              )}
            </span>
            {renameError && renameId === c.id ? (
              <p className="max-w-[220px] pl-1 text-xs text-danger">{renameError}</p>
            ) : null}
          </div>
        ))}

        {!inlineOpen ? (
          <button
            type="button"
            onClick={() => setInlineOpen(true)}
            className="inline-flex items-center rounded-full border border-dashed border-accent/50 bg-surface px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-light"
          >
            ＋ Nueva categoría
          </button>
        ) : (
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input
              name="nombre"
              required
              autoFocus
              placeholder="Nombre"
              className="w-40 rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Agregar
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-primary hover:bg-border"
              onClick={() => setInlineOpen(false)}
            >
              Cancelar
            </button>
            <InsumoCategoriaFormFeedback state={state} />
          </form>
        )}
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-text-primary">Eliminar categoría de insumo</h3>
            {deleteTarget._count.insumos > 0 ? (
              <p className="mt-2 text-sm text-text-secondary">
                {deleteTarget._count.insumos}{" "}
                {deleteTarget._count.insumos === 1 ? "insumo quedará" : "insumos quedarán"} sin categoría. ¿Confirmar?
              </p>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">¿Eliminar la categoría «{deleteTarget.nombre}»?</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm text-text-primary hover:bg-border"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmDelete}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {pending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildInsumoMenuSections(
  insumos: InsumoRow[],
  categorias: { id: string; nombre: string }[],
): { key: string; titulo: string; items: InsumoRow[] }[] {
  const knownCatIds = new Set(categorias.map((c) => c.id));
  const byId = new Map<string, InsumoRow[]>();
  for (const inv of insumos) {
    const cid = inv.categoriaInsumoId ?? "__sin__";
    if (!byId.has(cid)) byId.set(cid, []);
    byId.get(cid)!.push(inv);
  }
  for (const arr of Array.from(byId.values())) {
    arr.sort((a: InsumoRow, b: InsumoRow) => a.nombre.localeCompare(b.nombre, "es"));
  }

  const sections: { key: string; titulo: string; items: InsumoRow[] }[] = [];
  for (const c of categorias) {
    const list = byId.get(c.id) ?? [];
    if (list.length > 0) {
      sections.push({ key: c.id, titulo: `${c.nombre} (${list.length})`, items: list });
    }
  }
  for (const [cid, list] of Array.from(byId.entries())) {
    if (cid === "__sin__" || knownCatIds.has(cid) || list.length === 0) continue;
    const titulo = list[0]?.categoriaInsumo?.nombre?.trim() || "Categoría";
    sections.push({ key: cid, titulo: `${titulo} (${list.length})`, items: list });
  }
  const sin = byId.get("__sin__") ?? [];
  if (sin.length > 0) {
    sections.push({ key: "__sin__", titulo: `Sin categoría (${sin.length})`, items: sin });
  }
  return sections;
}

export function InsumosTable({
  rows,
  categoriasInsumo,
}: {
  rows: InsumoRow[];
  categoriasInsumo: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    nombre: string;
    baseUnit: string;
    categoriaInsumoId: string;
  } | null>(null);

  const [deleteModal, setDeleteModal] = useState<DeleteInsumoModalState | null>(null);

  const menuSections = useMemo(() => buildInsumoMenuSections(rows, categoriasInsumo), [rows, categoriasInsumo]);

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
        categoriaInsumoId: r.categoriaInsumoId ?? "",
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
    fd.set("categoriaInsumoId", draft.categoriaInsumoId);
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
        <p className="text-sm text-text-tertiary">Aún no tienes insumos registrados. Agrega el primero arriba.</p>
      ) : menuSections.length === 0 ? (
        <p className="text-sm text-text-tertiary">No hay insumos para mostrar por categoría.</p>
      ) : (
        <div className="space-y-10">
          {menuSections.map((sec) => (
            <div key={sec.key}>
              <h4 className="mb-3 text-sm font-bold text-text-primary">{sec.titulo}</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sec.items.map((ins) => {
                    const expanded = expandedId === ins.id;
                    return (
                      <div
                        key={ins.id}
                        id={`insumo-card-${ins.id}`}
                        role={expanded ? undefined : "button"}
                        tabIndex={expanded ? -1 : 0}
                        onClick={() => {
                          if (!expanded) handleCardActivate(ins);
                        }}
                        onKeyDown={(e) => {
                          if (expanded) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCardActivate(ins);
                          }
                        }}
                        className={`relative rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-shadow ${
                          expanded
                            ? "cursor-default ring-2 ring-accent/30"
                            : "cursor-pointer hover:shadow-md"
                        }`}
                      >
                        {!expanded || !draft ? (
                          <>
                            <div className="text-sm font-semibold text-text-primary">{ins.nombre}</div>
                            <div className="mt-1 text-sm text-text-secondary">
                              {unitLabel.get(ins.unidadBase) ?? ins.unidadBase}
                            </div>
                          </>
                        ) : (
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
                                value={draft.categoriaInsumoId}
                                onChange={(e) =>
                                  setDraft((d) => (d ? { ...d, categoriaInsumoId: e.target.value } : d))
                                }
                              >
                                <option value="">Sin categoría</option>
                                {categoriasInsumo.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nombre}
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
                                  beginDeleteInsumo(ins.id, ins.nombre);
                                }}
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
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
