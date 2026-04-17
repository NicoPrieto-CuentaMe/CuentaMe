"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import type { CategoriaProveedor, Prisma, Unidad } from "@prisma/client";
import { useRouter } from "next/navigation";
import { editarCompra, eliminarCompra, getComprasCatalogoEdit } from "@/app/actions/compras";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "@/app/(main)/configuracion/cop-price";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";
import { getFamiliaUnidad, getUnidadesCompatibles } from "@/lib/unidades.config";

type Row = Prisma.CompraGetPayload<{
  include: {
    proveedor: { select: { nombre: true } };
    detalles: { include: { insumo: { select: { nombre: true } } } };
  };
}>;

type LineDraft = {
  insumoId: string;
  unidad: string;
  cantidad: string;
  totalPagadoDigits: string;
};

type CatalogProveedor = { id: string; nombre: string; categorias: CategoriaProveedor[] };
type CatalogInsumo = { id: string; nombre: string; unidadBase: Unidad; categoria: CategoriaProveedor | null };

function fechaToInput(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFecha(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const y = d.getUTCFullYear();
  return `${day}/${m}/${y}`;
}

function formatCop(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(x);
}

function formatCantidad(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(x);
}

function unidadLabel(u: string): string {
  return UNIT_OPTIONS.find((o) => o.value === u)?.label ?? u;
}

function insumosFiltrados(
  proveedorId: string,
  proveedores: CatalogProveedor[],
  insumos: CatalogInsumo[],
): CatalogInsumo[] {
  if (!proveedorId) return [];
  const p = proveedores.find((x) => x.id === proveedorId);
  if (!p || p.categorias.length === 0) return insumos;
  const set = new Set(p.categorias);
  return insumos.filter((i) => i.categoria != null && set.has(i.categoria));
}

function mergeDisponibles(base: CatalogInsumo[], insumoId: string | undefined, allInsumos: CatalogInsumo[]): CatalogInsumo[] {
  if (!insumoId) return base;
  if (base.some((x) => x.id === insumoId)) return base;
  const extra = allInsumos.find((x) => x.id === insumoId);
  return extra ? [...base, extra] : base;
}

function emptyLine(): LineDraft {
  return { insumoId: "", unidad: "", cantidad: "", totalPagadoDigits: "" };
}

/** Misma tabla Proveedores (Configuración) */
const btnEditRow =
  "rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border";
const btnDeleteRow =
  "rounded border border-danger/30 bg-danger-light px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20 hover:text-danger";
const btnSaveRow =
  "rounded bg-accent px-2 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60";
const btnCancelRow =
  "rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border";

const idle: ActionState = { ok: true };

function UnitHints({ unidadBase }: { unidadBase: Unidad }) {
  const familia = getFamiliaUnidad(unidadBase as string);
  if (!familia) return null;
  const list = getUnidadesCompatibles(unidadBase as string)
    .map((code) => UNIT_OPTIONS.find((u) => u.value === code)?.label ?? code)
    .join(", ");
  return (
    <p className="mt-1 text-[10px] leading-tight text-text-tertiary sm:text-xs">
      Unidades compatibles: {list}
    </p>
  );
}

export function ComprasTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [proveedores, setProveedores] = useState<CatalogProveedor[]>([]);
  const [insumosCat, setInsumosCat] = useState<CatalogInsumo[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    fecha: string;
    proveedorId: string;
    notas: string;
    lines: LineDraft[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getComprasCatalogoEdit().then((r) => {
      if (r.ok) {
        setProveedores(r.proveedores);
        setInsumosCat(r.insumos);
      }
    });
  }, []);

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = useCallback((c: Row) => {
    setEditingId(c.id);
    setDeleteId(null);
    setOpen((prev) => new Set(prev).add(c.id));
    setDraft({
      fecha: fechaToInput(c.fecha),
      proveedorId: c.proveedorId,
      notas: c.notas?.trim() ?? "",
      lines: c.detalles.map((d) => ({
        insumoId: d.insumoId,
        unidad: d.unidad,
        cantidad: String(d.cantidad),
        totalPagadoDigits: precioVentaToDigits(d.total),
      })),
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId || !draft) return;
    const lineasJson = JSON.stringify(
      draft.lines.map((l) => ({
        insumoId: l.insumoId,
        cantidad: l.cantidad,
        unidad: l.unidad,
        total: digitsToSalePriceString(l.totalPagadoDigits),
      })),
    );
    const fd = new FormData();
    fd.set("compraId", editingId);
    fd.set("fecha", draft.fecha);
    fd.set("proveedorId", draft.proveedorId);
    fd.set("notas", draft.notas);
    fd.set("lineas", lineasJson);
    startTransition(async () => {
      const res = await editarCompra(idle, fd);
      if (res.ok) {
        setEditingId(null);
        setDraft(null);
        router.refresh();
      }
    });
  }, [editingId, draft, router]);

  const confirmDelete = useCallback(
    (compraId: string) => {
      const fd = new FormData();
      fd.set("compraId", compraId);
      startTransition(async () => {
        const res = await eliminarCompra(idle, fd);
        if (res.ok) {
          setDeleteId(null);
          setOpen((prev) => {
            const n = new Set(prev);
            n.delete(compraId);
            return n;
          });
          router.refresh();
        }
      });
    },
    [router],
  );

  const draftTotal = useMemo(() => {
    if (!draft) return 0;
    let s = 0;
    for (const l of draft.lines) {
      const t = Number(digitsToSalePriceString(l.totalPagadoDigits));
      if (Number.isFinite(t) && t > 0) s += t;
    }
    return s;
  }, [draft]);

  const disponiblesEdit = useMemo(
    () => insumosFiltrados(draft?.proveedorId ?? "", proveedores, insumosCat),
    [draft?.proveedorId, proveedores, insumosCat],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no hay compras registradas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[740px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="pb-2 pr-3 font-semibold">Fecha</th>
            <th className="pb-2 pr-3 font-semibold">Proveedor</th>
            <th className="pb-2 pr-3 font-semibold">Items</th>
            <th className="pb-2 pr-3 font-semibold">Total</th>
            <th className="pb-2 pr-3 font-semibold">Notas</th>
            <th className="pb-2 pr-2 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-text-primary">
          {rows.map((c) => {
            const expanded = open.has(c.id);
            const nItems = c.detalles.length;
            const isEditing = editingId === c.id && draft;
            const todayMax = todayLocalISO();
            const canToggleDetail = !isEditing && deleteId !== c.id;

            return (
              <Fragment key={c.id}>
                <tr className="align-top">
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(c.id),
                          className: "cursor-pointer py-2 pr-3 align-middle",
                        }
                      : { className: "py-2 pr-3 align-middle" })}
                  >
                    {isEditing ? (
                      <input
                        type="date"
                        max={todayMax}
                        value={draft!.fecha}
                        onChange={(e) => setDraft((d) => (d ? { ...d, fecha: e.target.value } : d))}
                        className="w-full min-w-[8rem] rounded border border-border bg-surface-elevated px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="whitespace-nowrap">{formatFecha(c.fecha)}</span>
                    )}
                  </td>
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(c.id),
                          className: "cursor-pointer py-2 pr-3 align-middle",
                        }
                      : { className: "py-2 pr-3 align-middle" })}
                  >
                    {isEditing ? (
                      <select
                        value={draft!.proveedorId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  proveedorId: pid,
                                  lines: [emptyLine()],
                                }
                              : d,
                          );
                        }}
                        className="w-full min-w-[10rem] rounded border border-border bg-surface-elevated px-2 py-1 text-sm"
                      >
                        {proveedores.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{c.proveedor.nombre}</span>
                    )}
                  </td>
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(c.id),
                          className: "cursor-pointer py-2 pr-3 align-middle tabular-nums",
                        }
                      : { className: "py-2 pr-3 align-middle tabular-nums" })}
                  >
                    {isEditing ? `${draft!.lines.length} ítems` : nItems}
                  </td>
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(c.id),
                          className: "cursor-pointer py-2 pr-3 align-middle font-medium whitespace-nowrap",
                        }
                      : { className: "py-2 pr-3 align-middle font-medium whitespace-nowrap" })}
                  >
                    {isEditing ? formatCop(draftTotal) : formatCop(c.total)}
                  </td>
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(c.id),
                          className: "max-w-[220px] cursor-pointer py-2 align-middle text-text-secondary",
                        }
                      : { className: "max-w-[220px] py-2 align-middle text-text-secondary" })}
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        maxLength={500}
                        value={draft!.notas}
                        onChange={(e) => setDraft((d) => (d ? { ...d, notas: e.target.value } : d))}
                        className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-text-primary"
                        placeholder="Opcional"
                      />
                    ) : (
                      <span className="break-words text-text-secondary">{c.notas?.trim() ? c.notas : "—"}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    {deleteId === c.id ? (
                      <div className="flex max-w-[min(100%,18rem)] flex-col gap-2">
                        <p className="text-xs leading-snug text-danger">
                          ¿Eliminar este registro? Esta acción no se puede deshacer.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => confirmDelete(c.id)}
                            disabled={pending}
                            className={btnDeleteRow}
                          >
                            Confirmar eliminación
                          </button>
                          <button type="button" onClick={() => setDeleteId(null)} disabled={pending} className={btnCancelRow}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : isEditing ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={saveEdit} disabled={pending} className={btnSaveRow}>
                          Guardar
                        </button>
                        <button type="button" onClick={cancelEdit} disabled={pending} className={btnCancelRow}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => startEdit(c)} className={btnEditRow}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteId(c.id);
                            setEditingId(null);
                            setDraft(null);
                          }}
                          className={btnDeleteRow}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-surface-elevated/40">
                    <td className="pb-3 pt-0 pr-3" colSpan={6}>
                      <div className="rounded-lg border border-border/80 p-3">
                        {isEditing && draft ? (
                          <CompraLineEditor
                            draft={draft}
                            setDraft={setDraft}
                            insumosCat={insumosCat}
                            disponiblesBase={disponiblesEdit}
                          />
                        ) : (
                          <>
                            <table className="w-full min-w-[520px] text-sm">
                              <thead>
                                <tr className="border-b border-border text-xs text-text-secondary">
                                  <th className="pb-2 pr-2 text-left font-medium">Insumo</th>
                                  <th className="pb-2 pr-2 text-left font-medium">Cantidad</th>
                                  <th className="pb-2 pr-2 text-left font-medium">Precio unitario</th>
                                  <th className="pb-2 text-left font-medium">Total línea</th>
                                </tr>
                              </thead>
                              <tbody className="text-text-primary">
                                {c.detalles.map((d) => (
                                  <tr key={d.id} className="border-b border-border/60 last:border-0">
                                    <td className="py-2 pr-2 align-top">{d.insumo.nombre}</td>
                                    <td className="py-2 pr-2 whitespace-nowrap">
                                      {formatCantidad(d.cantidad)} {unidadLabel(d.unidad)}
                                    </td>
                                    <td className="py-2 pr-2 whitespace-nowrap">{formatCop(d.precioUnitario)}</td>
                                    <td className="py-2 font-medium whitespace-nowrap">{formatCop(d.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompraLineEditor({
  draft,
  setDraft,
  insumosCat,
  disponiblesBase,
}: {
  draft: { fecha: string; proveedorId: string; notas: string; lines: LineDraft[] };
  setDraft: Dispatch<
    SetStateAction<{ fecha: string; proveedorId: string; notas: string; lines: LineDraft[] } | null>
  >;
  insumosCat: CatalogInsumo[];
  disponiblesBase: CatalogInsumo[];
}) {
  function setLine(i: number, patch: Partial<LineDraft>) {
    setDraft((d) => {
      if (!d) return d;
      const next = d.lines.map((row, j) => (j === i ? { ...row, ...patch } : row));
      return { ...d, lines: next };
    });
  }

  function addLine() {
    setDraft((d) => (d && d.lines.length < 20 ? { ...d, lines: [...d.lines, emptyLine()] } : d));
  }

  function removeLine(i: number) {
    setDraft((d) => (d && d.lines.length > 1 ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d));
  }

  const totalGeneralFmt = useMemo(() => {
    let sum = 0;
    for (const l of draft.lines) {
      const t = Number(digitsToSalePriceString(l.totalPagadoDigits));
      if (Number.isFinite(t) && t > 0) sum += t;
    }
    if (sum <= 0) return "—";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(sum);
  }, [draft.lines]);

  return (
    <div className="space-y-4">
      <div className="space-y-4 overflow-x-auto pb-1">
        {draft.lines.map((line, i) => {
          const disponibles = mergeDisponibles(disponiblesBase, line.insumoId, insumosCat);
          const insumoSel = disponibles.find((x) => x.id === line.insumoId);
          const unitOpts = insumoSel
            ? UNIT_OPTIONS.filter((u) => getUnidadesCompatibles(insumoSel.unidadBase as string).includes(u.value))
            : [];
          const totalFmt = formatCopFromDigits(line.totalPagadoDigits);
          const qty = Number(String(line.cantidad).replace(",", "."));
          const totalN = Number(digitsToSalePriceString(line.totalPagadoDigits));
          const unidadLbl = line.unidad ? UNIT_OPTIONS.find((u) => u.value === line.unidad)?.label ?? line.unidad : "";
          const precioUnitarioHint =
            Number.isFinite(qty) && qty > 0 && Number.isFinite(totalN) && totalN > 0 && line.unidad
              ? (() => {
                  const pu = totalN / qty;
                  const cop = new Intl.NumberFormat("es-CO", {
                    style: "currency",
                    currency: "COP",
                    maximumFractionDigits: 0,
                  }).format(pu);
                  return `≈ ${cop} / ${unidadLbl}`;
                })()
              : null;

          return (
            <div
              key={i}
              className="min-w-[min(100%,720px)] rounded-lg border border-border bg-surface-elevated/50 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-tertiary">Línea {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={draft.lines.length <= 1}
                  className="rounded px-2 py-0.5 text-lg leading-none text-text-tertiary hover:bg-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Eliminar línea"
                >
                  ×
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                <div className="lg:col-span-3">
                  <label className="text-xs font-medium text-text-secondary">Insumo *</label>
                  <select
                    value={line.insumoId}
                    onChange={(e) => {
                      const v = e.target.value;
                      const ins = disponibles.find((x) => x.id === v);
                      setLine(i, { insumoId: v, unidad: ins ? ins.unidadBase : "" });
                    }}
                    required
                    disabled={!draft.proveedorId}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="" disabled>
                      {draft.proveedorId ? "Selecciona…" : "Elige proveedor primero"}
                    </option>
                    {disponibles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="text-xs font-medium text-text-secondary">Unidad *</label>
                  <select
                    value={line.unidad}
                    onChange={(e) => setLine(i, { unidad: e.target.value })}
                    required
                    disabled={!insumoSel || unitOpts.length === 0}
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-60"
                  >
                    <option value="" disabled>
                      {insumoSel ? "Selecciona…" : "—"}
                    </option>
                    {unitOpts.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  {insumoSel ? <UnitHints unidadBase={insumoSel.unidadBase} /> : null}
                </div>
                <div className="lg:col-span-2">
                  <label className="text-xs font-medium text-text-secondary">Cantidad *</label>
                  <input
                    inputMode="decimal"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.cantidad}
                    onChange={(e) => setLine(i, { cantidad: e.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="text-xs font-medium text-text-secondary">Total pagado *</label>
                  <input
                    inputMode="numeric"
                    value={totalFmt}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d]/g, "");
                      setLine(i, { totalPagadoDigits: digits });
                    }}
                    required
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    placeholder="Ej: 45000"
                  />
                </div>
                <div className="lg:col-span-2 lg:flex lg:min-h-[72px] lg:flex-col lg:justify-end">
                  <span className="text-xs font-medium text-text-tertiary">Precio unitario (calculado)</span>
                  <p className="mt-1 text-sm leading-snug text-text-secondary">{precioUnitarioHint ?? "—"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addLine}
        disabled={draft.lines.length >= 20}
        className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
      >
        Agregar insumo
      </button>
      <div className="border-t border-border pt-3">
        <span className="text-sm font-medium text-text-secondary">Total general</span>
        <div className="mt-1 text-lg font-semibold text-text-primary">{totalGeneralFmt}</div>
      </div>
    </div>
  );
}
