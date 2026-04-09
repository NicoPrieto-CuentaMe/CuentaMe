"use client";

import type { Insumo, Plato, Proveedor } from "@prisma/client";
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
import { insumoCategorias, platoCategorias, proveedorCategorias } from "../categories";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "../cop-price";
import {
  deleteDish,
  deleteSupplier,
  deleteSupply,
  updateInsumo,
  updatePlato,
  updateProveedor,
} from "../actions";
import { UNIT_OPTIONS } from "../units";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

const ACCENT = "#1a6b3c";

const inlineField =
  "w-full min-w-0 rounded border border-[var(--border)]/50 bg-white/90 px-1.5 py-1 text-sm text-[var(--foreground)] outline-none focus:border-accent";

const btnSave =
  "rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60";
const btnCancel =
  "rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-gray-50";
const btnEdit =
  "rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-gray-50";

const popoverPanel =
  "min-w-[200px] max-w-[min(100vw-2rem,320px)] rounded-lg border border-[var(--border)] bg-white p-3 text-sm text-[var(--foreground)] shadow-md";

const listScroll = "max-h-[9rem] overflow-y-auto pr-1";

const unitLabel = new Map(UNIT_OPTIONS.map((u) => [u.value, u.label] as const));

function textIncludes(haystack: string, needle: string) {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

const EMPTY_KEY = "__empty__";

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

function useFilterPopoverPosition(open: boolean, triggerRef: React.RefObject<HTMLButtonElement | null>) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(200, r.width);
      setStyle({
        position: "fixed",
        top: r.bottom + 6,
        left: Math.min(r.left, Math.max(8, window.innerWidth - w - 8)),
        minWidth: w,
        zIndex: 200,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, triggerRef]);

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
        className="w-full rounded border border-[var(--border)] bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-accent"
        autoFocus
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-gray-50"
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
    return <p className="text-sm text-[var(--foreground)]/60">Sin datos disponibles</p>;
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={optionSearch}
        onChange={(e) => setOptionSearch(e.target.value)}
        placeholder="Buscar opciones…"
        className="w-full rounded border border-[var(--border)] bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-accent"
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allVisibleSelected && visible.length > 0}
          onChange={toggleVisibleAll}
          className="h-4 w-4 rounded border-[var(--border)]"
          style={{ accentColor: ACCENT }}
        />
        <span>Seleccionar todo</span>
      </label>
      <div className={listScroll}>
        {visible.length === 0 ? (
          <p className="py-1 text-xs text-[var(--foreground)]/50">Sin coincidencias</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.has(o.value)}
                    onChange={() => toggleOne(o.value)}
                    className="h-4 w-4 rounded border-[var(--border)]"
                    style={{ accentColor: ACCENT }}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-2">
        <button
          type="button"
          onClick={onClearDraft}
          className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-gray-50"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: ACCENT }}
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
        <label className="mb-0.5 block text-xs text-[var(--foreground)]/70">Desde $</label>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="w-full rounded border border-[var(--border)] bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="mb-0.5 block text-xs text-[var(--foreground)]/70">Hasta $</label>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="w-full rounded border border-[var(--border)] bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-gray-50"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

function FilterPopover({
  open,
  triggerRef,
  onClose,
  children,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pos = useFilterPopoverPosition(open, triggerRef);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-filter-panel]")) return;
      if (t.closest("[data-funnel-trigger]")) return;
      onClose();
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div ref={panelRef} data-filter-panel className={popoverPanel} style={pos}>
      {children}
    </div>,
    document.body,
  );
}

type ProveedorRow = Pick<Proveedor, "id" | "nombre" | "telefono" | "categoria">;
type InsumoRow = Pick<Insumo, "id" | "nombre" | "unidadBase" | "categoria">;
type PlatoRow = Pick<Plato, "id" | "nombre" | "categoria" | "precioVenta" | "active">;

function HeaderWithFunnel({
  label,
  funnelActive,
  onFunnelClick,
  funnelRef,
}: {
  label: string;
  funnelActive: boolean;
  onFunnelClick: () => void;
  funnelRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="font-semibold">{label}</span>
      <button
        ref={funnelRef}
        data-funnel-trigger
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFunnelClick();
        }}
        className="shrink-0 rounded p-0.5 hover:bg-gray-100"
        aria-label={`Filtrar ${label}`}
      >
        <FunnelIcon className={funnelActive ? "text-[#1a6b3c]" : "text-gray-400"} />
      </button>
    </div>
  );
}

