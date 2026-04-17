"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarVenta } from "@/app/actions/ventas";
import {
  CANALES_DOMICILIO,
  METODOS_PAGO,
  TIPO_MESA,
  tipoDomicilio,
} from "@/lib/ventas-constants";

const initialState: ActionState = { ok: true };

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowTimeHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type PlatoRow = {
  id: string;
  nombre: string;
  precioVenta: { toString(): string } | string | number;
  categoriaId: string | null;
  categoria: { id: string; nombre: string } | null;
};

function precioNum(p: PlatoRow): number {
  const x = Number(p.precioVenta);
  return Number.isFinite(x) ? x : 0;
}

function formatCop(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function buildPlatoSections(platos: PlatoRow[]): { key: string; titulo: string; platos: PlatoRow[] }[] {
  const byKey = new Map<string, PlatoRow[]>();
  for (const p of platos) {
    const key = p.categoriaId ?? "__sin__";
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(p);
  }
  for (const arr of Array.from(byKey.values())) {
    arr.sort((a: PlatoRow, b: PlatoRow) => a.nombre.localeCompare(b.nombre, "es"));
  }
  const keys = Array.from(byKey.keys()).filter((k) => k !== "__sin__");
  keys.sort((a, b) => {
    const pa = platos.find((p) => (p.categoriaId ?? "__sin__") === a);
    const pb = platos.find((p) => (p.categoriaId ?? "__sin__") === b);
    const na = pa?.categoria?.nombre ?? "";
    const nb = pb?.categoria?.nombre ?? "";
    return na.localeCompare(nb, "es");
  });
  const sections: { key: string; titulo: string; platos: PlatoRow[] }[] = [];
  for (const k of keys) {
    const list = byKey.get(k)!;
    const titulo = list[0]?.categoria?.nombre?.trim() || "Categoría";
    sections.push({ key: k, titulo, platos: list });
  }
  const sin = byKey.get("__sin__");
  if (sin?.length) {
    sections.push({ key: "__sin__", titulo: "Sin categoría", platos: sin });
  }
  return sections;
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

function SubmitBar({ totalFmt, disabled }: { totalFmt: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
    >
      {pending ? "Registrando…" : `Registrar · ${totalFmt}`}
    </button>
  );
}

export function VentasForm({ platos }: { platos: PlatoRow[] }) {
  const router = useRouter();
  const [state, formAction] = useFormState(registrarVenta, initialState);

  const [fecha, setFecha] = useState(todayLocalISO);
  const [hora, setHora] = useState(nowTimeHHMM);
  const [ventaKind, setVentaKind] = useState<"mesa" | "domicilio">("mesa");
  const [canal, setCanal] = useState<string>(CANALES_DOMICILIO[0]!);
  const [metodoPago, setMetodoPago] = useState<string>(METODOS_PAGO[0]!);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [lineasError, setLineasError] = useState<string | null>(null);

  const tipoStr = ventaKind === "mesa" ? TIPO_MESA : tipoDomicilio(canal);

  const sections = useMemo(() => buildPlatoSections(platos), [platos]);

  const lineasPayload = useMemo(() => {
    const lineas: { platoId: string; cantidad: number }[] = [];
    for (const p of platos) {
      const q = cantidades[p.id] ?? 0;
      if (q > 0) lineas.push({ platoId: p.id, cantidad: q });
    }
    return JSON.stringify(lineas);
  }, [platos, cantidades]);

  const totalGeneral = useMemo(() => {
    let sum = 0;
    for (const p of platos) {
      const q = cantidades[p.id] ?? 0;
      if (q > 0) sum += q * precioNum(p);
    }
    return sum;
  }, [platos, cantidades]);

  const totalFmt = formatCop(totalGeneral);
  const tieneLineas = totalGeneral > 0;

  useEffect(() => {
    if (state.ok) {
      setCantidades({});
      setLineasError(null);
      router.refresh();
    }
  }, [state.ok, router]);

  function setQty(platoId: string, delta: number) {
    setLineasError(null);
    setCantidades((prev) => {
      const cur = prev[platoId] ?? 0;
      const next = Math.max(0, Math.min(99, cur + delta));
      const out = { ...prev };
      if (next === 0) delete out[platoId];
      else out[platoId] = next;
      return out;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!tieneLineas) {
      e.preventDefault();
      setLineasError("Agrega al menos un plato con cantidad mayor a 0.");
      return;
    }
    setLineasError(null);
  }

  const pillOn =
    "rounded-full border-2 border-accent bg-accent-light px-4 py-2 text-sm font-semibold text-accent shadow-sm";
  const pillOff =
    "rounded-full border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text-secondary hover:border-accent/40";

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col pb-2">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="hora" value={hora} />
      <input type="hidden" name="tipo" value={tipoStr} />
      <input type="hidden" name="metodoPago" value={metodoPago} />
      <input type="hidden" name="lineas" value={lineasPayload} />

      <div className="grid gap-4 md:grid-cols-[180px_120px_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
        <div>
          <label className="text-sm font-medium text-text-secondary" htmlFor="venta-fecha">
            Fecha *
          </label>
          <input
            id="venta-fecha"
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
          <label className="text-sm font-medium text-text-secondary" htmlFor="venta-hora">
            Hora *
          </label>
          <input
            id="venta-hora"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            required
          />
          <FieldError state={state} field="hora" />
        </div>

        <div className="min-w-0">
          <span className="text-sm font-medium text-text-secondary">Tipo de venta *</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVentaKind("mesa")}
              className={ventaKind === "mesa" ? pillOn : pillOff}
            >
              Mesa
            </button>
            <button
              type="button"
              onClick={() => setVentaKind("domicilio")}
              className={ventaKind === "domicilio" ? pillOn : pillOff}
            >
              Domicilio ▾
            </button>
          </div>
          {ventaKind === "domicilio" ? (
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              aria-label="Canal de domicilio"
            >
              {CANALES_DOMICILIO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : null}
          <FieldError state={state} field="tipo" />
        </div>

        <div className="min-w-0">
          <label className="text-sm font-medium text-text-secondary" htmlFor="venta-metodo">
            Método de pago *
          </label>
          <select
            id="venta-metodo"
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          >
            {METODOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <FieldError state={state} field="metodoPago" />
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {platos.length === 0 ? (
          <p className="text-sm text-text-tertiary">No tienes platos activos. Créalos en Configuración.</p>
        ) : (
          sections.map((sec) => (
            <section key={sec.key}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{sec.titulo}</h3>
                <span className="inline-flex min-h-[1.25rem] items-center rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-xs tabular-nums text-text-tertiary">
                  {sec.platos.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {sec.platos.map((p) => {
                  const q = cantidades[p.id] ?? 0;
                  const selected = q > 0;
                  const precio = precioNum(p);
                  return (
                    <div
                      key={p.id}
                      className={`flex flex-col rounded-xl border-2 p-3 transition-colors ${
                        selected
                          ? "border-accent bg-accent-light/20 shadow-sm"
                          : "border-border bg-surface-elevated/50 opacity-75"
                      }`}
                    >
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-text-primary">
                        {p.nombre}
                      </p>
                      <p className="mt-1 text-sm font-medium text-text-secondary">{formatCop(precio)}</p>
                      <div className="mt-3 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQty(p.id, -1)}
                          disabled={q <= 0}
                          className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-lg border border-border bg-surface-elevated text-lg font-semibold text-text-primary hover:bg-border disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Menos ${p.nombre}`}
                        >
                          −
                        </button>
                        <span className="min-w-[2rem] text-center text-lg font-bold tabular-nums text-text-primary">
                          {q}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(p.id, 1)}
                          disabled={q >= 99}
                          className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-lg border border-border bg-surface-elevated text-lg font-semibold text-text-primary hover:bg-border disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Más ${p.nombre}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {(lineasError ||
        (state.ok === false &&
          (state.field === "lineas" || (state.field?.startsWith("linea-") ?? false)))) && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {lineasError ?? (state.ok === false ? state.message : null)}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-border bg-surface px-6 pb-2 pt-4 shadow-[0_-6px_16px_rgba(0,0,0,0.12)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Total</p>
            <p className="text-xl font-bold tabular-nums text-text-primary">{totalFmt}</p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <SuccessFeedback state={state} />
            <GlobalFeedback state={state} />
            <SubmitBar totalFmt={totalFmt} disabled={!tieneLineas} />
          </div>
        </div>
      </div>
    </form>
  );
}
