"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { CategoriaProveedor, Unidad } from "@prisma/client";
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

  useEffect(() => {
    if (state.ok) {
      setFecha(todayLocalISO());
      setProveedorId("");
      setNotas("");
      setLines([emptyLine()]);
      router.refresh();
    }
  }, [state.ok, router]);

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
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="lineas" value={lineasJson} />

      <div className="grid gap-4 md:grid-cols-2">
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

        <div className="md:col-span-2">
          <label className="text-sm font-medium text-text-secondary" htmlFor="compra-notas">
            Notas
          </label>
          <textarea
            id="compra-notas"
            name="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            placeholder="Opcional"
          />
          <FieldError state={state} field="notas" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Insumos</h3>
          <button
            type="button"
            onClick={addLine}
            disabled={lines.length >= 20}
            className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agregar insumo
          </button>
        </div>
        <FieldError state={state} field="lineas" />

        <div className="space-y-4 overflow-x-auto pb-1">
          {lines.map((line, i) => {
            const insumoSel = disponibles.find((x) => x.id === line.insumoId);
            const unitOpts = insumoSel
              ? UNIT_OPTIONS.filter((u) => getUnidadesCompatibles(insumoSel.unidadBase as string).includes(u.value))
              : [];
            const totalFmt = formatCopFromDigits(line.totalPagadoDigits);
            const qty = Number(String(line.cantidad).replace(",", "."));
            const totalN = Number(digitsToSalePriceString(line.totalPagadoDigits));
            const unidadLbl = line.unidad
              ? UNIT_OPTIONS.find((u) => u.value === line.unidad)?.label ?? line.unidad
              : "";
            const precioUnitarioHint =
              Number.isFinite(qty) &&
              qty > 0 &&
              Number.isFinite(totalN) &&
              totalN > 0 &&
              line.unidad
                ? (() => {
                    const pu = totalN / qty;
                    const cop = new Intl.NumberFormat("es-CO", {
                      style: "currency",
                      currency: "COP",
                      maximumFractionDigits: 0,
                    }).format(pu);
                    return `≈ ${cop} / ${unidadLbl}`;
                  })()
                : null;

            return (
              <div
                key={i}
                className="rounded-lg border border-border bg-surface-elevated/50 p-3 min-w-[min(100%,720px)]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-text-tertiary">Línea {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 1}
                    className="rounded px-2 py-0.5 text-lg leading-none text-text-tertiary hover:bg-border hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Eliminar línea"
                  >
                    ×
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                  <div className="lg:col-span-3">
                    <label className="text-xs font-medium text-text-secondary">Insumo *</label>
                    <select
                      value={line.insumoId}
                      onChange={(e) => {
                        const v = e.target.value;
                        const ins = disponibles.find((x) => x.id === v);
                        setLine(i, { insumoId: v, unidad: ins ? ins.unidadBase : "" });
                      }}
                      required
                      disabled={!proveedorId}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="" disabled>
                        {proveedorId ? "Selecciona…" : "Elige proveedor primero"}
                      </option>
                      {disponibles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                    <FieldError state={state} field={`linea-${i}`} />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">Unidad *</label>
                    <select
                      value={line.unidad}
                      onChange={(e) => setLine(i, { unidad: e.target.value })}
                      required
                      disabled={!insumoSel || unitOpts.length === 0}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-60"
                    >
                      <option value="" disabled>
                        {insumoSel ? "Selecciona…" : "—"}
                      </option>
                      {unitOpts.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    {insumoSel ? <UnitHints unidadBase={insumoSel.unidadBase} /> : null}
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">Cantidad *</label>
                    <input
                      inputMode="decimal"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={line.cantidad}
                      onChange={(e) => setLine(i, { cantidad: e.target.value })}
                      required
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="text-xs font-medium text-text-secondary">Total pagado *</label>
                    <input
                      inputMode="numeric"
                      value={totalFmt}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, "");
                        setLine(i, { totalPagadoDigits: digits });
                      }}
                      required
                      className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                      placeholder="Ej: 45000"
                    />
                  </div>
                  <div className="lg:col-span-2 lg:flex lg:min-h-[72px] lg:flex-col lg:justify-end">
                    <span className="text-xs font-medium text-text-tertiary">Precio unitario (calculado)</span>
                    <p className="mt-1 text-sm leading-snug text-text-secondary">
                      {precioUnitarioHint ?? "—"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-sm font-medium text-text-secondary">Total general</span>
          <div className="mt-1 text-lg font-semibold text-text-primary">{totalGeneralFmt}</div>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <GlobalFeedback state={state} />
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
