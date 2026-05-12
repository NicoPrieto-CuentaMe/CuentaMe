"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useFormState } from "react-dom";
import type { ActionState } from "../actions";
import { addDish, addSupplier, addSupply, saveRecipeComplete } from "../actions";
import { proveedorCategoriaOptions } from "../categories";
import { digitsToSalePriceString, formatCopFromDigits } from "../cop-price";
import { FAMILIA_LABEL_ES, getFamiliaUnidad, getUnidadesCompatibles } from "@/lib/unidades.config";
import { UNIT_OPTIONS } from "../units";
import type { CategoriaProveedor, Insumo, Plato, Unidad } from "@prisma/client";
import { ProveedorCategoriasMultiSelect } from "./ProveedorCategoriasMultiSelect";

const initialState: ActionState = { ok: true };

function Feedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  return (
    <div className="mt-3 rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">
      {state.message}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando…" : label}
    </button>
  );
}

function useResetOnOk(state: ActionState, formRef: React.RefObject<HTMLFormElement>) {
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok, formRef]);
}

export function AddSupplierForm() {
  const [state, formAction] = useFormState(addSupplier, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (state.ok && state.message) {
      formRef.current?.reset();
      setNombre("");
      setTelefono("");
      setShowPhone(false);
      setSelectedCats([]);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 480);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [state]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const hasName = nombre.trim().length > 0;
  const filledFields = [hasName, !!telefono.trim(), selectedCats.length > 0].filter(Boolean).length;

  const toggleCat = (val: string) => {
    setSelectedCats((prev) => (prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]));
  };

  return (
    <form ref={formRef} action={formAction}>
      {selectedCats.map((c) => (
        <input key={c} type="hidden" name="categorias" value={c} />
      ))}

      {/* Nombre — input grande */}
      <div style={{ position: "relative", marginBottom: 22 }}>
        <input
          ref={nameRef}
          name="name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="¿Cómo se llama?"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#f7f8f8",
            font: "590 38px/1.15 Inter,sans-serif",
            letterSpacing: "-1.2px",
            padding: "4px 0 10px",
          }}
        />
        <div style={{ height: 2, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #5e6ad2 0%, #7170ff 100%)",
              borderRadius: 2,
              width: hasName ? "100%" : "0%",
              transition: "width 320ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
        {state.ok === false && state.field === "name" && (
          <p style={{ marginTop: 4, fontSize: 11, color: "#f87171" }}>{state.message}</p>
        )}
      </div>

      {/* Teléfono — progresivo */}
      <div
        style={{
          marginBottom: 22,
          opacity: hasName ? 1 : 0.35,
          pointerEvents: hasName ? "auto" : "none",
          transition: "opacity 220ms cubic-bezier(0.16,1,0.3,1)",
          minHeight: 32,
        }}
      >
        {!showPhone ? (
          <button
            type="button"
            onClick={() => {
              setShowPhone(true);
              setTimeout(() => phoneRef.current?.focus(), 30);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 30,
              padding: "0 11px",
              background: "transparent",
              border: "1px dashed rgba(255,255,255,0.12)",
              borderRadius: 999,
              color: "#8a8f98",
              font: "510 12px/1 Inter,sans-serif",
              cursor: "pointer",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.23 2 2 0 012.03 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            Agregar teléfono
          </button>
        ) : (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 32,
              padding: "0 12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a8f98" strokeWidth="1.8" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.06 1.23 2 2 0 012.03 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            <input
              ref={phoneRef}
              name="phone"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/[^0-9+\-\s()]/g, ""))}
              placeholder="3001234567"
              inputMode="tel"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#f7f8f8",
                font: "510 13px/1 Inter,sans-serif",
                width: 160,
                fontVariantNumeric: "tabular-nums",
              }}
            />
            {telefono && (
              <button
                type="button"
                onClick={() => setTelefono("")}
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
            )}
          </div>
        )}
        {state.ok === false && state.field === "phone" && (
          <p style={{ marginTop: 4, fontSize: 11, color: "#f87171" }}>{state.message}</p>
        )}
      </div>

      {/* Categorías — chips */}
      <div
        style={{
          marginBottom: 22,
          opacity: hasName ? 1 : 0.35,
          pointerEvents: hasName ? "auto" : "none",
          transition: "opacity 220ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            font: "510 11px/1 Inter,sans-serif",
            color: "#8a8f98",
            marginBottom: 10,
          }}
        >
          <span>¿En qué categorías compras?</span>
          <span style={{ color: "#62666d" }}>
            {selectedCats.length > 0
              ? `${selectedCats.length} seleccionada${selectedCats.length === 1 ? "" : "s"}`
              : "Toca las que apliquen"}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {proveedorCategoriaOptions.map((c) => {
            const on = selectedCats.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleCat(c.value)}
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
                  boxShadow: on ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                  transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                {on && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {c.label}
              </button>
            );
          })}
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
          <span style={{ color: filledFields > 0 ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: filledFields > 1 ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: filledFields > 2 ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ marginLeft: 4 }}>
            {!hasName
              ? "Empieza por el nombre"
              : filledFields === 3
                ? "Listo para crear"
                : filledFields === 2
                  ? "Falta un detalle"
                  : "Solo el nombre por ahora"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {state.ok === false && !state.field && (
            <span style={{ fontSize: 12, color: "#f87171" }}>{state.message}</span>
          )}
          {justAdded && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#a4ffb8", font: "510 11px/1 Inter,sans-serif" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Proveedor agregado
            </span>
          )}
          <SubmitButton label="Crear proveedor" />
        </div>
      </div>
    </form>
  );
}

