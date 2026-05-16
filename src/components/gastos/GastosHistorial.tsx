"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { CategoriaGasto, MetodoPagoGasto, PeriodicidadGasto } from "@prisma/client";
import { useRouter } from "next/navigation";
import type { GastoFijoSerialized } from "@/app/actions/gastos";
import { deleteGastoFijo, updateGastoFijo } from "@/app/actions/gastos";
import { CATEGORIA_LABELS, METODO_PAGO_LABELS, PERIODICIDAD_LABELS } from "@/lib/gastos-constants";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "@/app/(main)/configuracion/cop-price";

const idle: ActionState = { ok: true };

function monthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fechaToInputValue(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFecha(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatCop(monto: { toString(): string }): string {
  const n = Number(monto.toString());
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

const CATEGORIA_KEYS = Object.keys(CATEGORIA_LABELS) as CategoriaGasto[];
const PERIODICIDAD_KEYS = Object.keys(PERIODICIDAD_LABELS) as PeriodicidadGasto[];
const METODO_KEYS = Object.keys(METODO_PAGO_LABELS) as MetodoPagoGasto[];

export function GastosHistorial({
  rows,
  categoriaFiltro = "",
  mesFiltro = "",
}: {
  rows: GastoFijoSerialized[];
  categoriaFiltro?: CategoriaGasto | "";
  mesFiltro?: string;
}) {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    fecha: string;
    categoria: CategoriaGasto;
    monto: string;
    periodicidad: PeriodicidadGasto;
    metodoPago: MetodoPagoGasto;
    notas: string;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, startEditTransition] = useTransition();

  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    setVisibleCount(10);
  }, [categoriaFiltro, mesFiltro]);

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (categoriaFiltro && r.categoria !== categoriaFiltro) return false;
      if (mesFiltro && monthKeyUtc(r.fecha) !== mesFiltro) return false;
      return true;
    });
  }, [rows, categoriaFiltro, mesFiltro]);

  const aMostrar = useMemo(() => filtradas.slice(0, visibleCount), [filtradas, visibleCount]);

  const startEdit = useCallback((row: GastoFijoSerialized) => {
    setEditingId(row.id);
    setEditError(null);
    setEditDraft({
      fecha: fechaToInputValue(row.fecha),
      categoria: row.categoria as CategoriaGasto,
      monto: precioVentaToDigits(row.monto),
      periodicidad: row.periodicidad as PeriodicidadGasto,
      metodoPago: row.metodoPago as MetodoPagoGasto,
      notas: row.notas?.trim() ?? "",
    });
    setDeleteId(null);
    setDeleteError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  }, []);

  const saveEdit = useCallback(
    (id: string) => {
      if (!editDraft) return;
      const fd = new FormData();
      fd.set("id", id);
      fd.set("fecha", editDraft.fecha);
      fd.set("categoria", editDraft.categoria);
      fd.set("monto", digitsToSalePriceString(editDraft.monto));
      fd.set("periodicidad", editDraft.periodicidad);
      fd.set("metodoPago", editDraft.metodoPago);
      fd.set("notas", editDraft.notas);
      startEditTransition(async () => {
        const res = await updateGastoFijo(idle, fd);
        if (res.ok) {
          cancelEdit();
          router.refresh();
        } else {
          setEditError(res.message ?? "No se pudo guardar.");
        }
      });
    },
    [editDraft, cancelEdit, router],
  );

  const confirmDelete = useCallback(
    (id: string) => {
      const fd = new FormData();
      fd.set("id", id);
      startDeleteTransition(async () => {
        const res = await deleteGastoFijo(idle, fd);
        if (res.ok) {
          setDeleteId(null);
          setDeleteError(null);
          router.refresh();
        } else {
          setDeleteError(res.message ?? "No se pudo eliminar.");
        }
      });
    },
    [router],
  );

  return (
    <>
      {rows.length === 0 ? (
        <p style={{ padding: "24px 20px", font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>
          Aún no has registrado gastos fijos.
        </p>
      ) : (
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
            {[
              { label: "Fecha", flex: "0 0 110px" },
              { label: "Categoría", flex: "1 1 0" },
              { label: "Monto", flex: "0 0 120px" },
              { label: "Periodicidad", flex: "0 0 110px" },
              { label: "Método pago", flex: "0 0 110px" },
              { label: "Notas", flex: "0 0 180px" },
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

          {filtradas.length === 0 ? (
            <p style={{ padding: "20px", font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>
              No hay gastos que coincidan.
            </p>
          ) : (
            aMostrar.map((row) => {
              const isDel = deleteId === row.id;
              return (
                <div
                  key={row.id}
                  style={{
                    position: "relative",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: isDel ? "rgba(224,82,82,0.06)" : "transparent",
                    transition: "background 150ms",
                  }}
                >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 20px",
                  }}
                >
                  <div style={{ flex: "0 0 110px" }}>
                    <span
                      style={{
                        font: "400 12px/1 Inter,sans-serif",
                        color: "#d0d6e0",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatFecha(row.fecha)}
                    </span>
                  </div>
                  <div style={{ flex: "1 1 0" }}>
                    <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8" }}>
                      {CATEGORIA_LABELS[row.categoria]}
                    </span>
                  </div>
                  <div style={{ flex: "0 0 120px" }}>
                    <span
                      style={{
                        font: "510 13px/1 Inter,sans-serif",
                        color: "#f7f8f8",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatCop(row.monto)}
                    </span>
                  </div>
                  <div style={{ flex: "0 0 110px" }}>
                    <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#d0d6e0" }}>
                      {PERIODICIDAD_LABELS[row.periodicidad]}
                    </span>
                  </div>
                  <div style={{ flex: "0 0 110px" }}>
                    <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#d0d6e0" }}>
                      {METODO_PAGO_LABELS[row.metodoPago]}
                    </span>
                  </div>
                  <div style={{ flex: "0 0 180px" }}>
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
                          onClick={() => {
                            setDeleteId(null);
                            setDeleteError(null);
                          }}
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
                          onClick={() => confirmDelete(row.id)}
                          disabled={deletePending}
                          style={{
                            height: 28,
                            padding: "0 10px",
                            background: "rgba(224,82,82,0.22)",
                            border: "1px solid rgba(224,82,82,0.4)",
                            borderRadius: 6,
                            color: "#ff8585",
                            font: "510 12px/1 Inter,sans-serif",
                            cursor: deletePending ? "not-allowed" : "pointer",
                            opacity: deletePending ? 0.7 : 1,
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
                            setEditDraft(null);
                            setDeleteError(null);
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
                {isDel && deleteError ? (
                  <p style={{ padding: "0 20px 10px", margin: 0, font: "400 12px/1.3 Inter,sans-serif", color: "#f87171" }}>
                    {deleteError}
                  </p>
                ) : null}
                </div>
              );
            })
          )}

          {filtradas.length > visibleCount ? (
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
              Ver más
            </button>
          ) : null}
        </div>
      )}

      {typeof window !== "undefined" &&
        editingId &&
        editDraft &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
            <div onClick={cancelEdit} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(480px,100vw)",
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
                    EDITANDO GASTO
                  </p>
                  <h2
                    style={{
                      font: "590 18px/1.2 Inter,sans-serif",
                      color: "#f7f8f8",
                      letterSpacing: "-0.3px",
                      margin: "6px 0 0",
                    }}
                  >
                    {CATEGORIA_LABELS[editDraft.categoria]}
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
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Cerrar
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "18px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {/* Categoría */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "14px 16px 16px",
                  }}
                >
                  <p style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", margin: "0 0 10px" }}>Categoría</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {CATEGORIA_KEYS.map((k) => {
                      const on = editDraft.categoria === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEditDraft((d) => (d ? { ...d, categoria: k } : d))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 28,
                            padding: "0 10px",
                            background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                            border: "1px solid",
                            borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            color: on ? "#fff" : "#d0d6e0",
                            font: "510 12px/1 Inter,sans-serif",
                            cursor: "pointer",
                          }}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {CATEGORIA_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Monto */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "14px 16px 16px",
                  }}
                >
                  <p style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", margin: "0 0 8px" }}>Monto</p>
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#62666d",
                        font: "510 13px/1 Inter,sans-serif",
                        pointerEvents: "none",
                      }}
                    >
                      $
                    </span>
                    <input
                      inputMode="numeric"
                      value={formatCopFromDigits(editDraft.monto)}
                      onChange={(e) =>
                        setEditDraft((d) =>
                          d ? { ...d, monto: e.target.value.replace(/[^\d]/g, "") } : d,
                        )
                      }
                      style={{
                        width: "100%",
                        height: 38,
                        padding: "0 12px 0 24px",
                        background: "rgba(0,0,0,0.30)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 8,
                        color: "#f7f8f8",
                        font: "510 14px/1 Inter,sans-serif",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                {/* Periodicidad */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "14px 16px 16px",
                  }}
                >
                  <p style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", margin: "0 0 10px" }}>Periodicidad</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {PERIODICIDAD_KEYS.map((k) => {
                      const on = editDraft.periodicidad === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEditDraft((d) => (d ? { ...d, periodicidad: k } : d))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 28,
                            padding: "0 10px",
                            background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                            border: "1px solid",
                            borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            color: on ? "#fff" : "#d0d6e0",
                            font: "510 12px/1 Inter,sans-serif",
                            cursor: "pointer",
                          }}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {PERIODICIDAD_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Método de pago */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "14px 16px 16px",
                  }}
                >
                  <p style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", margin: "0 0 10px" }}>Método de pago</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {METODO_KEYS.map((k) => {
                      const on = editDraft.metodoPago === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEditDraft((d) => (d ? { ...d, metodoPago: k } : d))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 28,
                            padding: "0 10px",
                            background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                            border: "1px solid",
                            borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            color: on ? "#fff" : "#d0d6e0",
                            font: "510 12px/1 Inter,sans-serif",
                            cursor: "pointer",
                          }}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {METODO_PAGO_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fecha + Notas */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      padding: "14px 16px 16px",
                    }}
                  >
                    <p style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", margin: "0 0 8px" }}>Fecha</p>
                    <input
                      type="date"
                      value={editDraft.fecha}
                      onChange={(e) => setEditDraft((d) => (d ? { ...d, fecha: e.target.value } : d))}
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
                  <div
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      padding: "14px 16px 16px",
                    }}
                  >
                    <p style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", margin: "0 0 8px" }}>Notas</p>
                    <input
                      type="text"
                      maxLength={300}
                      value={editDraft.notas}
                      onChange={(e) => setEditDraft((d) => (d ? { ...d, notas: e.target.value } : d))}
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

                {editError ? <p style={{ font: "400 12px/1 Inter,sans-serif", color: "#f87171", margin: 0 }}>{editError}</p> : null}
              </div>
              <div
                style={{
                  padding: "14px 22px 18px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
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
                  onClick={() => editingId && saveEdit(editingId)}
                  disabled={editPending}
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
                    opacity: editPending ? 0.7 : 1,
                  }}
                >
                  {editPending ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function GastosHistorialWrapper({ rows }: { rows: GastoFijoSerialized[] }) {
  const [open, setOpen] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaGasto | "">("");
  const [mesFiltro, setMesFiltro] = useState<string>("");

  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      set.add(monthKeyUtc(r.fecha));
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [rows]);

  const mesLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of mesesDisponibles) {
      const [y, m] = k.split("-").map(Number);
      const d = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
      const label = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
      map.set(k, label.charAt(0).toUpperCase() + label.slice(1));
    }
    return map;
  }, [mesesDisponibles]);

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
          Historial de gastos
          <span
            style={{
              font: "510 11px/1 Inter,sans-serif",
              color: open ? "#a4adff" : "#8a8f98",
              background: open ? "rgba(113,112,255,0.20)" : "rgba(255,255,255,0.05)",
              padding: "3px 7px",
              borderRadius: 999,
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
            <span style={{ font: "590 15px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.2px" }}>
              Historial de gastos
            </span>
            <span
              style={{
                font: "510 11px/1 Inter,sans-serif",
                color: "#8a8f98",
                background: "rgba(255,255,255,0.04)",
                padding: "3px 8px",
                borderRadius: 999,
              }}
            >
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

        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 160, flex: "1 1 160px" }}>
            <label
              htmlFor="gastos-drawer-filtro-cat"
              style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}
            >
              Categoría
            </label>
            <select
              id="gastos-drawer-filtro-cat"
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro((e.target.value || "") as CategoriaGasto | "")}
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
              <option value="">Todas las categorías</option>
              {CATEGORIA_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CATEGORIA_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 180, flex: "1 1 180px" }}>
            <label
              htmlFor="gastos-drawer-filtro-mes"
              style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}
            >
              Mes y año
            </label>
            <select
              id="gastos-drawer-filtro-mes"
              value={mesFiltro}
              onChange={(e) => setMesFiltro(e.target.value)}
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
              <option value="">Todos los períodos</option>
              {mesesDisponibles.map((k) => (
                <option key={k} value={k}>
                  {mesLabels.get(k) ?? k}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <GastosHistorial rows={rows} categoriaFiltro={categoriaFiltro} mesFiltro={mesFiltro} />
        </div>
      </div>
    </>
  );
}
