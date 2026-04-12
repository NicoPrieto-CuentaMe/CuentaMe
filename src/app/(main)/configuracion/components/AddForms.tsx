"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import type { ActionState } from "../actions";
import { addDish, addSupplier, addSupply, saveRecipeComplete } from "../actions";
import { insumoCategorias } from "../categories";
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

function useResetOnOk(state: ActionState, formRef: React.RefObject<HTMLFormElement>) {
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok, formRef]);
}

export function AddSupplierForm() {
  const [state, formAction] = useFormState(addSupplier, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [categorias, setCategorias] = useState<CategoriaProveedor[]>([]);
  const [categoriasKey, setCategoriasKey] = useState(0);
  useResetOnOk(state, formRef);

  useEffect(() => {
    if (state.ok) {
      setCategorias([]);
      setCategoriasKey((k) => k + 1);
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 md:grid-cols-3">
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-text-secondary">Nombre *</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          placeholder="Ej: Distribuidora San Juan"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-text-secondary">Teléfono</label>
        <input
          name="phone"
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          placeholder="Ej: 3001234567"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-text-secondary">Categorías</label>
        <div className="mt-1">
          <ProveedorCategoriasMultiSelect
            key={categoriasKey}
            name="categorias"
            value={categorias}
            onChange={setCategorias}
          />
        </div>
      </div>
      <div className="md:col-span-3 flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button
          type="submit"
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
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
        <label className="text-sm font-medium text-text-secondary">Nombre *</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          placeholder="Ej: Pechuga de pollo"
        />
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium text-text-secondary">Unidad base *</label>
        <select
          name="baseUnit"
          required
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
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
        <label className="text-sm font-medium text-text-secondary">Categoría</label>
        <select
          name="category"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
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
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
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
        <button
          type="submit"
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
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
        <button
          type="submit"
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Guardar receta completa
        </button>
      </div>
    </form>
  );
}

// Backwards-compat export name (not used anymore)
export const AddRecipeIngredientForm = RecipeBuilderForm;