export function ProveedoresTable({ rows }: { rows: ProveedorRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ nombre: string; telefono: string; categoria: string } | null>(null);

  const [fNombre, setFNombre] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [catApplied, setCatApplied] = useState<Set<string>>(new Set());
  const [catDraft, setCatDraft] = useState<Set<string>>(new Set());
  const [catSearch, setCatSearch] = useState("");

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const refNombre = useRef<HTMLButtonElement | null>(null);
  const refTel = useRef<HTMLButtonElement | null>(null);
  const refCat = useRef<HTMLButtonElement | null>(null);

  const catOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(r.categoria?.trim() ? r.categoria.trim() : EMPTY_KEY);
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

  const funnelNombre = fNombre.trim() !== "";
  const funnelTel = fTelefono.trim() !== "";
  const funnelCat = catApplied.size > 0;

  const filteredProveedores = useMemo(() => {
    return rows.filter((s) => {
      if (!textIncludes(s.nombre, fNombre)) return false;
      if (!textIncludes(s.telefono ?? "", fTelefono)) return false;
      if (catApplied.size > 0) {
        const key = s.categoria?.trim() ? s.categoria.trim() : EMPTY_KEY;
        if (!catApplied.has(key)) return false;
      }
      return true;
    });
  }, [rows, fNombre, fTelefono, catApplied]);

  const openWithRef = (key: string) => {
    setOpenMenu((prev) => {
      if (prev === key) return null;
      if (key === "prov-categoria") {
        setCatDraft(new Set(catApplied));
        setCatSearch("");
      }
      return key;
    });
  };

  const closeMenu = useCallback(() => setOpenMenu(null), []);

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
      categoria: r.categoria ?? "",
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
    fd.set("categoria", draft.categoria);
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
    if (!openMenu) return null;
    const refMap: Record<string, React.RefObject<HTMLButtonElement | null>> = {
      "prov-nombre": refNombre,
      "prov-telefono": refTel,
      "prov-categoria": refCat,
    };
    const tr = refMap[openMenu] ?? refNombre;
    return (
      <FilterPopover open={!!openMenu} triggerRef={tr} onClose={closeMenu}>
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {renderPopover()}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[var(--foreground)]/70">
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Nombre"
                  funnelActive={funnelNombre}
                  onFunnelClick={() => openWithRef("prov-nombre")}
                  funnelRef={refNombre}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Teléfono"
                  funnelActive={funnelTel}
                  onFunnelClick={() => openWithRef("prov-telefono")}
                  funnelRef={refTel}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Categoría"
                  funnelActive={funnelCat}
                  onFunnelClick={() => openWithRef("prov-categoria")}
                  funnelRef={refCat}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProveedores.length === 0 ? (
              <tr>
                <td colSpan={4} className="border-b border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--foreground)]/60">
                  No se encontraron resultados para los filtros aplicados
                </td>
              </tr>
            ) : (
              filteredProveedores.map((s) => {
                const isEdit = editingId === s.id;
                return (
                  <tr key={s.id} className="text-[var(--foreground)]/90">
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
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
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
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
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <select
                          className={inlineField}
                          value={draft.categoria}
                          onChange={(e) => setDraft((d) => (d ? { ...d, categoria: e.target.value } : d))}
                        >
                          <option value="">Selecciona...</option>
                          {proveedorCategorias.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        (s.categoria ?? "—")
                      )}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
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
                          <form action={deleteSupplier} className="inline">
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmitButton
                              confirmMessage="¿Eliminar este proveedor? Esta acción no se puede deshacer."
                              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
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

export function InsumosTable({ rows }: { rows: InsumoRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    nombre: string;
    baseUnit: string;
    categoria: string;
  } | null>(null);

  const [fNombre, setFNombre] = useState("");
  const [unidadApplied, setUnidadApplied] = useState<Set<string>>(new Set());
  const [unidadDraft, setUnidadDraft] = useState<Set<string>>(new Set());
  const [unidadSearch, setUnidadSearch] = useState("");
  const [insCatApplied, setInsCatApplied] = useState<Set<string>>(new Set());
  const [insCatDraft, setInsCatDraft] = useState<Set<string>>(new Set());
  const [insCatSearch, setInsCatSearch] = useState("");

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const refNombre = useRef<HTMLButtonElement | null>(null);
  const refUnidad = useRef<HTMLButtonElement | null>(null);
  const refInsCat = useRef<HTMLButtonElement | null>(null);

  const unidadOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) keys.add(r.unidadBase);
    return Array.from(keys)
      .sort((a, b) =>
        (unitLabel.get(a as Insumo["unidadBase"]) ?? a).localeCompare(
          unitLabel.get(b as Insumo["unidadBase"]) ?? b,
          "es",
        ),
      )
      .map((value) => ({
        value,
        label: unitLabel.get(value as Insumo["unidadBase"]) ?? value,
      }));
  }, [rows]);

  const insumoCatOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(r.categoria?.trim() ? r.categoria.trim() : EMPTY_KEY);
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

  const funnelNombre = fNombre.trim() !== "";
  const funnelUnidad = unidadApplied.size > 0;
  const funnelInsCat = insCatApplied.size > 0;

  const filteredInsumos = useMemo(() => {
    return rows.filter((s) => {
      if (!textIncludes(s.nombre, fNombre)) return false;
      if (unidadApplied.size > 0 && !unidadApplied.has(s.unidadBase)) return false;
      if (insCatApplied.size > 0) {
        const key = s.categoria?.trim() ? s.categoria.trim() : EMPTY_KEY;
        if (!insCatApplied.has(key)) return false;
      }
      return true;
    });
  }, [rows, fNombre, unidadApplied, insCatApplied]);

  const openWithRef = (key: string) => {
    setOpenMenu((prev) => {
      if (prev === key) return null;
      if (key === "ins-unidad") {
        setUnidadDraft(new Set(unidadApplied));
        setUnidadSearch("");
      }
      if (key === "ins-categoria") {
        setInsCatDraft(new Set(insCatApplied));
        setInsCatSearch("");
      }
      return key;
    });
  };

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const beginEdit = useCallback((r: InsumoRow) => {
    setEditingId(r.id);
    setError(null);
    setDraft({
      nombre: r.nombre,
      baseUnit: r.unidadBase,
      categoria: r.categoria ?? "",
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
    fd.set("baseUnit", draft.baseUnit);
    fd.set("categoria", draft.categoria);
    startTransition(async () => {
      const res = await updateInsumo(fd);
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {openMenu ? (
        <FilterPopover
          open
          triggerRef={
            openMenu === "ins-nombre"
              ? refNombre
              : openMenu === "ins-unidad"
                ? refUnidad
                : refInsCat
          }
          onClose={closeMenu}
        >
          {openMenu === "ins-nombre" ? (
            <TextFilterMenu value={fNombre} onChange={setFNombre} onClear={() => setFNombre("")} />
          ) : null}
          {openMenu === "ins-unidad" ? (
            <CategoricalFilterMenu
              options={unidadOptions}
              draft={unidadDraft}
              setDraft={setUnidadDraft}
              optionSearch={unidadSearch}
              setOptionSearch={setUnidadSearch}
              onApply={() => {
                setUnidadApplied(new Set(unidadDraft));
                closeMenu();
              }}
              onClearDraft={() => setUnidadDraft(new Set())}
            />
          ) : null}
          {openMenu === "ins-categoria" ? (
            <CategoricalFilterMenu
              options={insumoCatOptions}
              draft={insCatDraft}
              setDraft={setInsCatDraft}
              optionSearch={insCatSearch}
              setOptionSearch={setInsCatSearch}
              onApply={() => {
                setInsCatApplied(new Set(insCatDraft));
                closeMenu();
              }}
              onClearDraft={() => setInsCatDraft(new Set())}
            />
          ) : null}
        </FilterPopover>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[var(--foreground)]/70">
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Nombre"
                  funnelActive={funnelNombre}
                  onFunnelClick={() => openWithRef("ins-nombre")}
                  funnelRef={refNombre}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Unidad base"
                  funnelActive={funnelUnidad}
                  onFunnelClick={() => openWithRef("ins-unidad")}
                  funnelRef={refUnidad}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Categoría"
                  funnelActive={funnelInsCat}
                  onFunnelClick={() => openWithRef("ins-categoria")}
                  funnelRef={refInsCat}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredInsumos.length === 0 ? (
              <tr>
                <td colSpan={4} className="border-b border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--foreground)]/60">
                  No se encontraron resultados para los filtros aplicados
                </td>
              </tr>
            ) : (
              filteredInsumos.map((s) => {
                const isEdit = editingId === s.id;
                return (
                  <tr key={s.id} className="text-[var(--foreground)]/90">
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
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
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <select
                          className={inlineField}
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
                      ) : (
                        (unitLabel.get(s.unidadBase) ?? s.unidadBase)
                      )}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <select
                          className={inlineField}
                          value={draft.categoria}
                          onChange={(e) => setDraft((d) => (d ? { ...d, categoria: e.target.value } : d))}
                        >
                          <option value="">Selecciona...</option>
                          {insumoCategorias.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        (s.categoria ?? "—")
                      )}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
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
                          <form action={deleteSupply} className="inline">
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmitButton
                              confirmMessage="¿Eliminar este insumo? Si está en recetas, puede fallar."
                              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
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
    categoria: string;
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
  const refNombre = useRef<HTMLButtonElement | null>(null);
  const refPlatoCat = useRef<HTMLButtonElement | null>(null);
  const refPrecio = useRef<HTMLButtonElement | null>(null);
  const refActivo = useRef<HTMLButtonElement | null>(null);

  const platoCatOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(r.categoria?.trim() ? r.categoria.trim() : EMPTY_KEY);
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
        const key = d.categoria?.trim() ? d.categoria.trim() : EMPTY_KEY;
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

  const openWithRef = (key: string) => {
    setOpenMenu((prev) => {
      if (prev === key) return null;
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

  const closeMenu = useCallback(() => setOpenMenu(null), []);

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
      categoria: r.categoria ?? "",
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
    fd.set("categoria", draft.categoria);
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

  const triggerRefPlatos =
    openMenu === "pla-nombre"
      ? refNombre
      : openMenu === "pla-categoria"
        ? refPlatoCat
        : openMenu === "pla-precio"
          ? refPrecio
          : openMenu === "pla-activo"
            ? refActivo
            : refNombre;

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {openMenu ? (
        <FilterPopover open triggerRef={triggerRefPlatos} onClose={closeMenu}>
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
          <thead>
            <tr className="text-[var(--foreground)]/70">
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Nombre"
                  funnelActive={funnelNombre}
                  onFunnelClick={() => openWithRef("pla-nombre")}
                  funnelRef={refNombre}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Categoría"
                  funnelActive={funnelPlatoCat}
                  onFunnelClick={() => openWithRef("pla-categoria")}
                  funnelRef={refPlatoCat}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Precio"
                  funnelActive={funnelPrecio}
                  onFunnelClick={() => openWithRef("pla-precio")}
                  funnelRef={refPrecio}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 text-right">
                <HeaderWithFunnel
                  label="Activo"
                  funnelActive={funnelActivo}
                  onFunnelClick={() => openWithRef("pla-activo")}
                  funnelRef={refActivo}
                />
              </th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlatos.length === 0 ? (
              <tr>
                <td colSpan={5} className="border-b border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--foreground)]/60">
                  No se encontraron resultados para los filtros aplicados
                </td>
              </tr>
            ) : (
              filteredPlatos.map((d) => {
                const isEdit = editingId === d.id;
                return (
                  <tr key={d.id} className="text-[var(--foreground)]/90">
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
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
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <select
                          className={inlineField}
                          value={draft.categoria}
                          onChange={(e) => setDraft((x) => (x ? { ...x, categoria: e.target.value } : x))}
                        >
                          <option value="">Selecciona...</option>
                          {platoCategorias.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        (d.categoria ?? "—")
                      )}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <PlatoPrecioInline
                          precioDigits={draft.precioDigits}
                          onDigitsChange={(digits) => setDraft((x) => (x ? { ...x, precioDigits: digits } : x))}
                        />
                      ) : (
                        money.format(Number(d.precioVenta))
                      )}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                      {isEdit && draft ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                            checked={draft.active}
                            onChange={(e) => setDraft((x) => (x ? { ...x, active: e.target.checked } : x))}
                          />
                          <span>{draft.active ? "Activo" : "Inactivo"}</span>
                        </label>
                      ) : d.active ? (
                        <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-[var(--foreground)]/70">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
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
                          <form action={deleteDish} className="inline">
                            <input type="hidden" name="id" value={d.id} />
                            <ConfirmSubmitButton
                              confirmMessage="¿Eliminar este plato? Si tiene receta, puede fallar."
                              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
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
