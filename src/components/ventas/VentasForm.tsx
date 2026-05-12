"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bike,
  Check,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
  UtensilsCrossed,
} from "lucide-react";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { registrarVenta } from "@/app/actions/ventas";
import { VentasHistorial, type VentaHistorialRow } from "@/components/ventas/VentasHistorial";
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
  tipo: string;
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

function labelItems(platos: PlatoRow[], cantidades: Record<string, number>): string {
  const seleccionados = platos.filter((p) => (cantidades[p.id] ?? 0) > 0);
  const total = seleccionados.reduce((s, p) => s + (cantidades[p.id] ?? 0), 0);
  const soloPlatos = seleccionados.every((p) => p.tipo === "PLATO");
  const soloCombos = seleccionados.every((p) => p.tipo === "COMBO");
  if (soloPlatos) return total === 1 ? "1 plato" : `${total} platos`;
  if (soloCombos) return total === 1 ? "1 combo" : `${total} combos`;
  return total === 1 ? "1 ítem" : `${total} ítems`;
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
  return (
    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>{state.message}</p>
  );
}

function GlobalFeedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  if (state.field) return null;
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid rgba(248,113,113,0.35)",
        background: "rgba(248,113,113,0.12)",
        padding: "8px 10px",
        fontSize: 13,
        color: "#fca5a5",
      }}
    >
      {state.message}
    </div>
  );
}

function SuccessFeedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || !state.ok || !state.message) return null;
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid rgba(164,173,255,0.35)",
        background: "rgba(94,106,210,0.14)",
        padding: "8px 10px",
        fontSize: 13,
        color: "#a4adff",
      }}
    >
      {state.message}
    </div>
  );
}

const platoCardBase: CSSProperties = {
  minHeight: 96,
  padding: "14px 14px 12px",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  textAlign: "left",
  cursor: "pointer",
  transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
};

