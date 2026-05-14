"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
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

/** Misma tabla Proveedores (Configuración) — usada en CompraLineEditor */

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

  const [visibleCount, setVisibleCount] = useState(10);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    getComprasCatalogoEdit().then((r) => {
      if (r.ok) {
        setProveedores(r.proveedores);
        setInsumosCat(r.insumos);
      }
    });
  }, []);

  const startEdit = useCallback((c: Row) => {
    setEditingId(c.id);
    setDeleteId(null);
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

  const filtradas = useMemo(() => rows, [rows]);

  const filtradasPorColumna = useMemo(() => filtradas, [filtradas]);

  const ordenadas = useMemo(() => {
    if (!sortColumn) return filtradasPorColumna;
    const arr = [...filtradasPorColumna];
    const m = sortDirection === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortColumn) {
        case "fecha":
          return (a.fecha.getTime() - b.fecha.getTime()) * m;
        case "proveedor":
          return a.proveedor.nombre.localeCompare(b.proveedor.nombre, "es") * m;
        case "total":
          return (Number(a.total) - Number(b.total)) * m;
        case "notas": {
          const na = a.notas?.trim() ?? "";
          const nb = b.notas?.trim() ?? "";
          if (na === "" && nb === "") return 0;
          if (na === "") return 1 * m;
          if (nb === "") return -1 * m;
          return na.localeCompare(nb, "es") * m;
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [filtradasPorColumna, sortColumn, sortDirection]);

  const aMostrar = useMemo(() => ordenadas.slice(0, visibleCount), [ordenadas, visibleCount]);

  const onSort = useCallback((key: string, dir: "asc" | "desc") => {
    setSortColumn(key);
    setSortDirection(dir);
    setVisibleCount(10);
  }, []);

  if (rows.length === 0) {
    return (
      <p style={{ padding: "24px 20px", font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>Aún no hay compras registradas.</p>
    );
  }

  const sortHeaderCols = [
    { label: "Fecha", key: "fecha", flex: "0 0 110px", noSort: false },
    { label: "Proveedor", key: "proveedor", flex: "1 1 0", noSort: false },
    { label: "Ítems", key: "items", flex: "0 0 60px", noSort: true },
    { label: "Total", key: "total", flex: "0 0 120px", noSort: false },
    { label: "Notas", key: "notas", flex: "0 0 200px", noSort: false },
    { label: "Acciones", key: "acciones", flex: "0 0 160px", noSort: true },
  ] as const;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 20px",
              background: "rgba(255,255,255,0.015)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              position: "sticky",
              top: 0,
              zIndex: 2,
              backdropFilter: "blur(8px)",
              flexShrink: 0,
            }}
        >
          {sortHeaderCols.map((col) => (
              <div
                key={col.key}
                style={{
                  flex: col.flex,
                  display: "flex",
                  justifyContent: col.key === "acciones" ? "flex-end" : "flex-start",
                }}
              >
                {col.noSort ? (
                  <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                    {col.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const nextDir = sortColumn === col.key ? (sortDirection === "asc" ? "desc" : "asc") : "asc";
                      onSort(col.key, nextDir);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      height: 26,
                      padding: "0 8px",
                      background: sortColumn === col.key ? "rgba(113,112,255,0.10)" : "transparent",
                      border: "1px solid",
                      borderColor: sortColumn === col.key ? "rgba(113,112,255,0.20)" : "transparent",
                      borderRadius: 6,
                      color: sortColumn === col.key ? "#a4adff" : "#8a8f98",
                      font: "510 11px/1 Inter,sans-serif",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {col.label}
                    {sortColumn === col.key && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        {sortDirection === "asc" ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
                      </svg>
                    )}
                  </button>
                )}
              </div>
            ))}
        </div>

        {aMostrar.map((c) => {
            const isDel = deleteId === c.id;
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: isDel ? "rgba(224,82,82,0.06)" : "transparent",
                  transition: "background 150ms",
                }}
              >
                <div style={{ flex: "0 0 110px" }}>
                  <span style={{ font: "400 13px/1 Inter,sans-serif", color: "#d0d6e0", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {formatFecha(c.fecha)}
                  </span>
                </div>
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8" }}>{c.proveedor.nombre}</span>
                </div>
                <div style={{ flex: "0 0 60px" }}>
                  <span style={{ font: "400 13px/1 Inter,sans-serif", color: "#d0d6e0", fontVariantNumeric: "tabular-nums" }}>{c.detalles.length}</span>
                </div>
                <div style={{ flex: "0 0 120px" }}>
                  <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8", fontVariantNumeric: "tabular-nums" }}>{formatCop(c.total)}</span>
                </div>
                <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                  <span
                    style={{
                      font: "400 12px/1.3 Inter,sans-serif",
                      color: "#8a8f98",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {c.notas?.trim() || "—"}
                  </span>
                </div>
                <div style={{ flex: "0 0 160px", display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  {isDel ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setDeleteId(null)}
                        disabled={pending}
                        style={{
                          height: 28,
                          padding: "0 10px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 6,
                          color: "#d0d6e0",
                          font: "510 12px/1 Inter,sans-serif",
                          cursor: pending ? "not-allowed" : "pointer",
                          opacity: pending ? 0.6 : 1,
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => confirmDelete(c.id)}
                        style={{
                          height: 28,
                          padding: "0 10px",
                          background: "rgba(224,82,82,0.22)",
                          border: "1px solid rgba(224,82,82,0.4)",
                          borderRadius: 6,
                          color: "#ff8585",
                          font: "510 12px/1 Inter,sans-serif",
                          cursor: pending ? "not-allowed" : "pointer",
                          opacity: pending ? 0.6 : 1,
                        }}
                      >
                        Confirmar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          height: 28,
                          padding: "0 10px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 6,
                          color: "#d0d6e0",
                          font: "510 12px/1 Inter,sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteId(c.id);
                          setEditingId(null);
                          setDraft(null);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          height: 28,
                          padding: "0 10px",
                          background: "rgba(224,82,82,0.14)",
                          border: "1px solid rgba(224,82,82,0.30)",
                          borderRadius: 6,
                          color: "#ff8585",
                          font: "510 12px/1 Inter,sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
        })}

        {filtradasPorColumna.length > 0 && ordenadas.length > visibleCount ? (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + 10)}
              style={{
                width: "100%",
                padding: "10px 0",
                background: "transparent",
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                color: "#8a8f98",
                font: "510 12px/1 Inter,sans-serif",
                cursor: "pointer",
              }}
            >
              Ver {Math.min(10, ordenadas.length - visibleCount)} más
            </button>
        ) : null}
      </div>

      {ordenadas.length > 0 ? (
        <p style={{ margin: "8px 20px 0", textAlign: "center", font: "400 11px/1 Inter,sans-serif", color: "#62666d" }}>
          Mostrando {aMostrar.length} de {ordenadas.length} compras
        </p>
      ) : null}

      {typeof window !== "undefined" &&
        editingId &&
        draft &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
            <div onClick={cancelEdit} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(600px,100vw)",
                background: "#0c0d0e",
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                boxShadow: "-24px 0 60px rgba(0,0,0,0.6)",
              }}
            >
              <div
                style={{
                  padding: "20px 22px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                <div>
                  <p style={{ font: "590 10px/1 Inter,sans-serif", color: "#7170ff", letterSpacing: "1.2px", textTransform: "uppercase", margin: 0 }}>
                    EDITANDO COMPRA
                  </p>
                  <h2 style={{ font: "590 18px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.3px", margin: "6px 0 0" }}>
                    {proveedores.find((p) => p.id === draft.proveedorId)?.nombre ?? "Compra"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: "#d0d6e0",
                    font: "510 12px/1 Inter,sans-serif",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Cerrar
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>Fecha</label>
                    <input
                      type="date"
                      max={todayLocalISO()}
                      value={draft.fecha}
                      onChange={(e) => setDraft((d) => (d ? { ...d, fecha: e.target.value } : d))}
                      style={{
                        width: "100%",
                        height: 36,
                        padding: "0 10px",
                        background: "rgba(0,0,0,0.30)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 8,
                        color: "#f7f8f8",
                        font: "510 13px/1 Inter,sans-serif",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>Proveedor</label>
                    <select
                      value={draft.proveedorId}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, proveedorId: e.target.value, lines: [emptyLine()] } : d))
                      }
                      style={{
                        width: "100%",
                        height: 36,
                        padding: "0 10px",
                        background: "rgba(0,0,0,0.30)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 8,
                        color: "#f7f8f8",
                        font: "510 13px/1 Inter,sans-serif",
                        outline: "none",
                      }}
                    >
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>Notas</label>
                    <input
                      type="text"
                      maxLength={500}
                      value={draft.notas}
                      onChange={(e) => setDraft((d) => (d ? { ...d, notas: e.target.value } : d))}
                      placeholder="Opcional"
                      style={{
                        width: "100%",
                        height: 36,
                        padding: "0 10px",
                        background: "rgba(0,0,0,0.30)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 8,
                        color: "#f7f8f8",
                        font: "510 13px/1 Inter,sans-serif",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.5px", textTransform: "uppercase" }}>Insumos</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => (d && d.lines.length < 20 ? { ...d, lines: [...d.lines, emptyLine()] } : d))
                      }
                      disabled={draft.lines.length >= 20}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        height: 28,
                        padding: "0 10px",
                        background: draft.lines.length >= 20 ? "rgba(255,255,255,0.04)" : "rgba(113,112,255,0.10)",
                        border: "1px solid rgba(113,112,255,0.25)",
                        borderRadius: 7,
                        color: draft.lines.length >= 20 ? "#62666d" : "#a4adff",
                        font: "510 12px/1 Inter,sans-serif",
                        cursor: draft.lines.length >= 20 ? "not-allowed" : "pointer",
                        opacity: draft.lines.length >= 20 ? 0.5 : 1,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Agregar
                    </button>
                  </div>
                  <CompraLineEditor draft={draft} setDraft={setDraft} insumosCat={insumosCat} disponiblesBase={disponiblesEdit} />
                </div>

                <div style={{ padding: "12px 14px", background: "rgba(94,106,210,0.06)", border: "1px solid rgba(113,112,255,0.20)", borderRadius: 10 }}>
                  <span style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.8px", textTransform: "uppercase" }}>Total</span>
                  <p style={{ font: "590 20px/1.2 Inter,sans-serif", color: "#f7f8f8", margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{formatCop(draftTotal)}</p>
                </div>
              </div>

              <div style={{ padding: "14px 22px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={pending}
                  style={{
                    flex: 1,
                    height: 42,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    color: "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: pending ? "not-allowed" : "pointer",
                    opacity: pending ? 0.7 : 1,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={pending}
                  style={{
                    flex: 2,
                    height: 42,
                    background: "linear-gradient(180deg,#6b78de,#5e6ad2)",
                    border: "1px solid rgba(113,112,255,0.5)",
                    borderRadius: 10,
                    color: "#fff",
                    font: "590 13px/1 Inter,sans-serif",
                    cursor: pending ? "not-allowed" : "pointer",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 14px rgba(94,106,210,0.3)",
                    opacity: pending ? 0.7 : 1,
                  }}
                >
                  {pending ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function ComprasTableWrapper({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 32,
            padding: "0 12px",
            background: open ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.03)",
            border: "1px solid",
            borderColor: open ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)",
            borderRadius: 8,
            color: open ? "#a4adff" : "#d0d6e0",
            font: "510 12px/1 Inter,sans-serif",
            cursor: "pointer",
            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          Últimas compras
          <span
            style={{
              font: "510 11px/1 Inter,sans-serif",
              color: open ? "#a4adff" : "#8a8f98",
              background: open ? "rgba(113,112,255,0.20)" : "rgba(255,255,255,0.05)",
              padding: "3px 7px",
              borderRadius: 999,
              minWidth: 20,
              textAlign: "center",
            }}
          >
            {rows.length}
          </span>
        </button>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 80,
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.16,1,0.3,1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "65vh",
          background: "#0c0d0e",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ font: "590 15px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.2px" }}>Últimas compras</span>
            <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 999 }}>
              {rows.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#8a8f98",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <ComprasTable rows={rows} />
        </div>
      </div>
    </>
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