export function AddSupplyForm() {
  const [state, formAction] = useFormState(addSupply, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedCategoria, setSelectedCategoria] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const [lastAddedName, setLastAddedName] = useState("");

  useEffect(() => {
    if (state.ok && state.message) {
      formRef.current?.reset();
      setNombre("");
      setSelectedUnit("");
      setSelectedCategoria("");
      setJustAdded(true);
      setLastAddedName(nombre);
      setTimeout(() => setJustAdded(false), 480);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const hasName = nombre.trim().length > 0;
  const hasUnit = !!selectedUnit;
  const filledFields = [hasName, hasUnit, !!selectedCategoria].filter(Boolean).length;

  const CATEGORIAS_INSUMO: { value: string; label: string }[] = [
    { value: "", label: "Sin categoría" },
    ...proveedorCategoriaOptions,
  ];

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="name" value={nombre} />
      <input type="hidden" name="baseUnit" value={selectedUnit} />
      <input type="hidden" name="categoria" value={selectedCategoria} />

      {/* Eyebrow */}
      <div
        style={{
          font: "590 10px/1 Inter,sans-serif",
          color: "#62666d",
          letterSpacing: "1.6px",
          textTransform: "uppercase",
          marginBottom: 22,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        NUEVO INSUMO
        {justAdded && lastAddedName && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: "#a4ffb8",
              font: "510 10px/1 Inter,sans-serif",
              letterSpacing: "0.4px",
              textTransform: "none",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {lastAddedName} agregado
          </span>
        )}
      </div>

      {/* Nombre — input grande */}
      <div style={{ position: "relative", marginBottom: 22 }}>
        <input
          ref={nameRef}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="¿Qué insumo agregás?"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#f7f8f8",
            font: "590 38px/1.15 Inter,sans-serif",
            letterSpacing: "-1.2px",
            padding: "4px 0 10px",
          }}
        />
        <div style={{ height: 2, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #5e6ad2 0%, #7170ff 100%)",
              borderRadius: 2,
              width: hasName ? "100%" : "0%",
              transition: "width 320ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
        {state.ok === false && state.field === "name" && (
          <p style={{ marginTop: 4, fontSize: 11, color: "#f87171" }}>{state.message}</p>
        )}
      </div>

      {/* Unidad base — chips (requerido) */}
      <div
        style={{
          marginBottom: 22,
          opacity: hasName ? 1 : 0.35,
          pointerEvents: hasName ? "auto" : "none",
          transition: "opacity 220ms",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            font: "510 11px/1 Inter,sans-serif",
            color: "#8a8f98",
            marginBottom: 10,
          }}
        >
          <span>
            Unidad base <span style={{ color: "#7170ff" }}>*</span>
          </span>
          <span style={{ color: "#62666d" }}>
            {selectedUnit
              ? `Elegiste ${UNIT_OPTIONS.find((u) => u.value === selectedUnit)?.label ?? selectedUnit}`
              : "En qué unidad lo medís"}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {UNIT_OPTIONS.map((u) => {
            const on = selectedUnit === u.value;
            return (
              <button
                key={u.value}
                type="button"
                onClick={() => setSelectedUnit(on ? "" : u.value)}
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
                {u.label}
              </button>
            );
          })}
        </div>
        {state.ok === false && state.field === "baseUnit" && (
          <p style={{ marginTop: 6, fontSize: 11, color: "#f87171" }}>{state.message}</p>
        )}
      </div>

      {/* Categoría — chips (opcional) */}
      <div
        style={{
          marginBottom: 22,
          opacity: hasName ? 1 : 0.35,
          pointerEvents: hasName ? "auto" : "none",
          transition: "opacity 220ms",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            font: "510 11px/1 Inter,sans-serif",
            color: "#8a8f98",
            marginBottom: 10,
          }}
        >
          <span>Categoría</span>
          <span style={{ color: "#62666d" }}>Para agruparlos en tu lista</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CATEGORIAS_INSUMO.map((c) => {
            const on = selectedCategoria === c.value;
            return (
              <button
                key={c.value || "__sin__"}
                type="button"
                onClick={() => setSelectedCategoria(on ? "" : c.value)}
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
                {c.label}
              </button>
            );
          })}
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
          <span style={{ color: filledFields > 0 ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: filledFields > 1 ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ color: filledFields > 2 ? "#a4adff" : "#4a4d54" }}>●</span>
          <span style={{ marginLeft: 4 }}>
            {!hasName
              ? "Empieza por el nombre"
              : !hasUnit
                ? "Falta la unidad base"
                : filledFields === 3
                  ? "Listo para crear"
                  : "Categoría es opcional"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {state.ok === false && !state.field && (
            <span style={{ fontSize: 12, color: "#f87171" }}>{state.message}</span>
          )}
          <SubmitButton label="Crear insumo" />
        </div>
      </div>
    </form>
  );
}

export function AddDishForm() {
  const [state, formAction] = useFormState(addDish, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [precioDisplay, setPrecioDisplay] = useState<string>("");

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setPrecioDisplay("");
    }
  }, [state.ok]);

  const precioNumerico = useMemo(() => digitsToSalePriceString(precioDisplay), [precioDisplay]);

  const precioFormateado = useMemo(() => formatCopFromDigits(precioDisplay), [precioDisplay]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 md:grid-cols-3">
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-text-secondary">Nombre *</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          placeholder="Ej: Hamburguesa"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-text-secondary">Precio de venta *</label>
        <input type="hidden" name="salePrice" value={precioNumerico} />
        <input
          required
          inputMode="numeric"
          value={precioFormateado}
          onChange={(e) => {
            const raw = e.target.value;
            const digits = raw.replace(/[^\d]/g, "");
            setPrecioDisplay(digits);
          }}
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          placeholder="Ej: $ 25.000"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-text-secondary">Activo</label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="dish-active"
            name="active"
            type="checkbox"
            defaultChecked
            className="h-4 w-4 rounded border-border text-accent"
          />
          <label htmlFor="dish-active" className="text-sm text-text-secondary">
            Sí
          </label>
        </div>
      </div>
      <div className="md:col-span-3 flex items-center justify-between gap-3">
        <Feedback state={state} />
        <SubmitButton label="Agregar plato" />
      </div>
    </form>
  );
}

type RecipeRow = { supplyId: string; quantity: string; unit: string };

function emptyRow(): RecipeRow {
  return { supplyId: "", quantity: "", unit: "" };
}

function RecipeInsumoUnitHints({ unidadBase }: { unidadBase: Unidad }) {
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

export function RecipeBuilderForm({
  activeDishes,
  supplies,
  initialDishId,
  lockDish = false,
  initialCount,
  initialRows,
}: {
  activeDishes: Plato[];
  supplies: Insumo[];
  initialDishId?: string;
  lockDish?: boolean;
  initialCount?: number;
  initialRows?: RecipeRow[];
}) {
  const [state, formAction] = useFormState(saveRecipeComplete, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [dishId, setDishId] = useState<string>(initialDishId ?? "");
  const [countDraft, setCountDraft] = useState<string>(String(initialCount ?? 1));
  const [count, setCount] = useState<number>(initialCount ?? 1);
  const [rows, setRows] = useState<RecipeRow[]>(() => {
    if (initialRows?.length) return initialRows;
    return Array.from({ length: initialCount ?? 1 }, () => emptyRow());
  });

  const suppliesSorted = useMemo(
    () => [...supplies].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [supplies],
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setDishId(initialDishId ?? "");
      setCountDraft("1");
      setCount(1);
      setRows([emptyRow()]);
    }
  }, [state.ok, initialDishId]);

  useEffect(() => {
    setRows((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push(emptyRow());
      return next;
    });
  }, [count]);

  useEffect(() => {
    setDishId(initialDishId ?? "");
  }, [initialDishId]);

  function commitCountFromDraft() {
    const trimmed = countDraft.trim();
    if (!trimmed) return;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(20, Math.max(1, Math.trunc(n)));
    setCountDraft(String(clamped));
    setCount(clamped);
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-text-secondary">Plato</label>
          <select
            name="dishId"
            required
            value={dishId}
            disabled={lockDish}
            onChange={(e) => setDishId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          >
            <option value="" disabled>
              Selecciona...
            </option>
            {activeDishes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-1">
          <label className="text-sm font-medium text-text-secondary"># de insumos</label>
          <div className="mt-1 flex gap-2">
            <input
              inputMode="numeric"
              value={countDraft}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setCountDraft("");
                  return;
                }
                if (!/^\d+$/.test(raw)) return;
                setCountDraft(raw);
              }}
              onBlur={commitCountFromDraft}
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              placeholder="1 a 20"
            />
            <input type="hidden" name="count" value={String(count)} />
            <button
              type="button"
              onClick={commitCountFromDraft}
              className="shrink-0 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary hover:bg-border"
            >
              Generar
            </button>
          </div>
        </div>

        <div className="md:col-span-2" />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px] rounded-lg border border-border bg-surface">
          <div className="grid grid-cols-12 gap-2 border-b border-border bg-surface-elevated px-3 py-2 text-sm font-semibold text-text-secondary">
            <div className="col-span-5">Insumo</div>
            <div className="col-span-3">Cantidad</div>
            <div className="col-span-4">Unidad</div>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r, i) => {
              const ins = r.supplyId ? suppliesSorted.find((s) => s.id === r.supplyId) : undefined;
              const compatCodes = ins ? getUnidadesCompatibles(ins.unidadBase as string) : [];
              const unitOpts =
                compatCodes.length > 0
                  ? UNIT_OPTIONS.filter((u) => compatCodes.includes(u.value))
                  : UNIT_OPTIONS;
              return (
                <div key={i} className="grid grid-cols-12 gap-2 bg-surface px-3 py-2 hover:bg-surface-elevated">
                  <div className="col-span-5">
                    <select
                      required
                      name={`supplyId_${i}`}
                      value={r.supplyId}
                      onChange={(e) => {
                        const v = e.target.value;
                        const sup = suppliesSorted.find((s) => s.id === v);
                        setRows((prev) =>
                          prev.map((p, idx) =>
                            idx === i
                              ? {
                                  ...p,
                                  supplyId: v,
                                  unit: sup ? sup.unidadBase : "",
                                }
                              : p,
                          ),
                        );
                      }}
                      className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    >
                      <option value="">Selecciona...</option>
                      {suppliesSorted.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-3">
                    <input
                      required
                      name={`quantity_${i}`}
                      inputMode="decimal"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={r.quantity}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, quantity: v } : p)));
                      }}
                      className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </div>

                  <div className="col-span-4 flex min-w-0 flex-col">
                    <select
                      required
                      name={`unit_${i}`}
                      value={r.unit}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, unit: v } : p)));
                      }}
                      className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    >
                      <option value="">Selecciona...</option>
                      {unitOpts.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    {ins ? <RecipeInsumoUnitHints unidadBase={ins.unidadBase} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <SubmitButton label="Guardar receta" />
      </div>
    </form>
  );
}

// Backwards-compat export name (not used anymore)
export const AddRecipeIngredientForm = RecipeBuilderForm;
