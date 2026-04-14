"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { Unidad } from "@prisma/client";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarCompra } from "@/app/actions/compras";
import { digitsToSalePriceString, formatCopFromDigits } from "@/app/(main)/configuracion/cop-price";
import { FAMILIA_LABEL_ES, getFamiliaUnidad, getUnidadesCompatibles } from "@/lib/unidades.config";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

const initialState: ActionState = { ok: true };

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
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

export function ComprasForm({
  proveedores,
  insumos,
}: {
  proveedores: { id: string; nombre: string }[];
  insumos: { id: string; nombre: string; unidadBase: Unidad }[];
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(registrarCompra, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const [fecha, setFecha] = useState(todayLocalISO);
  const [proveedorId, setProveedorId] = useState("");
  const [insumoId, setInsumoId] = useState("");
  const [cantidadDraft, setCantidadDraft] = useState("");
  const [unidad, setUnidad] = useState<Unidad | "">("");
  const [precioDisplay, setPrecioDisplay] = useState("");
  const [notas, setNotas] = useState("");

  const insumoSel = useMemo(() => insumos.find((i) => i.id === insumoId), [insumos, insumoId]);

  const unitOptions = useMemo(() => {
    if (!insumoSel) return [] as typeof UNIT_OPTIONS;
    const codes = getUnidadesCompatibles(insumoSel.unidadBase as string);
    return UNIT_OPTIONS.filter((u) => codes.includes(u.value));
  }, [insumoSel]);

  const precioDigits = useMemo(() => digitsToSalePriceString(precioDisplay), [precioDisplay]);
  const precioFormateado = useMemo(() => formatCopFromDigits(precioDisplay), [precioDisplay]);

  const totalFormateado = useMemo(() => {
    const qty = Number(String(cantidadDraft).replace(",", "."));
    const precio = Number(precioDigits);
    if (!Number.isFinite(qty) || !Number.isFinite(precio) || qty <= 0 || precio <= 0) {
      return "—";
    }
    const t = qty * precio;
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(t);
  }, [cantidadDraft, precioDigits]);

  useEffect(() => {
    if (state.ok) {
      setFecha(todayLocalISO());
      setProveedorId("");
      setInsumoId("");
      setCantidadDraft("");
      setUnidad("");
      setPrecioDisplay("");
      setNotas("");
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="fecha" value={fecha} />

      <div>
        <label className="text-sm font-medium text-text-secondary" htmlFor="compra-fecha">
          Fecha *
        </label>
        <input
          id="compra-fecha"
          type="date"
          value={fecha}
          max={todayLocalISO()}
          onChange={(e) => setFecha(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          required
        />
        <FieldError state={state} field="fecha" />
      </div>

      <div>
        <label className="text-sm font-medium text-text-secondary" htmlFor="compra-proveedor">
          Proveedor *
        </label>
        <select
          id="compra-proveedor"
          name="proveedorId"
          value={proveedorId}
          onChange={(e) => setProveedorId(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <FieldError state={state} field="proveedorId" />
      </div>

      <div>
        <label className="text-sm font-medium text-text-secondary" htmlFor="compra-insumo">
          Insumo *
        </label>
        <select
          id="compra-insumo"
          name="insumoId"
          value={insumoId}
          onChange={(e) => {
            const v = e.target.value;
            const ins = insumos.find((i) => i.id === v);
            setInsumoId(v);
            setUnidad(ins ? ins.unidadBase : "");
          }}
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {insumos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <FieldError state={state} field="insumoId" />
      </div>

      <div>
        <label className="text-sm font-medium text-text-secondary" htmlFor="compra-cantidad">
          Cantidad *
        </label>
        <input
          id="compra-cantidad"
          name="cantidad"
          inputMode="decimal"
          type="number"
          step="0.0001"
          min="0"
          value={cantidadDraft}
          onChange={(e) => setCantidadDraft(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          placeholder="Ej: 2,5"
        />
        <FieldError state={state} field="cantidad" />
      </div>

      <div className="flex min-w-0 flex-col">
        <label className="text-sm font-medium text-text-secondary" htmlFor="compra-unidad">
          Unidad *
        </label>
        <input type="hidden" name="unidad" value={unidad} />
        <select
          id="compra-unidad"
          value={unidad}
          onChange={(e) => setUnidad(e.target.value as Unidad)}
          required
          disabled={!insumoSel || unitOptions.length === 0}
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="" disabled>
            {insumoSel ? "Selecciona…" : "Primero elige un insumo"}
          </option>
          {unitOptions.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        {insumoSel ? <UnitHints unidadBase={insumoSel.unidadBase} /> : null}
        <FieldError state={state} field="unidad" />
      </div>

      <div>
        <label className="text-sm font-medium text-text-secondary" htmlFor="compra-precio">
          Precio unitario (COP) *
        </label>
        <input type="hidden" name="precioUnitario" value={precioDigits} />
        <input
          id="compra-precio"
          required
          inputMode="numeric"
          value={precioFormateado}
          onChange={(e) => {
            const raw = e.target.value;
            const digits = raw.replace(/[^\d]/g, "");
            setPrecioDisplay(digits);
          }}
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          placeholder="Ej: $ 15.000"
        />
        <FieldError state={state} field="precioUnitario" />
      </div>

      <div>
        <label className="text-sm font-medium text-text-secondary">Total</label>
        <div className="mt-1 flex min-h-[42px] items-center rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary">
          {totalFormateado}
        </div>
      </div>

      <div className="md:col-span-2 lg:col-span-3">
        <label className="text-sm font-medium text-text-secondary" htmlFor="compra-notas">
          Notas
        </label>
        <textarea
          id="compra-notas"
          name="notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
          placeholder="Opcional"
        />
        <FieldError state={state} field="notas" />
      </div>

      <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-3 md:flex-row md:items-center md:justify-between">
        <GlobalFeedback state={state} />
        <SubmitButton />
      </div>
    </form>
  );
}
