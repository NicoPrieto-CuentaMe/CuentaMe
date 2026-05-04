"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { CategoriaProveedor, Unidad } from "@prisma/client";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarInventario } from "@/app/actions/inventario";
import { proveedorCategoriaOptions } from "@/app/(main)/configuracion/categories";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";
import type { StockCalculadoInfo } from "@/lib/inventario-stock-calculado";

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

type InsumoRow = {
  id: string;
  nombre: string;
  unidadBase: Unidad;
  categoria: CategoriaProveedor | null;
};

type LineVals = { stockReal: string; notas: string };

type ViewMode = "home" | "categoria" | "insumo";

function unitLabel(u: Unidad): string {
  return UNIT_OPTIONS.find((x) => x.value === u)?.label ?? u;
}

function formatStockRef(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

function StockCalculadoCell({ info }: { info: StockCalculadoInfo | undefined }) {
  if (!info || info.status === "sin-base") {
    return <p className="text-sm text-text-tertiary">Sin conteo base</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-sm text-text-secondary">
        ≈ {formatStockRef(info.valor)} {info.unidadLabel}
      </p>
      {info.unidadesMixtas ? (
        <p className="text-xs font-medium text-warning">⚠ unidades mixtas</p>
      ) : null}
    </div>
  );
}

function insumosEnCategoria(insumos: InsumoRow[], cat: CategoriaProveedor): InsumoRow[] {
  if (cat === "OTRO") {
    return insumos.filter((i) => i.categoria === "OTRO" || i.categoria === null);
  }
  return insumos.filter((i) => i.categoria === cat);
}

function FieldError({ state, field }: { state: ActionState; field: string }) {
  if (!("ok" in state) || state.ok || state.field !== field) return null;
  return <p className="mt-1 text-xs text-danger">{state.message}</p>;
}

function GlobalFeedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  if (state.field) return null;
  return (
    <div className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">
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

function SubmitBar({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
    >
      {pending
        ? "Registrando…"
        : `Registrar conteo (${count} ${count === 1 ? "insumo" : "insumos"})`}
    </button>
  );
}

function InsumoFieldsRow({
  ins,
  vals,
  onChange,
  stockInfo,
}: {
  ins: InsumoRow;
  vals: LineVals;
  onChange: (patch: Partial<LineVals>) => void;
  stockInfo: StockCalculadoInfo | undefined;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface-elevated/50 p-3 sm:grid-cols-12 sm:items-end">
      <div className="sm:col-span-3">
        <span className="text-xs font-medium text-text-tertiary">Insumo</span>
        <p className="mt-1 text-sm font-medium text-text-primary">{ins.nombre}</p>
      </div>
      <div className="sm:col-span-2">
        <span className="text-xs font-medium text-text-tertiary">Stock calculado</span>
        <div className="mt-1">
          <StockCalculadoCell info={stockInfo} />
        </div>
      </div>
      <div className="sm:col-span-2">
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
          value={vals.stockReal}
          onChange={(e) => onChange({ stockReal: e.target.value })}
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
          value={vals.notas}
          onChange={(e) => onChange({ notas: e.target.value })}
          className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
          placeholder="Notas..."
        />
      </div>
    </div>
  );
}

export function InventarioForm({
  insumos,
  stockCalculadoById,
}: {
  insumos: InsumoRow[];
  stockCalculadoById: Record<string, StockCalculadoInfo>;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(registrarInventario, initialState);

  const [fecha, setFecha] = useState(todayLocalISO);
  const [lines, setLines] = useState<Record<string, LineVals>>({});
  const [view, setView] = useState<ViewMode>("home");
  const [categoriaSel, setCategoriaSel] = useState<CategoriaProveedor | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [inlineEmptyError, setInlineEmptyError] = useState<string | null>(null);

  const getVals = (id: string): LineVals =>
    lines[id] ?? { stockReal: "", notas: "" };

  const setVals = (id: string, patch: Partial<LineVals>) => {
    setInlineEmptyError(null);
    setLines((prev) => {
      const cur = prev[id] ?? { stockReal: "", notas: "" };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const filledCount = useMemo(() => {
    let n = 0;
    for (const ins of insumos) {
      const t = (lines[ins.id]?.stockReal ?? "").trim();
      if (t !== "") n += 1;
    }
    return n;
  }, [insumos, lines]);

  const lineasJson = useMemo(() => {
    const lineas: { insumoId: string; stockReal: string; notas?: string }[] = [];
    for (const ins of insumos) {
      const v = lines[ins.id];
      if (!v) continue;
      const t = v.stockReal.trim();
      if (t === "") continue;
      const entry: { insumoId: string; stockReal: string; notas?: string } = {
        insumoId: ins.id,
        stockReal: t.replace(",", "."),
      };
      const note = v.notas.trim();
      if (note) entry.notas = note;
      lineas.push(entry);
    }
    return JSON.stringify(lineas);
  }, [insumos, lines]);

  const insumosFiltradosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return insumos.filter((i) => i.nombre.toLowerCase().includes(q));
  }, [insumos, busqueda]);

  const listaCategoria = useMemo(() => {
    if (categoriaSel == null) return [];
    return insumosEnCategoria(insumos, categoriaSel);
  }, [insumos, categoriaSel]);

  const lastProcessedState = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state === lastProcessedState.current) return;
    if (!state.ok || !state.message) return;
    lastProcessedState.current = state;
    setFecha(todayLocalISO());
    setLines({});
    setView("home");
    setCategoriaSel(null);
    setBusqueda("");
    setInlineEmptyError(null);
    router.refresh();
  }, [state, router]);

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (filledCount === 0) {
      e.preventDefault();
      setInlineEmptyError("Ingresa el stock de al menos un insumo.");
      return;
    }
    setInlineEmptyError(null);
  }

  return (
    <form action={formAction} onSubmit={handleFormSubmit} className="flex flex-col">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="lineas" value={lineasJson} />

      <div className="min-h-0 flex-1 space-y-6 pb-4">
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

        {insumos.length === 0 ? (
          <p className="text-sm text-text-tertiary">No tienes insumos activos. Créalos en Configuración.</p>
        ) : (
          <div className="space-y-4">
            {view === "home" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setView("categoria")}
                  className="flex min-h-[4.5rem] items-center justify-center gap-2 rounded-xl border-2 border-border bg-surface-elevated px-4 py-4 text-base font-semibold text-text-primary transition-colors hover:border-accent hover:bg-accent-light/30"
                >
                  <span className="text-2xl" aria-hidden>
                    🏷
                  </span>
                  Buscar por categoría
                </button>
                <button
                  type="button"
                  onClick={() => setView("insumo")}
                  className="flex min-h-[4.5rem] items-center justify-center gap-2 rounded-xl border-2 border-border bg-surface-elevated px-4 py-4 text-base font-semibold text-text-primary transition-colors hover:border-accent hover:bg-accent-light/30"
                >
                  <span className="text-2xl" aria-hidden>
                    🔍
                  </span>
                  Buscar por insumo
                </button>
              </div>
            ) : null}

            {view === "categoria" ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setView("home");
                    setCategoriaSel(null);
                  }}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  ← Volver
                </button>
                <p className="text-xs font-medium text-text-tertiary">Categoría</p>
                <div className="flex flex-wrap gap-2">
                  {proveedorCategoriaOptions.map((opt) => {
                    const active = categoriaSel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategoriaSel(opt.value)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? "border-accent bg-accent-light text-accent"
                            : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {categoriaSel == null ? (
                  <p className="text-sm text-text-tertiary">Selecciona una categoría para ver sus insumos.</p>
                ) : listaCategoria.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No hay insumos en esta categoría.</p>
                ) : (
                  <div className="space-y-3">
                    {listaCategoria.map((ins) => (
                      <InsumoFieldsRow
                        key={ins.id}
                        ins={ins}
                        vals={getVals(ins.id)}
                        onChange={(p) => setVals(ins.id, p)}
                        stockInfo={stockCalculadoById[ins.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {view === "insumo" ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setView("home");
                    setBusqueda("");
                  }}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  ← Volver
                </button>
                <div>
                  <label className="text-sm font-medium text-text-secondary" htmlFor="inv-buscar">
                    Buscar insumo
                  </label>
                  <input
                    id="inv-buscar"
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Escribe el nombre…"
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    autoComplete="off"
                  />
                </div>
                {!busqueda.trim() ? (
                  <p className="text-sm text-text-tertiary">Escribe para filtrar por nombre.</p>
                ) : insumosFiltradosBusqueda.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No hay insumos que coincidan.</p>
                ) : (
                  <div className="space-y-3">
                    {insumosFiltradosBusqueda.map((ins) => (
                      <InsumoFieldsRow
                        key={ins.id}
                        ins={ins}
                        vals={getVals(ins.id)}
                        onChange={(p) => setVals(ins.id, p)}
                        stockInfo={stockCalculadoById[ins.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {(inlineEmptyError || (state.ok === false && state.field === "lineas")) && (
          <p className="text-sm text-danger" role="alert">
            {inlineEmptyError ?? (state.ok === false ? state.message : null)}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-6 mt-2 border-t border-border bg-surface px-6 pb-1 pt-4 shadow-[0_-6px_16px_rgba(0,0,0,0.12)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SuccessFeedback state={state} />
          <div className="flex flex-col items-stretch gap-3 sm:ml-auto sm:items-end">
            <GlobalFeedback state={state} />
            <SubmitBar count={filledCount} />
          </div>
        </div>
      </div>
    </form>
  );
}
