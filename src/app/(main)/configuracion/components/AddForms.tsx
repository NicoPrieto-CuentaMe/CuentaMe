"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import type { ActionState } from "../actions";
import { addDish, addRecipeIngredient, addSupplier, addSupply } from "../actions";
import { UNIT_OPTIONS } from "../units";
import type { Insumo, Plato } from "@prisma/client";

const initialState: ActionState = { ok: true };

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
        <input
          name="category"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: Carnes"
        />
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
        <input
          name="category"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: Proteínas"
        />
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
        <input
          name="category"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ej: Platos fuertes"
        />
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

export function AddRecipeIngredientForm({
  activeDishes,
  supplies,
}: {
  activeDishes: Plato[];
  supplies: Insumo[];
}) {
  const [state, formAction] = useFormState(addRecipeIngredient, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnOk(state, formRef);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 md:grid-cols-5">
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
      <div className="md:col-span-2">
        <label className="text-sm font-medium text-[var(--foreground)]">Insumo</label>
        <select
          name="supplyId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="" disabled>
            Selecciona...
          </option>
          {supplies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-[var(--foreground)]">Cantidad *</label>
        <input
          name="quantity"
          required
          inputMode="decimal"
          type="number"
          step="0.0001"
          min="0"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm font-medium text-[var(--foreground)]">Unidad *</label>
        <select
          name="unit"
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
      <div className="md:col-span-3 flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button
          type="submit"
          className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Agregar ingrediente a receta
        </button>
      </div>
    </form>
  );
}

