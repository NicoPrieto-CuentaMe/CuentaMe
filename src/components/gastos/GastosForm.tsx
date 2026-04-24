"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { GastoFijo } from "@prisma/client";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { addGastoFijo, updateGastoFijo } from "@/app/actions/gastos";
import { CATEGORIA_LABELS, METODO_PAGO_LABELS, PERIODICIDAD_LABELS } from "@/lib/gastos-constants";
import { GastosHistorial } from "@/components/gastos/GastosHistorial";
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

function GlobalFeedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  if (state.field) return null;
  return (
    <div className="mt-3 rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">
      {state.message}
    </div>
  );
}

function SuccessFeedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || !state.ok || !state.message) return null;
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-light px-3 py-2 text-sm text-accent">
      {state.message}
    </div>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
    >
      {pending ? (isEdit ? "Guardando…" : "Registrando…") : isEdit ? "Actualizar" : "Registrar gasto"}
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
  initialData?: GastoFijo;
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

  useEffect(() => {
    if (!state.ok || !state.message) return;
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
    <form action={formAction} className="space-y-5">
      {isEdit ? <input type="hidden" name="id" value={initialData!.id} /> : null}
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="monto" value={montoHidden} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="gasto-fecha">
            Fecha *
          </label>
          <input
            id="gasto-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            required
          />
          <FieldError state={state} field="fecha" />
        </div>

        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="gasto-monto">
            Monto *
          </label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
              $
            </span>
            <input
              id="gasto-monto"
              inputMode="numeric"
              type="text"
              value={montoFmt}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                setMontoDigits(digits);
              }}
              className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated py-2 pl-8 pr-3 text-sm text-text-primary outline-none focus:border-accent"
              placeholder="0"
              autoComplete="off"
              required
              aria-describedby="gasto-monto-hint"
            />
          </div>
          <p id="gasto-monto-hint" className="mt-1 text-xs text-text-tertiary">
            Ingresa el valor en pesos colombianos (COP).
          </p>
          <FieldError state={state} field="monto" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="gasto-periodicidad">
            Periodicidad *
          </label>
          <select
            id="gasto-periodicidad"
            name="periodicidad"
            value={periodicidad}
            onChange={(e) => setPeriodicidad(e.target.value as PeriodicidadGasto)}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            required
          >
            {PERIODICIDAD_KEYS.map((k) => (
              <option key={k} value={k}>
                {PERIODICIDAD_LABELS[k]}
              </option>
            ))}
          </select>
          <FieldError state={state} field="periodicidad" />
        </div>

        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="gasto-metodo">
            Método de pago *
          </label>
          <select
            id="gasto-metodo"
            name="metodoPago"
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value as MetodoPagoGasto)}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            required
          >
            {METODO_KEYS.map((k) => (
              <option key={k} value={k}>
                {METODO_PAGO_LABELS[k]}
              </option>
            ))}
          </select>
          <FieldError state={state} field="metodoPago" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="gasto-categoria">
            Categoría *
          </label>
          <select
            id="gasto-categoria"
            name="categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            required
          >
            {CATEGORIA_KEYS.map((k) => (
              <option key={k} value={k}>
                {CATEGORIA_LABELS[k]}
              </option>
            ))}
          </select>
          <FieldError state={state} field="categoria" />
        </div>

        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="gasto-notas">
            Notas
          </label>
          <textarea
            id="gasto-notas"
            name="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            maxLength={300}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            placeholder="Ej: Arriendo local principal, pago anticipado, etc."
          />
          <FieldError state={state} field="notas" />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <SuccessFeedback state={state} />
        <GlobalFeedback state={state} />
        <div className="flex justify-end">
          <SubmitButton isEdit={isEdit} />
        </div>
      </div>
    </form>
  );
}

export function GastosShell({ rows }: { rows: GastoFijo[] }) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          Nuevo gasto fijo
        </h2>
        <GastosForm
          onSuccess={() => {
            router.refresh();
          }}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Historial de gastos</h2>
        <GastosHistorial rows={rows} />
      </div>
    </div>
  );
}
