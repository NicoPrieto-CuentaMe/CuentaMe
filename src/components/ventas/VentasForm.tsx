"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarVenta } from "@/app/actions/ventas";
import type { CanalDomicilio, MetodoPagoVenta } from "@prisma/client";
import {
  CANAL_DOMICILIO_LABELS,
  CANALES_DOMICILIO,
  METODO_PAGO_VENTA_LABELS,
  METODOS_PAGO_VENTA,
} from "@/lib/ventas-constants";

const initialState: ActionState = { ok: true };

// Colombia = UTC-5 (sin horario de verano). Usamos offset fijo para
// que la fecha y hora coincidan con las almacenadas en BD.
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

function nowTimeHHMM(): string {
  const d = nowEnColombia();
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

type PlatoRow = {
  id: string;
  nombre: string;
  precioVenta: { toString(): string } | string | number;
  categoriaId: string | null;
  categoria: { id: string; nombre: string } | null;
};

type ViewMode = "home" | "categoria" | "plato";

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

const btnCounter =
  "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-lg font-semibold text-text-primary hover:bg-border disabled:cursor-not-allowed disabled:opacity-40";

function PlatoCard({
  p,
  cantidad,
  onDelta,
}: {
  p: PlatoRow;
  cantidad: number;
  onDelta: (delta: number) => void;
}) {
  const q = cantidad;
  const selected = q > 0;
  const precio = precioNum(p);
  return (
    <div
      className={`flex flex-col rounded-xl border-2 p-3 transition-colors ${
        selected
          ? "border-accent bg-accent-light/20 shadow-sm"
          : "border-border bg-surface-elevated/50 opacity-75"
      }`}
    >
      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-text-primary">{p.nombre}</p>
      <p className="mt-1 text-sm font-medium text-text-secondary">{formatCop(precio)}</p>
      <div className="mt-3 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => onDelta(-1)}
          disabled={q <= 0}
          className={btnCounter}
          aria-label={`Menos ${p.nombre}`}
        >
          −
        </button>
        <span className="min-w-[2rem] text-center text-lg font-bold tabular-nums text-text-primary">{q}</span>
        <button
          type="button"
          onClick={() => onDelta(1)}
          disabled={q >= 99}
          className={btnCounter}
          aria-label={`Más ${p.nombre}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function PedidoActual({
  platos,
  cantidades,
  setCantidades,
  setLineasError,
}: {
  platos: PlatoRow[];
  cantidades: Record<string, number>;
  setCantidades: Dispatch<SetStateAction<Record<string, number>>>;
  setLineasError: (v: string | null) => void;
}) {
  const platoMap = useMemo(() => new Map(platos.map((p) => [p.id, p])), [platos]);
  const orderedIds = useMemo(
    () => Object.keys(cantidades).filter((id) => (cantidades[id] ?? 0) > 0),
    [cantidades],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setEditingId(null);
        setDraftQty("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId]);

  function commitEdit(platoId: string) {
    const raw = draftQty.trim();
    const parsed = parseInt(raw, 10);
    setLineasError(null);
    setCantidades((prev) => {
      const out = { ...prev };
      if (raw === "" || !Number.isFinite(parsed) || parsed <= 0) {
        delete out[platoId];
      } else {
        out[platoId] = Math.max(1, Math.min(99, parsed));
      }
      return out;
    });
    setEditingId(null);
    setDraftQty("");
  }

  function removePlato(platoId: string) {
    setLineasError(null);
    setCantidades((prev) => {
      const out = { ...prev };
      delete out[platoId];
      return out;
    });
    if (editingId === platoId) {
      setEditingId(null);
      setDraftQty("");
    }
  }

  if (orderedIds.length === 0) return null;

  const btnIcon =
    "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-base leading-none text-text-primary hover:bg-border";

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-text-secondary">Pedido actual</h3>
      <ul className="mt-3 space-y-2">
        {orderedIds.map((id) => {
          const p = platoMap.get(id);
          const q = cantidades[id] ?? 0;
          if (q <= 0) return null;
          const nombre = p?.nombre ?? "Plato";
          const precio = p ? precioNum(p) : 0;
          const isEditing = editingId === id;
          const qForSub = isEditing
            ? (() => {
                const t = draftQty.trim();
                const parsed = parseInt(t, 10);
                if (t === "" || !Number.isFinite(parsed) || parsed <= 0) return q;
                return Math.max(1, Math.min(99, parsed));
              })()
            : q;
          const sub = precio * qForSub;

          return (
            <li
              key={id}
              className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 py-2 last:border-0 sm:flex-nowrap"
            >
              <span className="min-w-0 flex-1 text-sm text-text-primary">{nombre}</span>
              {isEditing ? (
                <>
                  <input
                    ref={editInputRef}
                    type="number"
                    min={1}
                    max={99}
                    value={draftQty}
                    onChange={(e) => setDraftQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdit(id);
                      }
                    }}
                    className="w-[4.5rem] shrink-0 rounded border border-border bg-surface-elevated px-2 py-2 text-center text-sm tabular-nums text-text-primary outline-none focus:border-accent"
                    aria-label={`Cantidad de ${nombre}`}
                  />
                  <span className="text-sm font-medium tabular-nums text-text-primary">{formatCop(sub)}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
                    <button
                      type="button"
                      onClick={() => commitEdit(id)}
                      className={btnIcon}
                      aria-label={`Confirmar cantidad de ${nombre}`}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => removePlato(id)}
                      className={`${btnIcon} border-danger/30 text-danger hover:bg-danger-light`}
                      aria-label={`Quitar ${nombre}`}
                    >
                      ×
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-text-secondary tabular-nums">x{q}</span>
                  <span className="text-sm font-medium tabular-nums text-text-primary">{formatCop(sub)}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(id);
                        setDraftQty(String(q));
                      }}
                      className={btnIcon}
                      aria-label={`Editar cantidad de ${nombre}`}
                    >
                      ✏
                    </button>
                    <button
                      type="button"
                      onClick={() => removePlato(id)}
                      className={`${btnIcon} border-danger/30 text-danger hover:bg-danger-light`}
                      aria-label={`Quitar ${nombre}`}
                    >
                      ×
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SubmitBar({
  totalFmt,
  distinctPlatos,
  disabled,
}: {
  totalFmt: string;
  distinctPlatos: number;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const platoTxt = distinctPlatos === 1 ? "1 plato" : `${distinctPlatos} platos`;
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
    >
      {pending ? "Registrando…" : `Registrar · ${totalFmt} · ${platoTxt}`}
    </button>
  );
}

function sortPlatosByRankingVentas(platos: PlatoRow[], rankingVentas: Record<string, number>): PlatoRow[] {
  return [...platos].sort((a, b) => {
    const va = rankingVentas[a.id] ?? 0;
    const vb = rankingVentas[b.id] ?? 0;
    if (va !== vb) return vb - va;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export function VentasForm({
  platos,
  rankingVentas = {},
}: {
  platos: PlatoRow[];
  rankingVentas?: Record<string, number>;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(registrarVenta, initialState);

  const [fecha, setFecha] = useState(todayLocalISO);
  const [hora, setHora] = useState(nowTimeHHMM);
  const [ventaKind, setVentaKind] = useState<"mesa" | "domicilio" | "llevar">("mesa");
  const [canal, setCanal] = useState<CanalDomicilio>(CANALES_DOMICILIO[0]!);
  const [metodoPago, setMetodoPago] = useState<MetodoPagoVenta>(METODOS_PAGO_VENTA[0]!);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [lineasError, setLineasError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("home");
  const [categoriaKey, setCategoriaKey] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const tipoValue =
    ventaKind === "mesa" ? "MESA" : ventaKind === "llevar" ? "PARA_LLEVAR" : "DOMICILIO";

  const sections = useMemo(() => buildPlatoSections(platos), [platos]);

  /** Modo "Por plato": todos los activos ordenados por unidades vendidas (histórico), empates por nombre; sin ventas al final. */
  const platosOrdenadosRanking = useMemo(
    () => sortPlatosByRankingVentas(platos, rankingVentas),
    [platos, rankingVentas],
  );

  /** Lista mostrada en el mosaico: filtro en vivo sobre el orden de ranking. */
  const platosMosaicoPorPlato = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return platosOrdenadosRanking;
    return platosOrdenadosRanking.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [platosOrdenadosRanking, busqueda]);

  const platosCategoriaActual = useMemo(() => {
    if (categoriaKey == null) return [];
    const sec = sections.find((s) => s.key === categoriaKey);
    return sec?.platos ?? [];
  }, [sections, categoriaKey]);

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

  const distinctPlatosConCantidad = useMemo(() => {
    let n = 0;
    for (const p of platos) {
      if ((cantidades[p.id] ?? 0) > 0) n += 1;
    }
    return n;
  }, [platos, cantidades]);

  const totalFmt = formatCop(totalGeneral);
  const tieneLineas = totalGeneral > 0;

  useEffect(() => {
    if (view === "plato") {
      searchRef.current?.focus();
    }
  }, [view]);

  const lastProcessedState = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state === lastProcessedState.current) return;
    if (!state.ok || !state.message) return;
    lastProcessedState.current = state;
    setFecha(todayLocalISO());
    setHora(nowTimeHHMM());
    setCantidades({});
    setLineasError(null);
    setView("home");
    setCategoriaKey(null);
    setBusqueda("");
    router.refresh();
  }, [state, router]);

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

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
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

  const homeBtnClass =
    "flex min-h-[4.5rem] w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-surface-elevated px-4 py-4 text-base font-semibold text-text-primary transition-colors hover:border-accent hover:bg-accent-light/30 sm:max-w-md";

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col pb-2">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="hora" value={hora} />
      <input type="hidden" name="tipo" value={tipoValue} />
      <input type="hidden" name="canal" value={ventaKind === "domicilio" ? canal : ""} />
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
              onClick={() => setVentaKind("llevar")}
              className={ventaKind === "llevar" ? pillOn : pillOff}
            >
              Para llevar
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
              onChange={(e) => setCanal(e.target.value as CanalDomicilio)}
              className="mt-2 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              aria-label="Canal de domicilio"
            >
              {CANALES_DOMICILIO.map((c) => (
                <option key={c} value={c}>
                  {CANAL_DOMICILIO_LABELS[c]}
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
            onChange={(e) => setMetodoPago(e.target.value as MetodoPagoVenta)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          >
            {METODOS_PAGO_VENTA.map((m) => (
              <option key={m} value={m}>
                {METODO_PAGO_VENTA_LABELS[m]}
              </option>
            ))}
          </select>
          <FieldError state={state} field="metodoPago" />
        </div>
      </div>

      <div className="mt-8 min-h-[120px]">
        {platos.length === 0 ? (
          <p className="text-sm text-text-tertiary">No tienes platos activos. Créalos en Configuración.</p>
        ) : (
          <>
            {view === "home" ? (
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
                <button type="button" onClick={() => setView("categoria")} className={homeBtnClass}>
                  <span className="text-2xl" aria-hidden>
                    🏷
                  </span>
                  Buscar por categoría
                </button>
                <button type="button" onClick={() => setView("plato")} className={homeBtnClass}>
                  <span className="text-2xl" aria-hidden>
                    🔍
                  </span>
                  Buscar por plato
                </button>
              </div>
            ) : null}

            {view === "categoria" ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setView("home");
                    setCategoriaKey(null);
                  }}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  ← Volver
                </button>
                <p className="text-xs font-medium text-text-tertiary">Categoría</p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((sec) => {
                    const active = categoriaKey === sec.key;
                    return (
                      <button
                        key={sec.key}
                        type="button"
                        onClick={() => setCategoriaKey(sec.key)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? "border-accent bg-accent-light text-accent"
                            : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50"
                        }`}
                      >
                        {sec.titulo}
                      </button>
                    );
                  })}
                </div>
                {categoriaKey == null ? (
                  <p className="text-sm text-text-tertiary">Selecciona una categoría para ver los platos.</p>
                ) : platosCategoriaActual.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No hay platos en esta categoría.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {platosCategoriaActual.map((p) => (
                      <PlatoCard
                        key={p.id}
                        p={p}
                        cantidad={cantidades[p.id] ?? 0}
                        onDelta={(d) => setQty(p.id, d)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {view === "plato" ? (
              <div className="flex flex-col gap-6">
                <button
                  type="button"
                  onClick={() => {
                    setView("home");
                    setBusqueda("");
                  }}
                  className="self-start text-sm font-medium text-accent hover:underline"
                >
                  ← Volver
                </button>

                <div className="shrink-0">
                  <label className="text-sm font-medium text-text-secondary" htmlFor="venta-buscar-plato">
                    Buscar plato
                  </label>
                  <input
                    ref={searchRef}
                    id="venta-buscar-plato"
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar plato..."
                    className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    autoComplete="off"
                  />
                </div>

                <div className="min-h-0 flex-1">
                  {platosMosaicoPorPlato.length === 0 ? (
                    <p className="text-sm text-text-tertiary">No se encontró ningún plato</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {platosMosaicoPorPlato.map((p) => (
                        <PlatoCard
                          key={p.id}
                          p={p}
                          cantidad={cantidades[p.id] ?? 0}
                          onDelta={(d) => setQty(p.id, d)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <PedidoActual
        platos={platos}
        cantidades={cantidades}
        setCantidades={setCantidades}
        setLineasError={setLineasError}
      />

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
            <SubmitBar totalFmt={totalFmt} distinctPlatos={distinctPlatosConCantidad} disabled={!tieneLineas} />
          </div>
        </div>
      </div>
    </form>
  );
}
