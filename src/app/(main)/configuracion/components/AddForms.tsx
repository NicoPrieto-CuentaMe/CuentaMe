"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionState } from "../actions";
import { addDish, addSupplier, addSupply, saveRecipeComplete } from "../actions";
import { UNIT_OPTIONS } from "../units";
import type { Insumo, Plato } from "@prisma/client";

const initialState: ActionState = { ok: true };

const proveedorCategorias = [
  "Carnes",
  "Lácteos",
  "Verduras y frutas",
  "Granos y secos",
  "Bebidas",
  "Limpieza y desechables",
  "Otro",
] as const;

const insumoCategorias = [
  "Carnes",
  "Lácteos",
  "Verduras y frutas",
  "Granos y secos",
  "Bebidas",
  "Aceites y grasas",
  "Condimentos y salsas",
  "Panadería",
  "Limpieza y desechables",
  "Otro",
] as const;

const platoCategorias = [
  "Entradas",
  "Platos fuertes",
  "Sopas y caldos",
  "Bebidas",
  "Postres",
  "Combos",
  "Otro",
] as const;

function Feedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.message}
    </div>
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
  useResetOnOk(state, formRef);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 md:grid-cols-3">
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Nombre *</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: Distribuidora San Juan"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Teléfono</label>
        <input
          name="phone"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: 3001234567"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Categoría</label>
        <select
          name="category"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Selecciona...</option>
          {proveedorCategorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-3 flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button
          type="submit"
          className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Agregar proveedor
        </button>
      </div>
    </form>
  );
}

export function AddSupplyForm() {
  const [state, formAction] = useFormState(addSupply, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnOk(state, formRef);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 md:grid-cols-3">
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Nombre *</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: Pechuga de pollo"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Unidad base *</label>
        <select
          name="baseUnit"
          required
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
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
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Categoría</label>
        <select
          name="category"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Selecciona...</option>
          {insumoCategorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-3 flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button
          type="submit"
          className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Agregar insumo
        </button>
      </div>
    </form>
  );
}

export function AddDishForm() {
  const [state, formAction] = useFormState(addDish, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnOk(state, formRef);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 md:grid-cols-4">
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Nombre *</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: Hamburguesa"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Categoría</label>
        <select
          name="category"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Selecciona...</option>
          {platoCategorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Precio de venta *</label>
        <input
          name="salePrice"
          required
          inputMode="decimal"
          type="number"
          step="0.01"
          min="0"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: 25000"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Activo</label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="dish-active"
            name="active"
            type="checkbox"
            defaultChecked
            className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
          />
          <label htmlFor="dish-active" className="text-sm text-[var(--foreground)]/80">
            Sí
          </label>
        </div>
      </div>
      <div className="md:col-span-4 flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button
          type="submit"
          className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Agregar plato
        </button>
      </div>
    </form>
  );
}

type RecipeRow = { supplyId: string; quantity: string; unit: string };

function emptyRow(): RecipeRow {
  return { supplyId: "", quantity: "", unit: "" };
}

export function RecipeBuilderForm({
  activeDishes,
  supplies,
}: {
  activeDishes: Plato[];
  supplies: Insumo[];
}) {
  const [state, formAction] = useFormState(saveRecipeComplete, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState<number>(1);
  const [rows, setRows] = useState<RecipeRow[]>(() => [emptyRow()]);

  const suppliesSorted = useMemo(
    () => [...supplies].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [supplies],
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setCount(1);
      setRows([emptyRow()]);
    }
  }, [state.ok]);

  useEffect(() => {
    setRows((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push(emptyRow());
      return next;
    });
  }, [count]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-[var(--foreground)]">Plato</label>
          <select
            name="dishId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
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
          <label className="text-sm font-medium text-[var(--foreground)]"># de insumos</label>
          <input
            name="count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              setCount(Math.min(20, Math.max(1, Math.trunc(next))));
            }}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="md:col-span-2" />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px] rounded-lg border border-[var(--border)] bg-white">
          <div className="grid grid-cols-12 gap-2 border-b border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]/70">
            <div className="col-span-5">Insumo</div>
            <div className="col-span-3">Cantidad</div>
            <div className="col-span-4">Unidad</div>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2">
                <div className="col-span-5">
                  <select
                    required
                    name={`supplyId_${i}`}
                    value={r.supplyId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, supplyId: v } : p)));
                    }}
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    <option value="" disabled>
                      Selecciona...
                    </option>
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
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>

                <div className="col-span-4">
                  <select
                    required
                    name={`unit_${i}`}
                    value={r.unit}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => prev.map((p, idx) => (idx === i ? { ...p, unit: v } : p)));
                    }}
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
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
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button
          type="submit"
          className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Guardar receta completa
        </button>
      </div>
    </form>
  );
}

// Backwards-compat export name (not used anymore)
export const AddRecipeIngredientForm = RecipeBuilderForm;
