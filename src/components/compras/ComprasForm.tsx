"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { CategoriaProveedor, Unidad } from "@prisma/client";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarCompra } from "@/app/actions/compras";
import { digitsToSalePriceString, formatCopFromDigits } from "@/app/(main)/configuracion/cop-price";
import { FAMILIA_LABEL_ES, getFamiliaUnidad, getUnidadesCompatibles } from "@/lib/unidades.config";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

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

function emptyLine(): LineState {
  return { insumoId: "", unidad: "", cantidad: "", totalPagadoDigits: "" };
}

type LineState = {
  insumoId: string;
  unidad: string;
  cantidad: string;
  /** Total pagado en la línea (solo dígitos COP, como precio antes). */
  totalPagadoDigits: string;
};

function FieldError({ state, field }: { state: ActionState; field: string }) {
  if (!("ok" in state) || state.ok || state.field !== field) return null;
  return <p className="mt-1 text-xs text-danger">{state.message}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 38,
        padding: "0 20px",
        background: pending ? "rgba(255,255,255,0.06)" : "linear-gradient(180deg,#6b78de,#5e6ad2)",
        border: "1px solid",
        borderColor: pending ? "rgba(255,255,255,0.08)" : "rgba(113,112,255,0.5)",
        borderRadius: 10,
        color: "#fff",
        font: "590 13px/1 Inter,sans-serif",
        cursor: pending ? "not-allowed" : "pointer",
        boxShadow: pending ? "none" : "inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 14px rgba(94,106,210,0.32)",
        transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      {pending ? "Registrando…" : "Registrar compra"}
    </button>
  );
}

function UnitHints({ unidadBase }: { unidadBase: Unidad }) {
  const familia = getFamiliaUnidad(unidadBase as string);
  if (!familia) return null;
  const list = getUnidadesCompatibles(unidadBase as string)
    .map((code) => UNIT_OPTIONS.find((u) => u.value === code)?.label ?? code)
    .join(", ");
  return (
    <p className="mt-1 text-[10px] leading-tight text-text-tertiary sm:text-xs">
      Este insumo se mide en {FAMILIA_LABEL_ES[familia]}: {list}
    </p>
  );
}

function insumosFiltrados(
  proveedorId: string,
  proveedores: { id: string; categorias: CategoriaProveedor[] }[],
  insumos: { id: string; nombre: string; unidadBase: Unidad; categoria: CategoriaProveedor | null }[],
) {
  if (!proveedorId) return [];
  const p = proveedores.find((x) => x.id === proveedorId);
  if (!p || p.categorias.length === 0) return insumos;
  const set = new Set(p.categorias);
  return insumos.filter((i) => i.categoria != null && set.has(i.categoria));
}

