"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Unidad } from "@prisma/client";
import { useRouter } from "next/navigation";
import { editarInventario, eliminarInventario } from "@/app/actions/inventario";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

export type InventarioHistorialRow = {
  id: string;
  fecha: Date;
  stockReal: number;
  notas: string | null;
  insumo: { nombre: string; unidadBase: Unidad };
};

function fechaKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fechaToInputString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFechaEncabezado(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function formatFechaCelda(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function unitLabel(u: Unidad): string {
  return UNIT_OPTIONS.find((x) => x.value === u)?.label ?? u;
}

function formatStock(n: number): string {
  const num = n;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(num);
}

function notasCelda(row: InventarioHistorialRow): string {
  return row.notas?.trim() ? row.notas : "—";
}

function stockToInputString(n: number): string {
  return String(n);
}

function groupByFecha(rows: InventarioHistorialRow[]): { fecha: Date; items: InventarioHistorialRow[] }[] {
  const map = new Map<string, InventarioHistorialRow[]>();
  for (const r of rows) {
    const k = fechaKeyUtc(r.fecha);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return keys.map((k) => {
    const items = map.get(k)!;
    const fecha = items[0]!.fecha;
    items.sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre, "es"));
    return { fecha, items };
  });
}

const idle: ActionState = { ok: true };

type ItemInventarioPlano = {
  row: InventarioHistorialRow;
  grupoFecha: Date;
  grupoLabel: string;
};

function labelGrupoDesdeFecha(fecha: Date): string {
  const t = formatFechaEncabezado(fecha);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function reagruparItemsVisiblesPorFecha(vis: ItemInventarioPlano[]): {
  key: string;
  label: string;
  fecha: Date;
  filas: InventarioHistorialRow[];
}[] {
  const orderKeys: string[] = [];
  const map = new Map<string, { label: string; fecha: Date; filas: ItemInventarioPlano[] }>();
  for (const p of vis) {
    const k = fechaKeyUtc(p.row.fecha);
    if (!map.has(k)) {
      orderKeys.push(k);
      map.set(k, { label: p.grupoLabel, fecha: p.grupoFecha, filas: [] });
    }
    map.get(k)!.filas.push(p);
  }
  return orderKeys.map((k) => {
    const b = map.get(k)!;
    return { key: k, label: b.label, fecha: b.fecha, filas: b.filas.map((x) => x.row) };
  });
}

export function InventarioHistorial({ rows }: { rows: InventarioHistorialRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ fecha: string; stockReal: string; notas: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [busquedaInsumoGlobal, setBusquedaInsumoGlobal] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<"stock" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const noopSort = useCallback((_: string, __: "asc" | "desc") => {}, []);

  useEffect(() => {
    setVisibleCount(10);
  }, [busquedaInsumoGlobal, columnSearch, sortColumn, sortDirection]);

  const onSearchInventario = useCallback((key: string, value: string) => {
    if (key === "stock") return;
    setColumnSearch((p) => ({ ...p, [key]: value }));
  }, []);

  const onSortInventario = useCallback((key: string, dir: "asc" | "desc") => {
    if (key !== "stock") return;
    setSortColumn("stock");
    setSortDirection(dir);
  }, []);

  const startEdit = useCallback((row: InventarioHistorialRow) => {
    setEditingId(row.id);
    setDeleteId(null);
    setDraft({
      fecha: fechaToInputString(row.fecha),
      stockReal: stockToInputString(row.stockReal),
      notas: row.notas?.trim() ?? "",
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(null);
  }, []);

  const saveEdit = useCallback(
    (registroId: string) => {
      if (!draft) return;
      const fd = new FormData();
      fd.set("registroId", registroId);
      fd.set("fecha", draft.fecha);
      fd.set("stockReal", draft.stockReal);
      fd.set("notas", draft.notas);
      startTransition(async () => {
        const res = await editarInventario(idle, fd);
        if (res.ok) {
          setEditingId(null);
          setDraft(null);
          router.refresh();
        }
      });
    },
    [draft, router],
  );

  const confirmDelete = useCallback(
    (registroId: string) => {
      const fd = new FormData();
      fd.set("registroId", registroId);
      startTransition(async () => {
        const res = await eliminarInventario(idle, fd);
        if (res.ok) {
          setDeleteId(null);
          router.refresh();
        }
      });
    },
    [router],
  );

  const filasTrasInsumoGlobal = useMemo(() => {
    const q = busquedaInsumoGlobal.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.insumo.nombre.toLowerCase().includes(q));
  }, [rows, busquedaInsumoGlobal]);

  const filtradasPorColumna = useMemo(() => {
    return filasTrasInsumoGlobal.filter((row) => {
      const qI = (columnSearch.insumo ?? "").trim().toLowerCase();
      if (qI && !row.insumo.nombre.toLowerCase().includes(qI)) return false;
      const qN = (columnSearch.notas ?? "").trim().toLowerCase();
      if (qN && !notasCelda(row).toLowerCase().includes(qN)) return false;
      return true;
    });
  }, [filasTrasInsumoGlobal, columnSearch]);

  const grupos = useMemo(() => groupByFecha(filtradasPorColumna), [filtradasPorColumna]);

  const itemsPlanos = useMemo((): ItemInventarioPlano[] => {
    const planos: ItemInventarioPlano[] = grupos.flatMap((g) => {
      const grupoLabel = labelGrupoDesdeFecha(g.fecha);
      return g.items.map((row) => ({
        row,
        grupoFecha: g.fecha,
        grupoLabel,
      }));
    });
    if (sortColumn !== "stock") return planos;
    const m = sortDirection === "asc" ? 1 : -1;
    return [...planos].sort(
      (a, b) => (a.row.stockReal - b.row.stockReal) * m,
    );
  }, [grupos, sortColumn, sortDirection]);

  return (
    <>
      {rows.length === 0 ? (
        <p style={{ padding: "24px 20px", font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>Aún no hay conteos registrados.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <div style={{ position: "relative", maxWidth: 320 }}>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#62666d",
                  pointerEvents: "none",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={busquedaInsumoGlobal}
                onChange={(e) => setBusquedaInsumoGlobal(e.target.value)}
                placeholder="Buscar por insumo..."
                style={{
                  width: "100%",
                  height: 32,
                  padding: "0 10px 0 32px",
                  background: "rgba(0,0,0,0.30)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8,
                  color: "#f7f8f8",
                  font: "510 12px/1 Inter,sans-serif",
                  outline: "none",
                }}
              />
            </div>
          </div>

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
            {[
              { label: "Fecha", flex: "0 0 110px" },
              { label: "Insumo", flex: "1 1 0" },
              { label: "Stock registrado", flex: "0 0 130px" },
              { label: "Unidad", flex: "0 0 100px" },
              { label: "Notas", flex: "0 0 160px" },
              { label: "Acciones", flex: "0 0 160px" },
            ].map((col) => (
              <div
                key={col.label}
                style={{
                  flex: col.flex,
                  display: "flex",
                  justifyContent: col.label === "Acciones" ? "flex-end" : "flex-start",
                }}
              >
                <span
                  style={{
                    font: "510 11px/1 Inter,sans-serif",
                    color: "#8a8f98",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                  }}
                >
                  {col.label}
                </span>
              </div>
            ))}
          </div>

          {itemsPlanos.length === 0 ? (
            <p style={{ padding: "20px", font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>No hay conteos que coincidan.</p>
          ) : (
            reagruparItemsVisiblesPorFecha(itemsPlanos.slice(0, visibleCount)).map((bloque) => (
              <div key={bloque.key}>
                <div style={{ padding: "8px 20px", background: "rgba(255,255,255,0.01)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ font: "590 12px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "-0.1px" }}>
                    {bloque.label} · {bloque.filas.length}{" "}
                    {bloque.filas.length === 1 ? "insumo contado" : "insumos contados"}
                  </span>
                </div>
                {bloque.filas.map((row) => {
                  const isDel = deleteId === row.id;
                  return (
                    <div
                      key={row.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 20px",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: isDel ? "rgba(224,82,82,0.06)" : "transparent",
                        transition: "background 150ms",
                      }}
                    >
                      <div style={{ flex: "0 0 110px" }}>
                        <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#d0d6e0", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {formatFechaCelda(row.fecha)}
                        </span>
                      </div>
                      <div style={{ flex: "1 1 0" }}>
                        <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8" }}>{row.insumo.nombre}</span>
                      </div>
                      <div style={{ flex: "0 0 130px" }}>
                        <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8", fontVariantNumeric: "tabular-nums" }}>{formatStock(row.stockReal)}</span>
                      </div>
                      <div style={{ flex: "0 0 100px" }}>
                        <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#d0d6e0" }}>{unitLabel(row.insumo.unidadBase)}</span>
                      </div>
                      <div style={{ flex: "0 0 160px" }}>
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
                          {row.notas?.trim() || "—"}
                        </span>
                      </div>
                      <div style={{ flex: "0 0 160px", display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        {isDel ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setDeleteId(null)}
                              style={{
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
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => confirmDelete(row.id)}
                              style={{
                                height: 28,
                                padding: "0 10px",
                                background: "rgba(224,82,82,0.22)",
                                border: "1px solid rgba(224,82,82,0.4)",
                                borderRadius: 6,
                                color: "#ff8585",
                                font: "510 12px/1 Inter,sans-serif",
                                cursor: "pointer",
                              }}
                            >
                              Confirmar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
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
                                setDeleteId(row.id);
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
              </div>
            ))
          )}

          {itemsPlanos.length > visibleCount && (
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
              Ver {Math.min(10, itemsPlanos.length - visibleCount)} más
            </button>
          )}
        </div>
      )}

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
                width: "min(440px,100vw)",
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
                  <p
                    style={{
                      font: "590 10px/1 Inter,sans-serif",
                      color: "#7170ff",
                      letterSpacing: "1.2px",
                      textTransform: "uppercase",
                      margin: 0,
                    }}
                  >
                    EDITANDO CONTEO
                  </p>
                  <h2 style={{ font: "590 18px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.3px", margin: "6px 0 0" }}>
                    {rows.find((r) => r.id === editingId)?.insumo.nombre ?? "Insumo"}
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
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ font: "590 13px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Fecha</span>
                  <input
                    type="date"
                    value={draft.fecha}
                    onChange={(e) => setDraft((d) => (d ? { ...d, fecha: e.target.value } : d))}
                    style={{
                      height: 38,
                      padding: "0 12px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8,
                      color: "#f7f8f8",
                      font: "510 13px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  />
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ font: "590 13px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Stock real</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    max="9999"
                    value={draft.stockReal}
                    onChange={(e) => setDraft((d) => (d ? { ...d, stockReal: e.target.value } : d))}
                    style={{
                      height: 38,
                      padding: "0 12px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8,
                      color: "#f7f8f8",
                      font: "510 13px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  />
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ font: "590 13px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Notas</span>
                  <input
                    type="text"
                    maxLength={500}
                    value={draft.notas}
                    onChange={(e) => setDraft((d) => (d ? { ...d, notas: e.target.value } : d))}
                    placeholder="Opcional"
                    style={{
                      height: 38,
                      padding: "0 12px",
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
              <div style={{ padding: "14px 22px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{
                    flex: 1,
                    height: 42,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    color: "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => saveEdit(editingId)}
                  disabled={pending}
                  style={{
                    flex: 2,
                    height: 42,
                    background: "linear-gradient(180deg,#6b78de,#5e6ad2)",
                    border: "1px solid rgba(113,112,255,0.5)",
                    borderRadius: 10,
                    color: "#fff",
                    font: "590 13px/1 Inter,sans-serif",
                    cursor: "pointer",
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

export function InventarioHistorialWrapper({ rows }: { rows: InventarioHistorialRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 79,
            background: "rgba(8,9,10,0.6)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            transition: "opacity 300ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      )}
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
          Historial de conteos
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
            <span style={{ font: "590 15px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.2px" }}>Historial de conteos</span>
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
          <InventarioHistorial rows={rows} />
        </div>
      </div>
    </>
  );
}
