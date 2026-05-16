"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import type { GastoFijoSerialized } from "@/app/actions/gastos";
import { addGastoFijo, updateGastoFijo } from "@/app/actions/gastos";
import { CATEGORIA_LABELS, METODO_PAGO_LABELS, PERIODICIDAD_LABELS } from "@/lib/gastos-constants";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "@/app/(main)/configuracion/cop-price";
import type { CategoriaGasto, MetodoPagoGasto, PeriodicidadGasto } from "@prisma/client";

const initialState: ActionState = { ok: true };

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fechaToInputValue(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function FieldError({ state, field }: { state: ActionState; field: string }) {
  if (!("ok" in state) || state.ok || state.field !== field) return null;
  return <p className="mt-1 text-xs text-danger">{state.message}</p>;
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
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
      {pending ? (isEdit ? "Guardando…" : "Registrando…") : isEdit ? "Guardar cambios" : "Registrar gasto"}
    </button>
  );
}

const CATEGORIA_KEYS = Object.keys(CATEGORIA_LABELS) as CategoriaGasto[];
const PERIODICIDAD_KEYS = Object.keys(PERIODICIDAD_LABELS) as PeriodicidadGasto[];
const METODO_KEYS = Object.keys(METODO_PAGO_LABELS) as MetodoPagoGasto[];

export function GastosForm({
  onSuccess,
  initialData,
}: {
  onSuccess?: () => void;
  initialData?: GastoFijoSerialized;
}) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [addState, addAction] = useFormState(addGastoFijo, initialState);
  const [updState, updAction] = useFormState(updateGastoFijo, initialState);
  const state = isEdit ? updState : addState;
  const formAction = isEdit ? updAction : addAction;

  const [fecha, setFecha] = useState(() =>
    initialData ? fechaToInputValue(initialData.fecha) : todayLocalISO(),
  );
  const [categoria, setCategoria] = useState<CategoriaGasto>(
    () => initialData?.categoria ?? "ARRIENDO",
  );
  const [montoDigits, setMontoDigits] = useState(() =>
    initialData ? precioVentaToDigits(initialData.monto) : "",
  );
  const [periodicidad, setPeriodicidad] = useState<PeriodicidadGasto>(
    () => initialData?.periodicidad ?? "MENSUAL",
  );
  const [metodoPago, setMetodoPago] = useState<MetodoPagoGasto>(
    () => initialData?.metodoPago ?? "EFECTIVO",
  );
  const [notas, setNotas] = useState(() => initialData?.notas ?? "");

  useEffect(() => {
    if (!initialData) return;
    setFecha(fechaToInputValue(initialData.fecha));
    setCategoria(initialData.categoria);
    setMontoDigits(precioVentaToDigits(initialData.monto));
    setPeriodicidad(initialData.periodicidad);
    setMetodoPago(initialData.metodoPago);
    setNotas(initialData.notas ?? "");
  }, [initialData]);

  const montoHidden = useMemo(() => digitsToSalePriceString(montoDigits), [montoDigits]);
  const montoFmt = useMemo(() => formatCopFromDigits(montoDigits), [montoDigits]);

  const lastProcessedState = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state === lastProcessedState.current) return;
    if (!state.ok || !state.message) return;
    lastProcessedState.current = state;
    if (isEdit) {
      onSuccess?.();
      router.refresh();
      return;
    }
    setFecha(todayLocalISO());
    setCategoria("ARRIENDO");
    setMontoDigits("");
    setPeriodicidad("MENSUAL");
    setMetodoPago("EFECTIVO");
    setNotas("");
    router.refresh();
  }, [state, isEdit, onSuccess, router]);

  return (
    <form action={formAction}>
      {isEdit && <input type="hidden" name="id" value={initialData?.id} />}
      <input type="hidden" name="monto" value={montoHidden} />

      {/* Categoría — chips */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", marginBottom: 10 }}>
          ¿Qué tipo de gasto es? <span style={{ color: "#7170ff" }}>*</span>
        </div>
        <input type="hidden" name="categoria" value={categoria} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CATEGORIA_KEYS.map((k) => {
            const on = categoria === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCategoria(k)}
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
                }}
              >
                {on && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {CATEGORIA_LABELS[k]}
              </button>
            );
          })}
        </div>
        <FieldError state={state} field="categoria" />
      </div>

      {/* Monto — input gigante */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", marginBottom: 8 }}>
          Monto <span style={{ color: "#7170ff" }}>*</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ font: "590 38px/1.15 Inter,sans-serif", color: "#62666d" }}>$</span>
          <input
            inputMode="numeric"
            value={montoFmt}
            onChange={(e) => setMontoDigits(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#f7f8f8",
              font: "590 38px/1.15 Inter,sans-serif",
              letterSpacing: "-1.2px",
              width: "100%",
              padding: "4px 0 10px",
            }}
          />
        </div>
        <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2 }} />
        <FieldError state={state} field="monto" />
      </div>

      {/* Periodicidad — chips */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", marginBottom: 10 }}>
          Periodicidad <span style={{ color: "#7170ff" }}>*</span>
        </div>
        <input type="hidden" name="periodicidad" value={periodicidad} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PERIODICIDAD_KEYS.map((k) => {
            const on = periodicidad === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setPeriodicidad(k)}
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
                }}
              >
                {on && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {PERIODICIDAD_LABELS[k]}
              </button>
            );
          })}
        </div>
        <FieldError state={state} field="periodicidad" />
      </div>

      {/* Método de pago — chips */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", marginBottom: 10 }}>
          Método de pago <span style={{ color: "#7170ff" }}>*</span>
        </div>
        <input type="hidden" name="metodoPago" value={metodoPago} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {METODO_KEYS.map((k) => {
            const on = metodoPago === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMetodoPago(k)}
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
                }}
              >
                {on && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {METODO_PAGO_LABELS[k]}
              </button>
            );
          })}
        </div>
        <FieldError state={state} field="metodoPago" />
      </div>

      {/* Fecha + Notas */}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, marginBottom: 22 }}>
        <div>
          <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>
            Fecha *
          </label>
          <input
            type="date"
            name="fecha"
            value={fecha}
            max={todayLocalISO()}
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
          <label style={{ font: "510 11px/1 Inter,sans-serif", color: "#8a8f98", display: "block", marginBottom: 6 }}>
            Notas
          </label>
          <input
            type="text"
            name="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={300}
            placeholder="Ej: Arriendo local principal, pago anticipado..."
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

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 12px/1 Inter,sans-serif", color: "#8a8f98" }}>
          <span style={{ color: categoria ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: montoDigits ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: fecha ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ marginLeft: 4 }}>
            {!categoria
              ? "Selecciona una categoría"
              : !montoDigits
                ? "Ingresa el monto"
                : `${CATEGORIA_LABELS[categoria]} · ${montoFmt}`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {state.ok === false && !state.field && (
            <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#f87171" }}>{state.message}</span>
          )}
          {state.ok && state.message && (
            <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#a4adff" }}>{state.message}</span>
          )}
          <SubmitButton isEdit={isEdit} />
        </div>
      </div>
    </form>
  );
}
