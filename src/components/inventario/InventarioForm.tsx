"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import type { CategoriaProveedor, Unidad } from "@prisma/client";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarInventario } from "@/app/actions/inventario";
import { proveedorCategoriaOptions } from "@/app/(main)/configuracion/categories";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";
import type { StockCalculadoInfo } from "@/lib/inventario-stock-calculado";

const initialState: ActionState = { ok: true };

// Colombia = UTC-5 (sin horario de verano).
function nowEnColombia(): Date {
  const CO_OFFSET_MS = 5 * 60 * 60 * 1000;
  return new Date(Date.now() - CO_OFFSET_MS);
}

function todayLocalISO(): string {
  const d = nowEnColombia();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type InsumoRow = {
  id: string;
  nombre: string;
  unidadBase: Unidad;
  categoria: CategoriaProveedor | null;
};

type LineVals = { stockReal: string; notas: string };

type ViewMode = "home" | "categoria" | "insumo";

function unitLabel(u: Unidad): string {
  return UNIT_OPTIONS.find((x) => x.value === u)?.label ?? u;
}

function formatStockRef(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

function StockCalculadoCell({ info }: { info: StockCalculadoInfo | undefined }) {
  if (!info || info.status === "sin-base") {
    return <p className="text-sm text-text-tertiary">Sin conteo base</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-sm text-text-secondary">
        ≈ {formatStockRef(info.valor)} {info.unidadLabel}
      </p>
      {info.unidadesMixtas ? (
        <p className="text-xs font-medium text-warning">⚠ unidades mixtas</p>
      ) : null}
    </div>
  );
}

function insumosEnCategoria(insumos: InsumoRow[], cat: CategoriaProveedor): InsumoRow[] {
  if (cat === "OTRO") {
    return insumos.filter((i) => i.categoria === "OTRO" || i.categoria === null);
  }
  return insumos.filter((i) => i.categoria === cat);
}

function FieldError({ state, field }: { state: ActionState; field: string }) {
  if (!("ok" in state) || state.ok || state.field !== field) return null;
  return <p className="mt-1 text-xs text-danger">{state.message}</p>;
}

function SubmitButton({ count, onConfirm }: { count: number; onConfirm: () => void }) {
  return (
    <button
      type="button"
      disabled={count === 0}
      onClick={onConfirm}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 44,
        padding: "0 26px",
        background: count > 0 ? "linear-gradient(180deg,#6b78de,#5e6ad2)" : "rgba(255,255,255,0.04)",
        border: "1px solid",
        borderColor: count > 0 ? "rgba(113,112,255,0.5)" : "rgba(255,255,255,0.06)",
        borderRadius: 12,
        color: count > 0 ? "#fff" : "#62666d",
        font: "590 14px/1 Inter,sans-serif",
        cursor: count === 0 ? "not-allowed" : "pointer",
        boxShadow: count > 0 ? "inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 14px rgba(94,106,210,0.32)" : "none",
        transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      {count === 0 ? "Registrar conteo" : `Registrar conteo (${count} ${count === 1 ? "insumo" : "insumos"})`}
    </button>
  );
}

function InsumoFieldsRow({
  ins,
  vals,
  onChange,
  stockInfo,
}: {
  ins: InsumoRow;
  vals: LineVals;
  onChange: (patch: Partial<LineVals>) => void;
  stockInfo: StockCalculadoInfo | undefined;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 120px 80px 1fr",
        gap: 10,
        alignItems: "end",
        padding: "12px 14px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
      }}
    >
      <div>
        <span style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Insumo</span>
        <span style={{ font: "590 13px/1.3 Inter,sans-serif", color: "#f7f8f8" }}>{ins.nombre}</span>
      </div>
      <div>
        <span style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Stock calc.</span>
        <StockCalculadoCell info={stockInfo} />
      </div>
      <div>
        <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }} htmlFor={`stock-${ins.id}`}>
          Stock real *
        </label>
        <input
          id={`stock-${ins.id}`}
          inputMode="decimal"
          type="number"
          step="0.0001"
          min="0"
          max="9999"
          value={vals.stockReal}
          onChange={(e) => onChange({ stockReal: e.target.value })}
          placeholder="—"
          style={{
            width: "100%",
            height: 34,
            padding: "0 10px",
            background: "rgba(0,0,0,0.30)",
            border: "1px solid",
            borderColor: vals.stockReal ? "rgba(113,112,255,0.40)" : "rgba(255,255,255,0.10)",
            borderRadius: 7,
            color: "#f7f8f8",
            font: "510 13px/1 Inter,sans-serif",
            outline: "none",
          }}
        />
      </div>
      <div>
        <span style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Unidad</span>
        <span style={{ font: "400 13px/1.3 Inter,sans-serif", color: "#d0d6e0" }}>{unitLabel(ins.unidadBase)}</span>
      </div>
      <div>
        <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }} htmlFor={`notas-${ins.id}`}>
          Notas
        </label>
        <input
          id={`notas-${ins.id}`}
          type="text"
          maxLength={500}
          value={vals.notas}
          onChange={(e) => onChange({ notas: e.target.value })}
          placeholder="Opcional"
          style={{
            width: "100%",
            height: 34,
            padding: "0 10px",
            background: "rgba(0,0,0,0.30)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            color: "#f7f8f8",
            font: "510 13px/1 Inter,sans-serif",
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}

export function InventarioForm({
  insumos,
  stockCalculadoById,
}: {
  insumos: InsumoRow[];
  stockCalculadoById: Record<string, StockCalculadoInfo>;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(registrarInventario, initialState);

  const [fecha, setFecha] = useState(todayLocalISO);
  const [lines, setLines] = useState<Record<string, LineVals>>({});
  const [view, setView] = useState<ViewMode>("home");
  const [categoriaSel, setCategoriaSel] = useState<CategoriaProveedor | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [inlineEmptyError, setInlineEmptyError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const getVals = (id: string): LineVals =>
    lines[id] ?? { stockReal: "", notas: "" };

  const setVals = (id: string, patch: Partial<LineVals>) => {
    setInlineEmptyError(null);
    setLines((prev) => {
      const cur = prev[id] ?? { stockReal: "", notas: "" };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const filledCount = useMemo(() => {
    let n = 0;
    for (const ins of insumos) {
      const t = (lines[ins.id]?.stockReal ?? "").trim();
      if (t !== "") n += 1;
    }
    return n;
  }, [insumos, lines]);

  const lineasJson = useMemo(() => {
    const lineas: { insumoId: string; stockReal: string; notas?: string }[] = [];
    for (const ins of insumos) {
      const v = lines[ins.id];
      if (!v) continue;
      const t = v.stockReal.trim();
      if (t === "") continue;
      const entry: { insumoId: string; stockReal: string; notas?: string } = {
        insumoId: ins.id,
        stockReal: t.replace(",", "."),
      };
      const note = v.notas.trim();
      if (note) entry.notas = note;
      lineas.push(entry);
    }
    return JSON.stringify(lineas);
  }, [insumos, lines]);

  const insumosFiltradosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return insumos.filter((i) => i.nombre.toLowerCase().includes(q));
  }, [insumos, busqueda]);

  const listaCategoria = useMemo(() => {
    if (categoriaSel == null) return [];
    return insumosEnCategoria(insumos, categoriaSel);
  }, [insumos, categoriaSel]);

  const lastProcessedState = useRef<ActionState | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state === lastProcessedState.current) return;
    if (!state.ok || !state.message) return;
    lastProcessedState.current = state;
    setFecha(todayLocalISO());
    setLines({});
    setView("home");
    setCategoriaSel(null);
    setBusqueda("");
    setInlineEmptyError(null);
    setShowConfirm(false);
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (filledCount === 0) setShowConfirm(false);
  }, [filledCount]);

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (filledCount === 0) {
      e.preventDefault();
      setInlineEmptyError("Ingresa el stock de al menos un insumo.");
      return;
    }
    setInlineEmptyError(null);
  }

  return (
    <>
      <form action={formAction} onSubmit={handleFormSubmit} className="flex flex-col">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="lineas" value={lineasJson} />

      <div className="min-h-0 flex-1 space-y-6 pb-4">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4 }}>
          <div>
            <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }} htmlFor="inv-fecha">
              Fecha *
            </label>
            <input
              id="inv-fecha"
              type="date"
              value={fecha}
              max={todayLocalISO()}
              onChange={(e) => setFecha(e.target.value)}
              required
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
            <FieldError state={state} field="fecha" />
          </div>
          <p style={{ font: "400 12px/1.4 Inter,sans-serif", color: "#62666d", margin: 0 }}>
            Registra el stock real que tienes actualmente en tu depósito.
          </p>
        </div>

        {insumos.length === 0 ? (
          <p className="text-sm text-text-tertiary">No tienes insumos activos. Créalos en Configuración.</p>
        ) : (
          <div className="space-y-4">
            {view === "home" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setView("categoria")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    height: 72,
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    color: "#d0d6e0",
                    font: "590 14px/1.2 Inter,sans-serif",
                    cursor: "pointer",
                    transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(113,112,255,0.10)";
                    e.currentTarget.style.borderColor = "rgba(113,112,255,0.30)";
                    e.currentTarget.style.color = "#a4adff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.025)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.color = "#d0d6e0";
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                  Buscar por categoría
                </button>
                <button
                  type="button"
                  onClick={() => setView("insumo")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    height: 72,
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    color: "#d0d6e0",
                    font: "590 14px/1.2 Inter,sans-serif",
                    cursor: "pointer",
                    transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(113,112,255,0.10)";
                    e.currentTarget.style.borderColor = "rgba(113,112,255,0.30)";
                    e.currentTarget.style.color = "#a4adff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.025)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.color = "#d0d6e0";
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Buscar por insumo
                </button>
              </div>
            ) : null}

            {view === "categoria" ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setView("home");
                    setCategoriaSel(null);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 28,
                    padding: "0 10px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 7,
                    color: "#8a8f98",
                    font: "510 12px/1 Inter,sans-serif",
                    cursor: "pointer",
                    marginBottom: 14,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Volver
                </button>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {proveedorCategoriaOptions.map((opt) => {
                    const active = categoriaSel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategoriaSel(opt.value)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          height: 32,
                          padding: "0 13px",
                          background: active ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                          border: "1px solid",
                          borderColor: active ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                          borderRadius: 999,
                          color: active ? "#fff" : "#d0d6e0",
                          font: "510 13px/1 Inter,sans-serif",
                          cursor: "pointer",
                          transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                        }}
                      >
                        {active && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {categoriaSel == null ? (
                  <p className="text-sm text-text-tertiary">Selecciona una categoría para ver sus insumos.</p>
                ) : listaCategoria.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No hay insumos en esta categoría.</p>
                ) : (
                  <div className="space-y-3">
                    {listaCategoria.map((ins) => (
                      <InsumoFieldsRow
                        key={ins.id}
                        ins={ins}
                        vals={getVals(ins.id)}
                        onChange={(p) => setVals(ins.id, p)}
                        stockInfo={stockCalculadoById[ins.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {view === "insumo" ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setView("home");
                    setBusqueda("");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 28,
                    padding: "0 10px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 7,
                    color: "#8a8f98",
                    font: "510 12px/1 Inter,sans-serif",
                    cursor: "pointer",
                    marginBottom: 14,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Volver
                </button>
                <div style={{ position: "relative", marginBottom: 14 }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    style={{
                      position: "absolute",
                      left: 12,
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
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Escribe para filtrar insumos..."
                    autoFocus
                    style={{
                      width: "100%",
                      height: 38,
                      padding: "0 12px 0 36px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8,
                      color: "#f7f8f8",
                      font: "510 13px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  />
                </div>
                {!busqueda.trim() ? (
                  <p className="text-sm text-text-tertiary">Escribe para filtrar por nombre.</p>
                ) : insumosFiltradosBusqueda.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No hay insumos que coincidan.</p>
                ) : (
                  <div className="space-y-3">
                    {insumosFiltradosBusqueda.map((ins) => (
                      <InsumoFieldsRow
                        key={ins.id}
                        ins={ins}
                        vals={getVals(ins.id)}
                        onChange={(p) => setVals(ins.id, p)}
                        stockInfo={stockCalculadoById[ins.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          marginTop: 8,
        }}
      >
        {filledCount > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(lines)
              .filter(([_, v]) => v.stockReal.trim() !== "")
              .map(([id]) => {
                const ins = insumos.find((x) => x.id === id);
                return ins ? (
                  <span
                    key={id}
                    onClick={() => setVals(id, { stockReal: "", notas: "" })}
                    title="Click para quitar"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      height: 24,
                      padding: "0 10px 0 8px",
                      background: "rgba(113,112,255,0.12)",
                      border: "1px solid rgba(113,112,255,0.25)",
                      borderRadius: 999,
                      color: "#a4adff",
                      font: "510 11px/1 Inter,sans-serif",
                      cursor: "pointer",
                      transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                    }}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {ins.nombre}
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      style={{ opacity: 0.5, marginLeft: 2 }}
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </span>
                ) : null;
              })}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(inlineEmptyError || ("ok" in state && state.ok === false && state.field === "lineas")) && (
              <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#f87171" }} role="alert">
                {inlineEmptyError ?? ("ok" in state && !state.ok ? state.message : null)}
              </span>
            )}
            {"ok" in state && state.ok === false && !state.field && (
              <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{state.message}</span>
            )}
            {"ok" in state && state.ok && state.message && (
              <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#a4adff" }}>{state.message}</span>
            )}
          </div>
          <SubmitButton count={filledCount} onConfirm={() => { if (filledCount > 0) setShowConfirm(true); }} />
        </div>
      </div>
      <button ref={submitRef} type="submit" style={{ display: "none" }} aria-hidden />
    </form>
    {typeof window !== "undefined" &&
      showConfirm &&
      createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div onClick={() => setShowConfirm(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} />
          <div
            style={{
              position: "relative",
              width: "min(480px,100%)",
              background: "#0c0d0e",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 16,
              boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <p
                style={{
                  font: "590 10px/1 Inter,sans-serif",
                  color: "#7170ff",
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                CONFIRMAR CONTEO
              </p>
              <h2 style={{ font: "590 20px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.3px", margin: "6px 0 0" }}>
                ¿Registrar este conteo?
              </h2>
              <p style={{ font: "400 12px/1.4 Inter,sans-serif", color: "#62666d", margin: "6px 0 0" }}>
                Revisa los datos antes de confirmar. Puedes editar después desde el historial.
              </p>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", padding: "14px 22px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(lines)
                  .filter(([_, v]) => v.stockReal.trim() !== "")
                  .map(([id, vals]) => {
                    const ins = insumos.find((x) => x.id === id);
                    if (!ins) return null;
                    return (
                      <div
                        key={id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "rgba(255,255,255,0.025)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 8,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ font: "590 13px/1.2 Inter,sans-serif", color: "#f7f8f8" }}>{ins.nombre}</span>
                          {vals.notas.trim() && (
                            <span style={{ font: "400 11px/1.2 Inter,sans-serif", color: "#62666d" }}>{vals.notas}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                          <span style={{ font: "590 18px/1 Inter,sans-serif", color: "#a4adff", fontVariantNumeric: "tabular-nums" }}>
                            {vals.stockReal}
                          </span>
                          <span style={{ font: "400 11px/1 Inter,sans-serif", color: "#62666d" }}>
                            {UNIT_OPTIONS.find((u) => u.value === ins.unidadBase)?.label ?? ins.unidadBase}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
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
                onClick={() => {
                  setShowConfirm(false);
                  submitRef.current?.click();
                }}
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
                }}
              >
                Confirmar registro
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
