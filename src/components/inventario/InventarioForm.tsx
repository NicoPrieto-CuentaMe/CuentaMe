"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { CategoriaProveedor, Unidad } from "@prisma/client";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarInventario } from "@/app/actions/inventario";
import { proveedorCategoriaOptions } from "@/app/(main)/configuracion/categories";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

const initialState: ActionState = { ok: true };

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type InsumoRow = {
  id: string;
  nombre: string;
  unidadBase: Unidad;
  categoria: CategoriaProveedor | null;
};

function buildInsumoSections(insumos: InsumoRow[]): { key: string; label: string; count: number; items: InsumoRow[] }[] {
  const byKey = new Map<string, InsumoRow[]>();
  for (const inv of insumos) {
    const key = inv.categoria ?? "__sin__";
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(inv);
  }
  for (const arr of Array.from(byKey.values())) {
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  const sections: { key: string; label: string; count: number; items: InsumoRow[] }[] = [];
  for (const opt of proveedorCategoriaOptions) {
    const list = byKey.get(opt.value) ?? [];
    if (list.length > 0) {
      sections.push({ key: opt.value, label: opt.label, count: list.length, items: list });
    }
  }
  const sin = byKey.get("__sin__") ?? [];
  if (sin.length > 0) {
    sections.push({ key: "__sin__", label: "Sin categoría", count: sin.length, items: sin });
  }
  return sections;
}

function unitLabel(u: Unidad): string {
  return UNIT_OPTIONS.find((x) => x.value === u)?.label ?? u;
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Registrando…" : "Registrar conteo"}
    </button>
  );
}

export function InventarioForm({ insumos }: { insumos: InsumoRow[] }) {
  const router = useRouter();
  const [state, formAction] = useFormState(registrarInventario, initialState);

  const [fecha, setFecha] = useState(todayLocalISO);
  const [stockById, setStockById] = useState<Record<string, string>>({});
  const [notasById, setNotasById] = useState<Record<string, string>>({});

  const sections = useMemo(() => buildInsumoSections(insumos), [insumos]);

  const lineasJson = useMemo(() => {
    const lineas: { insumoId: string; stockReal: string; notas?: string }[] = [];
    for (const ins of insumos) {
      const raw = stockById[ins.id];
      if (raw === undefined || raw === null) continue;
      const t = String(raw).trim();
      if (t === "") continue;
      const entry: { insumoId: string; stockReal: string; notas?: string } = {
        insumoId: ins.id,
        stockReal: t.replace(",", "."),
      };
      const n = notasById[ins.id]?.trim();
      if (n) entry.notas = n;
      lineas.push(entry);
    }
    return JSON.stringify(lineas);
  }, [insumos, stockById, notasById]);

  useEffect(() => {
    if (state.ok) {
      setStockById({});
      setNotasById({});
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="lineas" value={lineasJson} />

      <div className="grid gap-4 md:grid-cols-2 md:items-end">
        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="inv-fecha">
            Fecha *
          </label>
          <input
            id="inv-fecha"
            type="date"
            value={fecha}
            max={todayLocalISO()}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            required
          />
          <FieldError state={state} field="fecha" />
        </div>
        <p className="text-sm text-text-tertiary md:pb-2">
          Registra el stock real que tienes actualmente en tu depósito.
        </p>
      </div>

      <div>
        <FieldError state={state} field="lineas" />
        {insumos.length === 0 ? (
          <p className="text-sm text-text-tertiary">No tienes insumos activos. Créalos en Configuración.</p>
        ) : (
          <div className="space-y-8">
            {sections.map((sec) => (
              <section key={sec.key}>
                <h3 className="mb-3 text-sm font-semibold text-text-primary">{sec.label}</h3>
                <div className="space-y-3">
                  {sec.items.map((ins) => (
                    <div
                      key={ins.id}
                      className="grid gap-3 rounded-lg border border-border bg-surface-elevated/50 p-3 sm:grid-cols-12 sm:items-end"
                    >
                      <div className="sm:col-span-4">
                        <span className="text-xs font-medium text-text-tertiary">Insumo</span>
                        <p className="mt-1 text-sm font-medium text-text-primary">{ins.nombre}</p>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-xs font-medium text-text-secondary" htmlFor={`stock-${ins.id}`}>
                          Stock real
                        </label>
                        <input
                          id={`stock-${ins.id}`}
                          inputMode="decimal"
                          type="number"
                          step="0.0001"
                          min="0"
                          max="9999"
                          value={stockById[ins.id] ?? ""}
                          onChange={(e) =>
                            setStockById((prev) => ({ ...prev, [ins.id]: e.target.value }))
                          }
                          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                          placeholder="—"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-xs font-medium text-text-tertiary">Unidad</span>
                        <p className="mt-1 text-sm text-text-secondary">{unitLabel(ins.unidadBase)}</p>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-xs font-medium text-text-secondary" htmlFor={`notas-${ins.id}`}>
                          Notas
                        </label>
                        <input
                          id={`notas-${ins.id}`}
                          type="text"
                          maxLength={500}
                          value={notasById[ins.id] ?? ""}
                          onChange={(e) =>
                            setNotasById((prev) => ({ ...prev, [ins.id]: e.target.value }))
                          }
                          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                          placeholder="Notas..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <SuccessFeedback state={state} />
        <div className="flex flex-col items-stretch gap-3 sm:ml-auto sm:items-end">
          <GlobalFeedback state={state} />
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
