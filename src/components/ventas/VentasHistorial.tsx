"use client";

import { createPortal } from "react-dom";
import { useState as useLocalState } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CanalDomicilio, MetodoPagoVenta, Prisma, TipoVenta } from "@prisma/client";
import { useRouter } from "next/navigation";
import { editarVenta, eliminarVenta, getPlatosCatalogoVenta } from "@/app/actions/ventas";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import {
  CANAL_DOMICILIO_LABELS,
  CANALES_DOMICILIO,
  METODO_PAGO_VENTA_LABELS,
  METODOS_PAGO_VENTA,
  TIPO_VENTA_LABELS,
} from "@/lib/ventas-constants";

type Row = Prisma.VentaGetPayload<{
  include: {
    detalles: {
      include: {
        plato: { select: { nombre: true; precioVenta: true } };
      };
    };
  };
}>;

export type VentaHistorialRow = Row;

type PlatoCat = {
  id: string;
  nombre: string;
  precioVenta: string;
  categoria: { id: string; nombre: string } | null;
};

function fechaToInput(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseTipoRow(tipo: TipoVenta, canal: CanalDomicilio | null): {
  kind: "mesa" | "domicilio" | "llevar";
  canal: CanalDomicilio;
} {
  if (tipo === "MESA") return { kind: "mesa", canal: CANALES_DOMICILIO[0]! };
  if (tipo === "PARA_LLEVAR") return { kind: "llevar", canal: CANALES_DOMICILIO[0]! };
  return { kind: "domicilio", canal: canal ?? CANALES_DOMICILIO[0]! };
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
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(x);
}

function tipoRowLabel(v: Row): string {
  const base = TIPO_VENTA_LABELS[v.tipo];
  if (v.tipo === "DOMICILIO" && v.canal) return `${base} · ${CANAL_DOMICILIO_LABELS[v.canal]}`;
  return base;
}

const idle: ActionState = { ok: true };

export function VentasHistorial({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<PlatoCat[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    fecha: string;
    hora: string;
    kind: "mesa" | "domicilio" | "llevar";
    canal: CanalDomicilio;
    metodoPago: MetodoPagoVenta;
    lines: { platoId: string; cantidad: number }[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const [visibleCount, setVisibleCount] = useState(10);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [addPlatoSearch, setAddPlatoSearch] = useLocalState("");
  const [addCategoria, setAddCategoria] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const colTestId: Partial<Record<string, string>> = {
    fecha: "col-fecha",
    total: "col-total",
    metodoPago: "col-metodo",
  };

  const cols = [
    { id: "fecha", label: "Fecha", flex: "0 0 96px", align: "left" as const },
    { id: "hora", label: "Hora", flex: "0 0 68px", align: "left" as const },
    { id: "tipo", label: "Tipo", flex: "0 0 148px", align: "left" as const },
    { id: "items", label: "Items", flex: "1 1 0", align: "left" as const, noSort: true },
    { id: "total", label: "Total", flex: "0 0 108px", align: "right" as const },
    { id: "metodoPago", label: "Método pago", flex: "0 0 130px", align: "left" as const },
    { id: "acciones", label: "Acciones", flex: "0 0 156px", align: "right" as const, noSort: true },
  ];

  useEffect(() => {
    getPlatosCatalogoVenta().then((r) => {
      if (r.ok) setCatalog(r.platos);
    });
  }, []);

  useEffect(() => {
    if (openMenu === null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (headerRef.current?.contains(t)) return;
      setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  const precioByPlato = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of catalog) m.set(p.id, Number(p.precioVenta));
    return m;
  }, [catalog]);

  const categoriasUnicas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of catalog) {
      if (p.categoria) seen.set(p.categoria.id, p.categoria.nombre);
    }
    return Array.from(seen.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [catalog]);

  const startEdit = useCallback((v: Row) => {
    const t = parseTipoRow(v.tipo, v.canal);
    setEditingId(v.id);
    setDeleteId(null);
    setDraft({
      fecha: fechaToInput(v.fecha),
      hora: v.hora.trim(),
      kind: t.kind,
      canal: t.canal,
      metodoPago: v.metodoPago,
      lines: v.detalles.map((d) => ({ platoId: d.platoId, cantidad: d.cantidad })),
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(null);
    setAddPlatoSearch("");
    setAddCategoria(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId || !draft) return;
    const tipoStr =
      draft.kind === "mesa" ? "MESA" : draft.kind === "llevar" ? "PARA_LLEVAR" : "DOMICILIO";
    const fd = new FormData();
    fd.set("ventaId", editingId);
    fd.set("fecha", draft.fecha);
    fd.set("hora", draft.hora);
    fd.set("tipo", tipoStr);
    fd.set("canal", draft.kind === "domicilio" ? draft.canal : "");
    fd.set("metodoPago", draft.metodoPago);
    fd.set("lineas", JSON.stringify(draft.lines.map((l) => ({ platoId: l.platoId, cantidad: l.cantidad }))));
    startTransition(async () => {
      const res = await editarVenta(idle, fd);
      if (res.ok) {
        setEditingId(null);
        setDraft(null);
        setAddPlatoSearch("");
        setAddCategoria(null);
        router.refresh();
      }
    });
  }, [editingId, draft, router]);

  const confirmDelete = useCallback(
    (ventaId: string) => {
      const fd = new FormData();
      fd.set("ventaId", ventaId);
      startTransition(async () => {
        const res = await eliminarVenta(idle, fd);
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
      const p = precioByPlato.get(l.platoId) ?? 0;
      s += p * l.cantidad;
    }
    return s;
  }, [draft, precioByPlato]);

  const filtradas = useMemo(() => rows, [rows]);

  const filtradasPorColumna = useMemo(() => {
    return filtradas.filter((v) => {
      const qFecha = (columnSearch.fecha ?? "").trim().toLowerCase();
      if (qFecha && !formatFecha(v.fecha).toLowerCase().includes(qFecha)) return false;
      const qHora = (columnSearch.hora ?? "").trim().toLowerCase();
      if (qHora && !v.hora.trim().toLowerCase().includes(qHora)) return false;
      const qTipo = (columnSearch.tipo ?? "").trim().toLowerCase();
      if (qTipo && !tipoRowLabel(v).toLowerCase().includes(qTipo)) return false;
      const qTotal = (columnSearch.total ?? "").trim().toLowerCase();
      if (qTotal && !formatCop(v.total).toLowerCase().includes(qTotal)) return false;
      const qMet = (columnSearch.metodoPago ?? "").trim().toLowerCase();
      if (qMet && !METODO_PAGO_VENTA_LABELS[v.metodoPago].toLowerCase().includes(qMet)) return false;
      return true;
    });
  }, [filtradas, columnSearch]);

  const ordenadas = useMemo(() => {
    if (!sortColumn) return filtradasPorColumna;
    const arr = [...filtradasPorColumna];
    const m = sortDirection === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortColumn) {
        case "fecha":
          return (a.fecha.getTime() - b.fecha.getTime()) * m;
        case "hora":
          return a.hora.trim().localeCompare(b.hora.trim(), "es") * m;
        case "tipo":
          return tipoRowLabel(a).localeCompare(tipoRowLabel(b), "es") * m;
        case "total":
          return (Number(a.total) - Number(b.total)) * m;
        case "metodoPago":
          return METODO_PAGO_VENTA_LABELS[a.metodoPago].localeCompare(
            METODO_PAGO_VENTA_LABELS[b.metodoPago],
            "es",
          ) * m;
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

  const onSearch = useCallback((key: string, value: string) => {
    setColumnSearch((prev) => ({ ...prev, [key]: value }));
    setVisibleCount(10);
  }, []);

  if (rows.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "20px",
          color: "#62666d",
          font: "400 13px/1 Inter,sans-serif",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#28282c",
            display: "inline-block",
          }}
        />
        Aún no hay ventas registradas
      </div>
    );
  }

  return (
    <>
    <div style={{ minWidth: 900, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        ref={headerRef}
        data-ventas-historial-header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 20px",
          background: "rgba(255,255,255,0.015)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          position: "sticky",
          top: 0,
          zIndex: 2,
          backdropFilter: "blur(8px)",
        }}
      >
        {cols.map((c) => (
          <div
            key={c.id}
            style={{
              flex: c.flex,
              display: "flex",
              justifyContent: c.align === "right" ? "flex-end" : "flex-start",
              position: "relative",
            }}
          >
            {c.noSort ? (
              <span
                style={{
                  font: "510 11px/1 Inter,sans-serif",
                  color: "#8a8f98",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                {c.label}
              </span>
            ) : (
              <button
                type="button"
                data-testid={colTestId[c.id]}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === c.id ? null : c.id);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 26,
                  padding: "0 8px",
                  background: sortColumn === c.id ? "rgba(113,112,255,0.10)" : "transparent",
                  border: "1px solid",
                  borderColor: sortColumn === c.id ? "rgba(113,112,255,0.20)" : "transparent",
                  borderRadius: 6,
                  color: sortColumn === c.id ? "#a4adff" : "#8a8f98",
                  font: "510 11px/1 Inter,sans-serif",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                <span>{c.label}</span>
                {sortColumn === c.id ? (
                  sortDirection === "asc" ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  )
                ) : null}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.5 }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
            {openMenu === c.id ? (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  minWidth: 180,
                  background: "#191a1b",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8,
                  padding: 4,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                  zIndex: 50,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    height: 32,
                    padding: "0 10px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    color: "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onClick={() => {
                    onSort(c.id, "asc");
                    setOpenMenu(null);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                  Ordenar A → Z
                </button>
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    height: 32,
                    padding: "0 10px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    color: "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onClick={() => {
                    onSort(c.id, "desc");
                    setOpenMenu(null);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                  Ordenar Z → A
                </button>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                <div style={{ padding: "4px 6px" }}>
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    value={columnSearch[c.id] ?? ""}
                    onChange={(e) => {
                      setColumnSearch((prev) => ({ ...prev, [c.id]: e.target.value }));
                      setVisibleCount(10);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "100%",
                      height: 28,
                      padding: "0 10px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 6,
                      color: "#f7f8f8",
                      font: "400 12px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {filtradasPorColumna.length === 0 ? (
          <div style={{ padding: "24px 20px", color: "#62666d", font: "400 13px/1 Inter,sans-serif", textAlign: "center" }}>
            No hay ventas que coincidan con la búsqueda de columnas.
          </div>
        ) : (
          aMostrar.map((v) => {
            const isConfirm = deleteId === v.id;
            const nItems = v.detalles.reduce((s, d) => s + d.cantidad, 0);
            const tipoColor = v.tipo === "MESA" ? "#7170ff" : v.tipo === "PARA_LLEVAR" ? "#10b981" : "#d97706";

            return (
              <div
                key={v.id}
                data-testid={`fila-venta-${v.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: isConfirm ? "rgba(224,82,82,0.06)" : "transparent",
                  transition: "background 150ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <div style={{ flex: cols[0]!.flex }}>
                  <span
                    style={{
                      font: "510 13px/1 Inter,sans-serif",
                      color: "#f7f8f8",
                      letterSpacing: "-0.15px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatFecha(v.fecha)}
                  </span>
                </div>
                <div style={{ flex: cols[1]!.flex }}>
                  <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8", fontVariantNumeric: "tabular-nums" }}>
                    {v.hora.trim()}
                  </span>
                </div>
                <div style={{ flex: cols[2]!.flex }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 24,
                      padding: "0 10px 0 8px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 999,
                      font: "510 12px/1 Inter,sans-serif",
                      color: "#d0d6e0",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: tipoColor, flexShrink: 0 }} />
                    {tipoRowLabel(v)}
                  </span>
                </div>
                <div style={{ flex: cols[3]!.flex }}>
                  <span style={{ font: "400 13px/1 Inter,sans-serif", color: "#8a8f98" }}>
                    {nItems} {nItems === 1 ? "item" : "items"}
                  </span>
                </div>
                <div style={{ flex: cols[4]!.flex, display: "flex", justifyContent: "flex-end" }}>
                  <span
                    style={{
                      font: "510 14px/1 Inter,sans-serif",
                      color: "#f7f8f8",
                      letterSpacing: "-0.2px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCop(v.total)}
                  </span>
                </div>
                <div style={{ flex: cols[5]!.flex }}>
                  <span style={{ font: "400 13px/1 Inter,sans-serif", color: "#8a8f98" }}>
                    {METODO_PAGO_VENTA_LABELS[v.metodoPago]}
                  </span>
                </div>
                <div style={{ flex: cols[6]!.flex, display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  {isConfirm ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setDeleteId(null)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
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
                        onClick={() => confirmDelete(v.id)}
                        disabled={pending}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
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
                        onClick={() => startEdit(v)}
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
                          setDeleteId(v.id);
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
                          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {filtradasPorColumna.length > 0 && ordenadas.length > visibleCount ? (
        <button
          type="button"
          onClick={() => setVisibleCount((x) => x + 10)}
          style={{
            width: "100%",
            padding: "10px",
            textAlign: "center",
            font: "510 12px/1 Inter,sans-serif",
            color: "#62666d",
            background: "rgba(255,255,255,0.02)",
            border: "none",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            cursor: "pointer",
          }}
        >
          Ver {Math.min(10, ordenadas.length - visibleCount)} más
        </button>
      ) : null}

      {filtradasPorColumna.length > 0 ? (
        <p style={{ margin: 0, padding: "8px 12px 12px", textAlign: "center", font: "400 11px/1.3 Inter,sans-serif", color: "#62666d" }}>
          Mostrando {aMostrar.length} de {ordenadas.length} ventas
        </p>
      ) : null}
    </div>

    {typeof window !== "undefined" &&
      editingId &&
      createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
          <div
            role="presentation"
            onClick={cancelEdit}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }}
          />

          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(520px, 100vw)",
              background: "#0c0d0e",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
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
                  EDITANDO VENTA
                </p>
                <h2
                  style={{
                    font: "590 20px/1.2 Inter,sans-serif",
                    color: "#f7f8f8",
                    letterSpacing: "-0.3px",
                    margin: "6px 0 0",
                  }}
                >
                  {draft ? formatFecha(new Date(`${draft.fecha}T12:00:00Z`)) : ""}
                </h2>
              </div>
              <button
                type="button"
                data-testid="cerrar-edicion"
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

            <div
              style={{
                margin: "14px 22px 0",
                padding: "10px 14px",
                background: "rgba(217,119,6,0.10)",
                border: "1px solid rgba(217,119,6,0.25)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span style={{ font: "510 12px/1.4 Inter,sans-serif", color: "#f4b35e" }}>
                Editando · cambios reemplazarán la venta
              </span>
            </div>

            {draft ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "18px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Fecha y hora</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98" }}>Fecha</label>
                      <input
                        type="date"
                        value={draft.fecha}
                        onChange={(e) => setDraft((d) => (d ? { ...d, fecha: e.target.value } : d))}
                        style={{
                          width: "100%",
                          height: 34,
                          padding: "0 10px",
                          background: "rgba(0,0,0,0.30)",
                          border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 7,
                          color: "#f7f8f8",
                          font: "510 13px/1 Inter,sans-serif",
                          outline: "none",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98" }}>Hora</label>
                      <input
                        type="time"
                        value={draft.hora}
                        onChange={(e) => setDraft((d) => (d ? { ...d, hora: e.target.value } : d))}
                        style={{
                          width: "100%",
                          height: 34,
                          padding: "0 10px",
                          background: "rgba(0,0,0,0.30)",
                          border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 7,
                          color: "#f7f8f8",
                          font: "510 13px/1 Inter,sans-serif",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Tipo de venta</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["mesa", "llevar", "domicilio"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setDraft((d) => (d ? { ...d, kind: k } : d))}
                        style={{
                          flex: 1,
                          height: 36,
                          borderRadius: 8,
                          border: "1px solid",
                          font: "510 13px/1 Inter,sans-serif",
                          cursor: "pointer",
                          background: draft.kind === k ? "rgba(94,106,210,0.18)" : "transparent",
                          borderColor: draft.kind === k ? "rgba(113,112,255,0.4)" : "rgba(255,255,255,0.08)",
                          color: draft.kind === k ? "#a4adff" : "#8a8f98",
                        }}
                      >
                        {k === "mesa" ? "Mesa" : k === "llevar" ? "Para llevar" : "Domicilio"}
                      </button>
                    ))}
                  </div>
                  {draft.kind === "domicilio" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98" }}>Canal</label>
                      <select
                        value={draft.canal}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, canal: e.target.value as CanalDomicilio } : d))
                        }
                        style={{
                          width: "100%",
                          height: 34,
                          padding: "0 10px",
                          background: "rgba(0,0,0,0.30)",
                          border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 7,
                          color: "#f7f8f8",
                          font: "510 13px/1 Inter,sans-serif",
                          outline: "none",
                        }}
                      >
                        {CANALES_DOMICILIO.map((ch) => (
                          <option key={ch} value={ch}>
                            {CANAL_DOMICILIO_LABELS[ch]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "16px 16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Método de pago</span>
                  <select
                    value={draft.metodoPago}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, metodoPago: e.target.value as MetodoPagoVenta } : d))
                    }
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 10px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 7,
                      color: "#f7f8f8",
                      font: "510 13px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  >
                    {METODOS_PAGO_VENTA.map((m) => (
                      <option key={m} value={m}>
                        {METODO_PAGO_VENTA_LABELS[m]}
                      </option>
                    ))}
                  </select>
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ font: "590 14px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>Platos</span>
                    <span
                      style={{
                        font: "510 11px/1 Inter,sans-serif",
                        color: "#62666d",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                      }}
                    >
                      {draft.lines.length} {draft.lines.length === 1 ? "plato" : "platos"}
                    </span>
                  </div>

                  {draft.lines.map((line, i) => {
                    const pu = precioByPlato.get(line.platoId) ?? 0;
                    const nombrePlato = catalog.find((pc) => pc.id === line.platoId)?.nombre ?? line.platoId;
                    return (
                      <div
                        key={line.platoId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 8,
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            font: "510 13px/1.3 Inter,sans-serif",
                            color: "#f7f8f8",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {nombrePlato}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 7,
                            padding: 2,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((d) => {
                                if (!d) return d;
                                if (line.cantidad <= 1) {
                                  return { ...d, lines: d.lines.filter((_, j) => j !== i) };
                                }
                                return {
                                  ...d,
                                  lines: d.lines.map((l, j) =>
                                    j === i ? { ...l, cantidad: l.cantidad - 1 } : l,
                                  ),
                                };
                              })
                            }
                            style={{
                              width: 28,
                              height: 28,
                              border: "none",
                              background: "transparent",
                              color: "#d0d6e0",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 5,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                              <path d="M5 12h14" />
                            </svg>
                          </button>
                          <span
                            style={{
                              minWidth: 22,
                              textAlign: "center",
                              font: "590 13px/1 Inter,sans-serif",
                              color: "#f7f8f8",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {line.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      lines: d.lines.map((l, j) =>
                                        j === i ? { ...l, cantidad: l.cantidad + 1 } : l,
                                      ),
                                    }
                                  : d,
                              )
                            }
                            style={{
                              width: 28,
                              height: 28,
                              border: "none",
                              background: "transparent",
                              color: "#d0d6e0",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 5,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        </div>
                        <span
                          style={{
                            font: "510 12px/1 Inter,sans-serif",
                            color: "#7170ff",
                            fontVariantNumeric: "tabular-nums",
                            flexShrink: 0,
                            minWidth: 64,
                            textAlign: "right",
                          }}
                        >
                          {formatCop(pu * line.cantidad)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => (d ? { ...d, lines: d.lines.filter((_, j) => j !== i) } : d))
                          }
                          style={{
                            width: 24,
                            height: 24,
                            border: "none",
                            background: "rgba(224,82,82,0.14)",
                            borderRadius: 6,
                            color: "#ff8585",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98" }}>Agregar plato</label>

                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setAddCategoria(null)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          height: 28,
                          padding: "0 10px",
                          background: addCategoria === null ? "rgba(94,106,210,0.14)" : "rgba(255,255,255,0.03)",
                          border: "1px solid",
                          borderColor: addCategoria === null ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.06)",
                          borderRadius: 999,
                          color: addCategoria === null ? "#a4adff" : "#8a8f98",
                          font: "510 11px/1 Inter,sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        Todos
                      </button>
                      {categoriasUnicas.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setAddCategoria(c.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 28,
                            padding: "0 10px",
                            background: addCategoria === c.id ? "rgba(94,106,210,0.14)" : "rgba(255,255,255,0.03)",
                            border: "1px solid",
                            borderColor: addCategoria === c.id ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.06)",
                            borderRadius: 999,
                            color: addCategoria === c.id ? "#a4adff" : "#8a8f98",
                            font: "510 11px/1 Inter,sans-serif",
                            cursor: "pointer",
                          }}
                        >
                          {c.nombre}
                        </button>
                      ))}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        height: 36,
                        padding: "0 10px",
                        background: "rgba(0,0,0,0.20)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#62666d" strokeWidth="1.8" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Buscar plato..."
                        value={addPlatoSearch}
                        onChange={(e) => setAddPlatoSearch(e.target.value)}
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "none",
                          color: "#f7f8f8",
                          font: "400 13px/1 Inter,sans-serif",
                          outline: "none",
                        }}
                      />
                      {addPlatoSearch ? (
                        <button
                          type="button"
                          onClick={() => setAddPlatoSearch("")}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.06)",
                            border: "none",
                            color: "#8a8f98",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      ) : null}
                    </div>

                    <div
                      style={{
                        background: "#191a1b",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8,
                        padding: 4,
                        maxHeight: 200,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {catalog
                        .filter((p) => {
                          const matchCat = addCategoria === null || p.categoria?.id === addCategoria;
                          const matchSearch =
                            !addPlatoSearch.trim() || p.nombre.toLowerCase().includes(addPlatoSearch.toLowerCase());
                          return matchCat && matchSearch;
                        })
                        .map((p) => {
                          const yaEnLineas = draft.lines.some((l) => l.platoId === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setDraft((d) => {
                                  if (!d) return d;
                                  if (yaEnLineas) {
                                    return {
                                      ...d,
                                      lines: d.lines.map((l) =>
                                        l.platoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l,
                                      ),
                                    };
                                  }
                                  return { ...d, lines: [...d.lines, { platoId: p.id, cantidad: 1 }] };
                                });
                                setAddPlatoSearch("");
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                height: 34,
                                padding: "0 10px",
                                background: "transparent",
                                border: "none",
                                borderRadius: 6,
                                color: yaEnLineas ? "#a4adff" : "#d0d6e0",
                                font: "510 13px/1 Inter,sans-serif",
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(113,112,255,0.08)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                              }}
                            >
                              <span
                                style={{
                                  overflow: "hidden",
                                  whiteSpace: "nowrap",
                                  textOverflow: "ellipsis",
                                  flex: 1,
                                }}
                              >
                                {p.nombre}
                                {yaEnLineas ? (
                                  <span style={{ color: "#62666d", fontSize: 11, marginLeft: 6 }}>· en pedido</span>
                                ) : null}
                              </span>
                              <span
                                style={{
                                  font: "510 12px/1 Inter,sans-serif",
                                  color: "#8a8f98",
                                  fontVariantNumeric: "tabular-nums",
                                  flexShrink: 0,
                                  marginLeft: 8,
                                }}
                              >
                                {formatCop(Number(p.precioVenta))}
                              </span>
                            </button>
                          );
                        })}
                      {catalog.filter((p) => {
                        const matchCat = addCategoria === null || p.categoria?.id === addCategoria;
                        const matchSearch =
                          !addPlatoSearch.trim() || p.nombre.toLowerCase().includes(addPlatoSearch.toLowerCase());
                        return matchCat && matchSearch;
                      }).length === 0 ? (
                        <p
                          style={{
                            padding: "10px 12px",
                            font: "400 13px/1 Inter,sans-serif",
                            color: "#62666d",
                            margin: 0,
                          }}
                        >
                          Sin resultados
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: 10,
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      marginTop: 4,
                    }}
                  >
                    <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#8a8f98" }}>Total</span>
                    <span
                      style={{
                        font: "590 20px/1 Inter,sans-serif",
                        color: "#f7f8f8",
                        letterSpacing: "-0.4px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatCop(draftTotal)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

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