function SubmitBar({
  totalFmt,
  itemsLabel,
  disabled,
}: {
  totalFmt: string;
  itemsLabel: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const enabledStyle: CSSProperties = {
    width: "100%",
    height: 64,
    border: "none",
    borderRadius: 12,
    background: "#5e6ad2",
    color: "#fff",
    cursor: "pointer",
    padding: "0 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 14px rgba(94,106,210,0.3)",
  };
  const disabledStyle: CSSProperties = {
    ...enabledStyle,
    background: "rgba(255,255,255,0.04)",
    color: "#62666d",
    cursor: "not-allowed",
    boxShadow: "none",
  };
  const pendingStyle: CSSProperties = {
    ...enabledStyle,
    cursor: "wait",
    justifyContent: "center",
    opacity: 0.92,
  };
  const btnStyle = pending ? pendingStyle : disabled ? disabledStyle : enabledStyle;
  return (
    <button type="submit" disabled={pending || disabled} style={btnStyle}>
      {pending ? (
        <span
          style={{
            flex: 1,
            textAlign: "center",
            font: "590 14px/1 Inter,sans-serif",
            letterSpacing: "0.5px",
          }}
        >
          Registrando…
        </span>
      ) : (
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <Check size={18} strokeWidth={2.4} aria-hidden />
            <span style={{ font: "590 14px/1 Inter,sans-serif", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              REGISTRAR
            </span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ font: "510 12px/1 Inter,sans-serif", opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
              {itemsLabel}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ font: "590 18px/1 Inter,sans-serif", letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>
              {totalFmt}
            </span>
          </span>
        </>
      )}
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
  historialRows,
}: {
  platos: PlatoRow[];
  rankingVentas?: Record<string, number>;
  historialRows: VentaHistorialRow[];
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
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  const cartRef = useRef<HTMLDivElement>(null);
  const flyIdRef = useRef(0);
  const [flyParticles, setFlyParticles] = useState<{ id: number; x: number; y: number; tx: number; ty: number }[]>([]);
  const [metodoPagoOpen, setMetodoPagoOpen] = useState(false);
  const [canalOpen, setCanalOpen] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);

  const tipoValue =
    ventaKind === "mesa" ? "MESA" : ventaKind === "llevar" ? "PARA_LLEVAR" : "DOMICILIO";

  const sections = useMemo(() => buildPlatoSections(platos), [platos]);

  /** Modo "Por plato": todos los activos ordenados por unidades vendidas (histórico), empates por nombre; sin ventas al final. */
  const platosOrdenadosRanking = useMemo(
    () => sortPlatosByRankingVentas(platos, rankingVentas),
    [platos, rankingVentas],
  );

  const platosCategoriaActual = useMemo(() => {
    if (categoriaKey == null) return [];
    const sec = sections.find((s) => s.key === categoriaKey);
    return sec?.platos ?? [];
  }, [sections, categoriaKey]);

  /** Lista del grid: ranking + búsqueda en home/plato; categoría + búsqueda en categoria. */
  const platosGridList = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (view === "categoria") {
      const base = platosCategoriaActual;
      if (!q) return base;
      return base.filter((p) => p.nombre.toLowerCase().includes(q));
    }
    if (!q) return platosOrdenadosRanking;
    return platosOrdenadosRanking.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [view, busqueda, platosOrdenadosRanking, platosCategoriaActual]);

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

  const itemsLabel = useMemo(() => labelItems(platos, cantidades), [platos, cantidades]);

  const totalFmt = formatCop(totalGeneral);
  const tieneLineas = totalGeneral > 0;

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
    setMetodoPagoOpen(false);
    setCanalOpen(false);
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (ventaKind !== "domicilio") setCanalOpen(false);
  }, [ventaKind]);

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

  const tipoSegStyle: CSSProperties = {
    display: "flex",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 3,
    gap: 2,
  };

  const tipoBtnBase: CSSProperties = {
    height: 38,
    padding: "0 16px",
    borderRadius: 7,
    font: "510 13px/1 Inter,sans-serif",
    border: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const tabTodosActive = view === "plato" || view === "home";

  const dotColor =
    ventaKind === "mesa" ? "#7170ff" : ventaKind === "llevar" ? "#10b981" : "#d97706";
  const tipoPillLabel =
    ventaKind === "mesa" ? "Mesa" : ventaKind === "llevar" ? "Para llevar" : "Domicilio";

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <style>{`
    @keyframes fly-to-cart {
      0%   { transform: translate(0, 0) scale(1); opacity: 1; }
      60%  { opacity: 1; }
      100% { transform: translate(var(--fly-tx), var(--fly-ty)) scale(0.3); opacity: 0; }
    }
  `}</style>
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="hora" value={hora} />
      <input type="hidden" name="tipo" value={tipoValue} />
      <input type="hidden" name="canal" value={ventaKind === "domicilio" ? canal : ""} />
      <input type="hidden" name="metodoPago" value={metodoPago} />
      <input type="hidden" name="lineas" value={lineasPayload} />

      <div
        style={{
          display: "flex",
          height: "calc(100vh - 64px)",
          overflow: "hidden",
        }}
      >
        {/* Columna izquierda */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "#08090a",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "20px 20px 14px" }}>
            <h1
              style={{
                font: "590 22px/1.15 Inter,sans-serif",
                color: "#f7f8f8",
                letterSpacing: "-0.5px",
                margin: 0,
              }}
            >
              Ventas
            </h1>
            <p
              style={{
                font: "400 13px/1.45 Inter,sans-serif",
                color: "#62666d",
                margin: "5px 0 0",
                maxWidth: 560,
              }}
            >
              Registra ventas rápido: elige platos y cantidades como en una caja registradora.
            </p>
          </div>

          <div
            style={{
              padding: "0 20px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 44,
                  padding: "0 12px 0 14px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10,
                }}
              >
                <Search size={16} color="#62666d" aria-hidden />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato..."
                  autoComplete="off"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    color: "#f7f8f8",
                    font: "400 15px/1 Inter,sans-serif",
                    outline: "none",
                  }}
                />
                {busqueda ? (
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.06)",
                      border: "none",
                      color: "#8a8f98",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-label="Limpiar búsqueda"
                  >
                    ×
                  </button>
                ) : null}
              </div>

              <div style={{ flexShrink: 0, display: "flex" }}>
                <div style={tipoSegStyle}>
                  <button
                    type="button"
                    onClick={() => setVentaKind("mesa")}
                    style={{
                      ...tipoBtnBase,
                      justifyContent: "center",
                      background: ventaKind === "mesa" ? "rgba(94,106,210,0.18)" : "transparent",
                      color: ventaKind === "mesa" ? "#a4adff" : "#8a8f98",
                      boxShadow:
                        ventaKind === "mesa" ? "inset 0 0 0 1px rgba(113,112,255,0.25)" : "none",
                    }}
                  >
                    <Utensils size={16} aria-hidden />
                    Mesa
                  </button>
                  <button
                    type="button"
                    onClick={() => setVentaKind("llevar")}
                    style={{
                      ...tipoBtnBase,
                      justifyContent: "center",
                      background: ventaKind === "llevar" ? "rgba(94,106,210,0.18)" : "transparent",
                      color: ventaKind === "llevar" ? "#a4adff" : "#8a8f98",
                      boxShadow:
                        ventaKind === "llevar" ? "inset 0 0 0 1px rgba(113,112,255,0.25)" : "none",
                    }}
                  >
                    <ShoppingBag size={16} aria-hidden />
                    Para llevar
                  </button>
                  <button
                    type="button"
                    onClick={() => setVentaKind("domicilio")}
                    style={{
                      ...tipoBtnBase,
                      justifyContent: "center",
                      background: ventaKind === "domicilio" ? "rgba(94,106,210,0.18)" : "transparent",
                      color: ventaKind === "domicilio" ? "#a4adff" : "#8a8f98",
                      boxShadow:
                        ventaKind === "domicilio" ? "inset 0 0 0 1px rgba(113,112,255,0.25)" : "none",
                    }}
                  >
                    <Bike size={16} aria-hidden />
                    Domicilio
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHistorialOpen((o) => !o)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 44,
                  padding: "0 14px",
                  background: historialOpen ? "rgba(94,106,210,0.18)" : "rgba(255,255,255,0.03)",
                  border: "1px solid",
                  borderColor: historialOpen ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  color: historialOpen ? "#a4adff" : "#d0d6e0",
                  font: "510 13px/1 Inter,sans-serif",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
                <span>Historial</span>
                {historialRows.length > 0 ? (
                  <span
                    style={{
                      font: "510 11px/1 Inter,sans-serif",
                      color: historialOpen ? "#a4adff" : "#8a8f98",
                      background: historialOpen ? "rgba(113,112,255,0.20)" : "rgba(255,255,255,0.05)",
                      padding: "3px 7px",
                      borderRadius: 999,
                      minWidth: 20,
                      textAlign: "center",
                    }}
                  >
                    {historialRows.length}
                  </span>
                ) : null}
              </button>
            </div>

            <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
              <button
                type="button"
                onClick={() => {
                  setView("plato");
                  setBusqueda("");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 36,
                  padding: "0 14px",
                  background: tabTodosActive ? "rgba(94,106,210,0.14)" : "transparent",
                  border: "1px solid",
                  borderColor: tabTodosActive ? "rgba(113,112,255,0.22)" : "transparent",
                  borderRadius: 8,
                  font: "510 13px/1 Inter,sans-serif",
                  cursor: "pointer",
                  flexShrink: 0,
                  color: tabTodosActive ? "#a4adff" : "#8a8f98",
                }}
              >
                Todos
                <span
                  style={{
                    font: "510 11px/1 Inter,sans-serif",
                    padding: "3px 6px",
                    borderRadius: 999,
                    color: tabTodosActive ? "#a4adff" : "#62666d",
                    background: tabTodosActive ? "rgba(113,112,255,0.18)" : "rgba(255,255,255,0.05)",
                  }}
                >
                  {platosOrdenadosRanking.length}
                </span>
              </button>
              {sections.map((s) => {
                const active = view === "categoria" && categoriaKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setCategoriaKey(s.key);
                      setView("categoria");
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 36,
                      padding: "0 14px",
                      background: active ? "rgba(94,106,210,0.14)" : "transparent",
                      border: "1px solid",
                      borderColor: active ? "rgba(113,112,255,0.22)" : "transparent",
                      borderRadius: 8,
                      font: "510 13px/1 Inter,sans-serif",
                      cursor: "pointer",
                      flexShrink: 0,
                      color: active ? "#a4adff" : "#8a8f98",
                    }}
                  >
                    {s.titulo}
                    <span
                      style={{
                        font: "510 11px/1 Inter,sans-serif",
                        padding: "3px 6px",
                        borderRadius: 999,
                        color: active ? "#a4adff" : "#62666d",
                        background: active ? "rgba(113,112,255,0.18)" : "rgba(255,255,255,0.05)",
                      }}
                    >
                      {s.platos.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 20,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              alignContent: "start",
            }}
          >
            {platos.length === 0 ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "60px 20px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  color: "#62666d",
                  font: "400 14px/1.4 Inter,sans-serif",
                }}
              >
                No tienes platos activos. Créalos en Configuración.
              </div>
            ) : platosGridList.length === 0 ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "60px 20px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  color: "#62666d",
                  font: "400 14px/1.4 Inter,sans-serif",
                }}
              >
                No se encontró ningún plato
              </div>
            ) : (
              platosGridList.map((p) => {
                const isPulse = pulsing.has(p.id);
                return (
                <button
                  key={p.id}
                  type="button"
                  style={{
                    ...platoCardBase,
                    ...(isPulse
                      ? {
                          background: "rgba(113,112,255,0.16)",
                          borderColor: "rgba(113,112,255,0.5)",
                          transform: "scale(0.97)",
                        }
                      : {}),
                  }}
                  onClick={(e) => {
                    setQty(p.id, 1);
                    // Pulse
                    setPulsing((prev) => new Set(prev).add(p.id));
                    setTimeout(() => setPulsing((prev) => { const n = new Set(prev); n.delete(p.id); return n; }), 360);
                    // Fly
                    const srcRect = e.currentTarget.getBoundingClientRect();
                    const cartRect = cartRef.current?.getBoundingClientRect();
                    if (cartRect) {
                      const id = flyIdRef.current++;
                      const particle = {
                        id,
                        x: srcRect.left + srcRect.width / 2,
                        y: srcRect.top + srcRect.height / 2,
                        tx: cartRect.left + cartRect.width / 2,
                        ty: cartRect.top + 60,
                      };
                      setFlyParticles((prev) => [...prev, particle]);
                      setTimeout(() => setFlyParticles((prev) => prev.filter((fp) => fp.id !== id)), 600);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (pulsing.has(p.id)) return;
                    e.currentTarget.style.background = "rgba(255,255,255,0.045)";
                    e.currentTarget.style.borderColor = "rgba(113,112,255,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    if (pulsing.has(p.id)) {
                      e.currentTarget.style.background = "rgba(113,112,255,0.16)";
                      e.currentTarget.style.borderColor = "rgba(113,112,255,0.5)";
                      e.currentTarget.style.transform = "scale(0.97)";
                      return;
                    }
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.transform = "";
                  }}
                >
                  <span
                    style={{
                      font: "510 14px/1.3 Inter,sans-serif",
                      color: "#f7f8f8",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {p.nombre}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <span
                      style={{
                        font: "590 14px/1 Inter,sans-serif",
                        color: "#d0d6e0",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatCop(precioNum(p))}
                    </span>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: "rgba(113,112,255,0.16)",
                        color: "#a4adff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Plus size={14} />
                    </div>
                  </div>
                </button>
                );
              })
            )}
          </div>
        </div>

        {/* Columna derecha */}
        <div
          ref={cartRef}
          style={{
            width: 380,
            flexShrink: 0,
            background: "#0c0d0e",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  font: "510 11px/1 Inter,sans-serif",
                  color: "#8a8f98",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                }}
              >
                PEDIDO ACTUAL
              </span>
              {tieneLineas ? (
                <span style={{ font: "400 12px/1 Inter,sans-serif", color: "#62666d" }}>· {itemsLabel}</span>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 28,
                  padding: "0 12px 0 10px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 999,
                  font: "510 13px/1 Inter,sans-serif",
                  color: "#f7f8f8",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
                {tipoPillLabel}
              </div>

              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setMetodoPagoOpen((o) => !o);
                    setCanalOpen(false);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 28,
                    padding: "0 10px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    color: "#f7f8f8",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                  }}
                  aria-label="Método de pago"
                  aria-expanded={metodoPagoOpen}
                >
                  {METODO_PAGO_VENTA_LABELS[metodoPago]}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {metodoPagoOpen ? (
                  <>
                    <div
                      onClick={() => setMetodoPagoOpen(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                      aria-hidden
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        zIndex: 50,
                        minWidth: 180,
                        background: "#191a1b",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 8,
                        padding: 4,
                        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {METODOS_PAGO_VENTA.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setMetodoPago(m);
                            setMetodoPagoOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            height: 32,
                            padding: "0 10px",
                            background: m === metodoPago ? "rgba(113,112,255,0.12)" : "transparent",
                            border: "none",
                            borderRadius: 6,
                            color: m === metodoPago ? "#a4adff" : "#d0d6e0",
                            font: "510 13px/1 Inter,sans-serif",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => {
                            if (m !== metodoPago) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                          }}
                          onMouseLeave={(e) => {
                            if (m !== metodoPago) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          {m === metodoPago ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            <span style={{ width: 11 }} />
                          )}
                          {METODO_PAGO_VENTA_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              {ventaKind === "domicilio" ? (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCanalOpen((o) => !o);
                      setMetodoPagoOpen(false);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 28,
                      padding: "0 10px",
                      background: "rgba(217,119,6,0.12)",
                      border: "1px solid rgba(217,119,6,0.3)",
                      borderRadius: 999,
                      color: "#f4b35e",
                      font: "510 13px/1 Inter,sans-serif",
                      cursor: "pointer",
                    }}
                    aria-label="Canal de domicilio"
                    aria-expanded={canalOpen}
                  >
                    {CANAL_DOMICILIO_LABELS[canal]}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {canalOpen ? (
                    <>
                      <div
                        onClick={() => setCanalOpen(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 40 }}
                        aria-hidden
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          zIndex: 50,
                          minWidth: 180,
                          background: "#191a1b",
                          border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 8,
                          padding: 4,
                          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        {CANALES_DOMICILIO.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setCanal(c);
                              setCanalOpen(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              height: 32,
                              padding: "0 10px",
                              background: c === canal ? "rgba(217,119,6,0.12)" : "transparent",
                              border: "none",
                              borderRadius: 6,
                              color: c === canal ? "#f4b35e" : "#d0d6e0",
                              font: "510 13px/1 Inter,sans-serif",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => {
                              if (c !== canal) e.currentTarget.style.background = "rgba(217,119,6,0.08)";
                            }}
                            onMouseLeave={(e) => {
                              if (c !== canal) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            {c === canal ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : (
                              <span style={{ width: 11 }} />
                            )}
                            {CANAL_DOMICILIO_LABELS[c]}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {!tieneLineas ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: 10,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: "rgba(94,106,210,0.1)",
                    border: "1px solid rgba(113,112,255,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <UtensilsCrossed size={22} color="#5e6ad2" aria-hidden />
                </div>
                <p style={{ font: "510 15px/1.4 Inter,sans-serif", color: "#d0d6e0", margin: 0 }}>Pedido vacío</p>
                <p style={{ font: "400 13px/1.4 Inter,sans-serif", color: "#62666d", margin: 0 }}>
                  Tocá un plato para agregarlo
                </p>
              </div>
            ) : (
              platos
                .filter((p) => (cantidades[p.id] ?? 0) > 0)
                .map((p) => {
                  const qty = cantidades[p.id] ?? 0;
                  const pu = precioNum(p);
                  const sub = pu * qty;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            font: "510 14px/1.25 Inter,sans-serif",
                            color: "#f7f8f8",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.nombre}
                        </div>
                        <div
                          style={{
                            font: "400 12px/1 Inter,sans-serif",
                            color: "#8a8f98",
                            display: "flex",
                            gap: 6,
                            marginTop: 4,
                          }}
                        >
                          <span>{formatCop(pu)} · </span>
                          <span style={{ color: "#7170ff" }}>{formatCop(sub)}</span>
                        </div>
                      </div>
                      <div
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 8,
                          padding: 2,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setQty(p.id, -1)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: "none",
                            background: "transparent",
                            color: "#d0d6e0",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          aria-label={qty === 1 ? `Quitar ${p.nombre}` : `Menos ${p.nombre}`}
                        >
                          {qty === 1 ? <Trash2 size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
                        </button>
                        <span
                          style={{
                            minWidth: 24,
                            textAlign: "center",
                            font: "590 14px/1 Inter,sans-serif",
                            color: "#f7f8f8",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {qty}
                        </span>
                        <button
                          type="button"
                          disabled={qty >= 99}
                          onClick={() => setQty(p.id, 1)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: "none",
                            background: "transparent",
                            color: "#d0d6e0",
                            cursor: qty >= 99 ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: qty >= 99 ? 0.4 : 1,
                          }}
                          aria-label={`Más ${p.nombre}`}
                        >
                          <Plus size={14} aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          <div
            style={{
              flexShrink: 0,
              padding: "14px 16px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {(lineasError ||
              (state.ok === false &&
                (state.field === "lineas" || (state.field?.startsWith("linea-") ?? false)))) && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#f87171" }} role="alert">
                {lineasError ?? (state.ok === false ? state.message : null)}
              </p>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                padding: "0 4px 12px",
                marginTop: 12,
              }}
            >
              <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#8a8f98" }}>Total</span>
              <span
                style={{
                  font: "510 28px/1 Inter,sans-serif",
                  color: "#f7f8f8",
                  letterSpacing: "-0.7px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {totalFmt}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SuccessFeedback state={state} />
              <GlobalFeedback state={state} />
              <SubmitBar totalFmt={totalFmt} itemsLabel={itemsLabel} disabled={!tieneLineas} />
            </div>
          </div>
        </div>
      </div>
      {flyParticles.map((fp) => (
        <div
          key={fp.id}
          style={
            {
              position: "fixed",
              left: fp.x - 20,
              top: fp.y - 20,
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(113,112,255,0.7)",
              border: "1px solid rgba(113,112,255,0.9)",
              pointerEvents: "none",
              zIndex: 9999,
              animation: "fly-to-cart 550ms cubic-bezier(0.16,1,0.3,1) both",
              "--fly-tx": `${fp.tx - fp.x}px`,
              "--fly-ty": `${fp.ty - fp.y}px`,
            } as CSSProperties
          }
        />
      ))}
      {/* Drawer de historial — slide up desde abajo */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 80,
          transform: historialOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.16,1,0.3,1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "55vh",
          background: "#0c0d0e",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                font: "590 15px/1.2 Inter,sans-serif",
                color: "#f7f8f8",
                letterSpacing: "-0.2px",
              }}
            >
              Últimas ventas
            </span>
            <span
              style={{
                font: "510 11px/1 Inter,sans-serif",
                color: "#8a8f98",
                background: "rgba(255,255,255,0.04)",
                padding: "3px 8px",
                borderRadius: 999,
              }}
            >
              {historialRows.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setHistorialOpen(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#8a8f98",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Cerrar historial"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <VentasHistorial rows={historialRows} />
        </div>
      </div>
    </form>
  );
}