export function ComprasForm({
  proveedores,
  insumos,
}: {
  proveedores: { id: string; nombre: string; categorias: CategoriaProveedor[] }[];
  insumos: { id: string; nombre: string; unidadBase: Unidad; categoria: CategoriaProveedor | null }[];
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(registrarCompra, initialState);

  const [fecha, setFecha] = useState(todayLocalISO);
  const [proveedorId, setProveedorId] = useState("");
  const [notas, setNotas] = useState("");
  const [lines, setLines] = useState<LineState[]>(() => [emptyLine()]);

  const disponibles = useMemo(
    () => insumosFiltrados(proveedorId, proveedores, insumos),
    [proveedorId, proveedores, insumos],
  );

  const lineasJson = useMemo(() => {
    const payload = lines.map((l) => ({
      insumoId: l.insumoId,
      cantidad: l.cantidad,
      unidad: l.unidad,
      total: digitsToSalePriceString(l.totalPagadoDigits),
    }));
    return JSON.stringify(payload);
  }, [lines]);

  const totalGeneralFmt = useMemo(() => {
    let sum = 0;
    for (const l of lines) {
      const t = Number(digitsToSalePriceString(l.totalPagadoDigits));
      if (Number.isFinite(t) && t > 0) sum += t;
    }
    if (sum <= 0) return "—";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(sum);
  }, [lines]);

  const lastProcessedState = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state === lastProcessedState.current) return;
    if (!state.ok || !state.message) return;
    lastProcessedState.current = state;
    setFecha(todayLocalISO());
    setProveedorId("");
    setNotas("");
    setLines([emptyLine()]);
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    setLines([emptyLine()]);
  }, [proveedorId]);

  function setLine(i: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function addLine() {
    setLines((prev) => (prev.length >= 20 ? prev : [...prev, emptyLine()]));
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="lineas" value={lineasJson} />

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", marginBottom: 10 }}>
          <span>
            ¿A quién le compraste? <span style={{ color: "#7170ff" }}>*</span>
          </span>
          <span style={{ color: "#62666d" }}>{proveedorId ? proveedores.find((p) => p.id === proveedorId)?.nombre : "Selecciona un proveedor"}</span>
        </div>
        <input type="hidden" name="proveedorId" value={proveedorId} />
        {proveedores.length === 0 ? (
          <p style={{ font: "400 12px/1 Inter,sans-serif", color: "#62666d" }}>Agrega proveedores primero en Configuración</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {proveedores.map((p) => {
              const on = proveedorId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProveedorId(on ? "" : p.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 13px",
                    background: on ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                    border: "1px solid",
                    borderColor: on ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    color: on ? "#fff" : "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                    transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                    boxShadow: on ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  {on && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                  {p.nombre}
                </button>
              );
            })}
          </div>
        )}
        <FieldError state={state} field="proveedorId" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr",
          gap: 12,
          marginBottom: 22,
          opacity: proveedorId ? 1 : 0.35,
          pointerEvents: proveedorId ? "auto" : "none",
          transition: "opacity 220ms",
        }}
      >
        <div>
          <label htmlFor="compra-fecha" style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>
            Fecha *
          </label>
          <input
            id="compra-fecha"
            type="date"
            name="fecha"
            max={todayLocalISO()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            style={{
              width: "100%",
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
        <div>
          <label htmlFor="compra-notas" style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>
            Notas
          </label>
          <input
            id="compra-notas"
            type="text"
            name="notas"
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
            style={{
              width: "100%",
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
          <FieldError state={state} field="notas" />
        </div>
      </div>

      <div style={{ opacity: proveedorId ? 1 : 0.35, pointerEvents: proveedorId ? "auto" : "none", transition: "opacity 220ms", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", letterSpacing: "0.5px", textTransform: "uppercase" }}>
            Insumos <span style={{ color: "#7170ff" }}>*</span>
          </span>
          <button
            type="button"
            onClick={addLine}
            disabled={lines.length >= 20}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 28,
              padding: "0 10px",
              background: "rgba(113,112,255,0.10)",
              border: "1px solid rgba(113,112,255,0.25)",
              borderRadius: 7,
              color: "#a4adff",
              font: "510 12px/1 Inter,sans-serif",
              cursor: lines.length >= 20 ? "not-allowed" : "pointer",
              opacity: lines.length >= 20 ? 0.4 : 1,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar insumo
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.map((line, i) => {
            const ins = disponibles.find((x) => x.id === line.insumoId) ?? null;
            const unitOpts = ins ? UNIT_OPTIONS.filter((u) => getUnidadesCompatibles(ins.unidadBase as string).includes(u.value)) : [];
            const totalFmt = formatCopFromDigits(line.totalPagadoDigits);
            const tp = Number(digitsToSalePriceString(line.totalPagadoDigits));
            const cant = Number(String(line.cantidad).replace(",", "."));
            const pu =
              ins && Number.isFinite(tp) && tp > 0 && Number.isFinite(cant) && cant > 0
                ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(tp / cant)
                : "—";

            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 110px 160px 90px 28px",
                  gap: 8,
                  alignItems: "end",
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                }}
              >
                <div>
                  <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Insumo *</label>
                  <select
                    value={line.insumoId}
                    onChange={(e) => {
                      const v = e.target.value;
                      const sel = disponibles.find((x) => x.id === v);
                      setLine(i, {
                        insumoId: v,
                        unidad: sel ? sel.unidadBase : "",
                        cantidad: "",
                        totalPagadoDigits: "",
                      });
                    }}
                    required
                    disabled={!proveedorId}
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 10px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 7,
                      color: line.insumoId ? "#f7f8f8" : "#62666d",
                      font: "510 12px/1 Inter,sans-serif",
                      outline: "none",
                      opacity: !proveedorId ? 0.6 : 1,
                    }}
                  >
                    <option value="">{proveedorId ? "Selecciona…" : "Elige proveedor primero"}</option>
                    {disponibles.map((insumo) => (
                      <option key={insumo.id} value={insumo.id}>
                        {insumo.nombre}
                      </option>
                    ))}
                  </select>
                  <FieldError state={state} field={`linea-${i}`} />
                </div>
                <div>
                  <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Unidad *</label>
                  <select
                    value={line.unidad}
                    onChange={(e) => setLine(i, { unidad: e.target.value })}
                    required
                    disabled={!ins || unitOpts.length === 0}
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 8px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 7,
                      color: line.unidad ? "#f7f8f8" : "#62666d",
                      font: "510 12px/1 Inter,sans-serif",
                      outline: "none",
                      opacity: !ins ? 0.4 : 1,
                    }}
                  >
                    <option value="">—</option>
                    {unitOpts.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  {ins ? <UnitHints unidadBase={ins.unidadBase} /> : null}
                </div>
                <div>
                  <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Cantidad *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    value={line.cantidad}
                    onChange={(e) => setLine(i, { cantidad: e.target.value })}
                    required
                    placeholder="0"
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 10px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 7,
                      color: "#f7f8f8",
                      font: "510 12px/1 Inter,sans-serif",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Total pagado *</label>
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#62666d",
                        font: "510 11px/1 Inter,sans-serif",
                        pointerEvents: "none",
                      }}
                    >
                      $
                    </span>
                    <input
                      inputMode="numeric"
                      value={totalFmt}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, "");
                        setLine(i, { totalPagadoDigits: digits });
                      }}
                      required
                      placeholder="0"
                      style={{
                        width: "100%",
                        height: 34,
                        padding: "0 10px 0 20px",
                        background: "rgba(0,0,0,0.30)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 7,
                        color: "#f7f8f8",
                        font: "510 12px/1 Inter,sans-serif",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ font: "510 10px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 5 }}>Unitario</label>
                  <span style={{ font: "510 12px/34px Inter,sans-serif", color: "#62666d", fontVariantNumeric: "tabular-nums" }}>{pu}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                  aria-label="Eliminar línea"
                  style={{
                    height: 28,
                    width: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(224,82,82,0.14)",
                    border: "1px solid rgba(224,82,82,0.30)",
                    borderRadius: 7,
                    color: "#ff8585",
                    cursor: lines.length === 1 ? "not-allowed" : "pointer",
                    opacity: lines.length === 1 ? 0.4 : 1,
                    flexShrink: 0,
                    alignSelf: "flex-end",
                    marginBottom: 3,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
        {state.ok === false && state.field === "lineas" ? (
          <p style={{ marginTop: 8, font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{state.message}</p>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 12px/1 Inter,sans-serif", color: "#8a8f98" }}>
          <span style={{ color: proveedorId ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: lines.some((l) => l.insumoId) ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: lines.some((l) => l.totalPagadoDigits) ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ marginLeft: 4 }}>
            {!proveedorId
              ? "Selecciona un proveedor"
              : !lines.some((l) => l.insumoId)
                ? "Agrega al menos un insumo"
                : totalGeneralFmt === "—"
                  ? "Ingresa el total pagado"
                  : totalGeneralFmt}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {state.ok === false && !("field" in state && state.field) ? (
            <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{state.message}</span>
          ) : null}
          {state.ok && state.message ? (
            <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#a4adff" }}>{state.message}</span>
          ) : null}
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
