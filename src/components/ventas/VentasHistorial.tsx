"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Prisma } from "@prisma/client";
import { useRouter } from "next/navigation";
import { editarVenta, eliminarVenta, getPlatosCatalogoVenta } from "@/app/actions/ventas";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import {
  CANALES_DOMICILIO,
  DOMICILIO_PREFIX,
  METODOS_PAGO,
  TIPO_MESA,
  tipoDomicilio,
} from "@/lib/ventas-constants";
import { ColumnHeader } from "@/components/ui/ColumnHeader";

type Row = Prisma.VentaGetPayload<{
  include: {
    detalles: {
      include: {
        plato: { select: { nombre: true; precioVenta: true } };
      };
    };
  };
}>;

type PlatoCat = { id: string; nombre: string; precioVenta: string };

function fechaToInput(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CANALES_SET = new Set<string>(CANALES_DOMICILIO);

function parseTipoRow(tipo: string): { kind: "mesa" | "domicilio"; canal: string } {
  if (tipo === TIPO_MESA) return { kind: "mesa", canal: CANALES_DOMICILIO[0]! };
  if (tipo.startsWith(DOMICILIO_PREFIX)) {
    const c = tipo.slice(DOMICILIO_PREFIX.length).trim();
    return { kind: "domicilio", canal: CANALES_SET.has(c) ? c : CANALES_DOMICILIO[0]! };
  }
  return { kind: "domicilio", canal: CANALES_DOMICILIO[0]! };
}

function formatFecha(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const y = d.getUTCFullYear();
  return `${day}/${m}/${y}`;
}

function formatCop(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(x);
}

/** Misma tabla Proveedores (Configuración) */
const btnEditRow =
  "rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border";
const btnDeleteRow =
  "rounded border border-danger/30 bg-danger-light px-2 py-1 text-xs font-medium text-danger hover:bg-danger/20 hover:text-danger";
const btnSaveRow =
  "rounded bg-accent px-2 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60";
const btnCancelRow =
  "rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary hover:bg-border";

const loadMoreClass =
  "w-full border border-border border-t-0 bg-surface-elevated/50 py-2 text-center text-xs text-text-tertiary transition hover:bg-surface-elevated";

const idle: ActionState = { ok: true };

export function VentasHistorial({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<PlatoCat[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    fecha: string;
    hora: string;
    kind: "mesa" | "domicilio";
    canal: string;
    metodoPago: string;
    lines: { platoId: string; cantidad: number }[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const [visibleCount, setVisibleCount] = useState(10);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    getPlatosCatalogoVenta().then((r) => {
      if (r.ok) setCatalog(r.platos);
    });
  }, []);

  const precioByPlato = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of catalog) m.set(p.id, Number(p.precioVenta));
    return m;
  }, [catalog]);

  const startEdit = useCallback((v: Row) => {
    const t = parseTipoRow(v.tipo);
    setEditingId(v.id);
    setDeleteId(null);
    setDraft({
      fecha: fechaToInput(v.fecha),
      hora: v.hora.trim(),
      kind: t.kind,
      canal: t.canal,
      metodoPago: v.metodoPago,
      lines: v.detalles.map((d) => ({ platoId: d.platoId, cantidad: d.cantidad })),
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId || !draft) return;
    const tipoStr = draft.kind === "mesa" ? TIPO_MESA : tipoDomicilio(draft.canal);
    const fd = new FormData();
    fd.set("ventaId", editingId);
    fd.set("fecha", draft.fecha);
    fd.set("hora", draft.hora);
    fd.set("tipo", tipoStr);
    fd.set("metodoPago", draft.metodoPago);
    fd.set("lineas", JSON.stringify(draft.lines.map((l) => ({ platoId: l.platoId, cantidad: l.cantidad }))));
    startTransition(async () => {
      const res = await editarVenta(idle, fd);
      if (res.ok) {
        setEditingId(null);
        setDraft(null);
        router.refresh();
      }
    });
  }, [editingId, draft, router]);

  const confirmDelete = useCallback(
    (ventaId: string) => {
      const fd = new FormData();
      fd.set("ventaId", ventaId);
      startTransition(async () => {
        const res = await eliminarVenta(idle, fd);
        if (res.ok) {
          setDeleteId(null);
          router.refresh();
        }
      });
    },
    [router],
  );

  const draftTotal = useMemo(() => {
    if (!draft) return 0;
    let s = 0;
    for (const l of draft.lines) {
      const p = precioByPlato.get(l.platoId) ?? 0;
      s += p * l.cantidad;
    }
    return s;
  }, [draft, precioByPlato]);

  const filtradas = useMemo(() => rows, [rows]);

  const filtradasPorColumna = useMemo(() => {
    return filtradas.filter((v) => {
      const qFecha = (columnSearch.fecha ?? "").trim().toLowerCase();
      if (qFecha && !formatFecha(v.fecha).toLowerCase().includes(qFecha)) return false;
      const qHora = (columnSearch.hora ?? "").trim().toLowerCase();
      if (qHora && !v.hora.trim().toLowerCase().includes(qHora)) return false;
      const qTipo = (columnSearch.tipo ?? "").trim().toLowerCase();
      if (qTipo && !v.tipo.toLowerCase().includes(qTipo)) return false;
      const qTotal = (columnSearch.total ?? "").trim().toLowerCase();
      if (qTotal && !formatCop(v.total).toLowerCase().includes(qTotal)) return false;
      const qMet = (columnSearch.metodoPago ?? "").trim().toLowerCase();
      if (qMet && !v.metodoPago.toLowerCase().includes(qMet)) return false;
      return true;
    });
  }, [filtradas, columnSearch]);

  const ordenadas = useMemo(() => {
    if (!sortColumn) return filtradasPorColumna;
    const arr = [...filtradasPorColumna];
    const m = sortDirection === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortColumn) {
        case "fecha":
          return (a.fecha.getTime() - b.fecha.getTime()) * m;
        case "hora":
          return a.hora.trim().localeCompare(b.hora.trim(), "es") * m;
        case "tipo":
          return a.tipo.localeCompare(b.tipo, "es") * m;
        case "total":
          return (Number(a.total) - Number(b.total)) * m;
        case "metodoPago":
          return a.metodoPago.localeCompare(b.metodoPago, "es") * m;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtradasPorColumna, sortColumn, sortDirection]);

  const aMostrar = useMemo(() => ordenadas.slice(0, visibleCount), [ordenadas, visibleCount]);

  const onSort = useCallback((key: string, dir: "asc" | "desc") => {
    setSortColumn(key);
    setSortDirection(dir);
    setVisibleCount(10);
  }, []);

  const onSearch = useCallback((key: string, value: string) => {
    setColumnSearch((prev) => ({ ...prev, [key]: value }));
    setVisibleCount(10);
  }, []);

  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no hay ventas registradas.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="relative pb-2 pr-3 pl-1 font-semibold">
              <ColumnHeader
                label="Fecha"
                columnKey="fecha"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                searchValue={columnSearch.fecha ?? ""}
                onSearch={onSearch}
                onClear={() => {
                  if (sortColumn === "fecha") {
                    setSortColumn(null);
                    setSortDirection("asc");
                  }
                  onSearch("fecha", "");
                }}
              />
            </th>
            <th className="relative pb-2 pr-3 pl-1 font-semibold">
              <ColumnHeader
                label="Hora"
                columnKey="hora"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                searchValue={columnSearch.hora ?? ""}
                onSearch={onSearch}
                onClear={() => {
                  if (sortColumn === "hora") {
                    setSortColumn(null);
                    setSortDirection("asc");
                  }
                  onSearch("hora", "");
                }}
              />
            </th>
            <th className="relative pb-2 pr-3 pl-1 font-semibold">
              <ColumnHeader
                label="Tipo"
                columnKey="tipo"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                searchValue={columnSearch.tipo ?? ""}
                onSearch={onSearch}
                onClear={() => {
                  if (sortColumn === "tipo") {
                    setSortColumn(null);
                    setSortDirection("asc");
                  }
                  onSearch("tipo", "");
                }}
              />
            </th>
            <th className="pb-2 pr-3 pl-1 font-semibold">Items</th>
            <th className="relative pb-2 pr-3 pl-1 font-semibold">
              <ColumnHeader
                label="Total"
                columnKey="total"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                searchValue={columnSearch.total ?? ""}
                onSearch={onSearch}
                onClear={() => {
                  if (sortColumn === "total") {
                    setSortColumn(null);
                    setSortDirection("asc");
                  }
                  onSearch("total", "");
                }}
              />
            </th>
            <th className="relative pb-2 pr-3 pl-1 font-semibold">
              <ColumnHeader
                label="Método pago"
                columnKey="metodoPago"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
                searchValue={columnSearch.metodoPago ?? ""}
                onSearch={onSearch}
                onClear={() => {
                  if (sortColumn === "metodoPago") {
                    setSortColumn(null);
                    setSortDirection("asc");
                  }
                  onSearch("metodoPago", "");
                }}
              />
            </th>
            <th className="pb-2 pr-2 pl-1 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-text-primary">
          {filtradasPorColumna.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-sm text-text-tertiary">
                No hay ventas que coincidan con la búsqueda de columnas.
              </td>
            </tr>
          ) : (
            aMostrar.map((v) => {
            const nItems = v.detalles.reduce((s, d) => s + d.cantidad, 0);
            const isEditing = editingId === v.id && draft;
            const todayMax = new Date().toISOString().slice(0, 10);

            return (
              <Fragment key={v.id}>
                <tr className="align-top">
                  <td className="py-2 pr-3 align-middle">
                    {isEditing ? (
                      <input
                        type="date"
                        max={todayMax}
                        value={draft!.fecha}
                        onChange={(e) => setDraft((d) => (d ? { ...d, fecha: e.target.value } : d))}
                        className="w-full min-w-[8rem] rounded border border-border bg-surface-elevated px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="whitespace-nowrap">{formatFecha(v.fecha)}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    {isEditing ? (
                      <input
                        type="time"
                        value={draft!.hora}
                        onChange={(e) => setDraft((d) => (d ? { ...d, hora: e.target.value } : d))}
                        className="w-full min-w-[6rem] rounded border border-border bg-surface-elevated px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="whitespace-nowrap">{v.hora}</span>
                    )}
                  </td>
                  <td className="max-w-[200px] py-2 pr-3 align-middle text-text-secondary">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => setDraft((d) => (d ? { ...d, kind: "mesa" } : d))}
                            className={`rounded-full border px-2 py-0.5 text-xs ${draft!.kind === "mesa" ? "border-accent bg-accent-light text-accent" : "border-border"}`}
                          >
                            Mesa
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraft((d) => (d ? { ...d, kind: "domicilio" } : d))}
                            className={`rounded-full border px-2 py-0.5 text-xs ${draft!.kind === "domicilio" ? "border-accent bg-accent-light text-accent" : "border-border"}`}
                          >
                            Domicilio
                          </button>
                        </div>
                        {draft!.kind === "domicilio" ? (
                          <select
                            value={draft!.canal}
                            onChange={(e) => setDraft((d) => (d ? { ...d, canal: e.target.value } : d))}
                            className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-xs"
                          >
                            {CANALES_DOMICILIO.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    ) : (
                      <span>{v.tipo}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-middle tabular-nums">
                    {isEditing ? `${draft!.lines.length} ítems` : `${nItems} items`}
                  </td>
                  <td className="py-2 pr-3 align-middle font-medium whitespace-nowrap">
                    {isEditing ? formatCop(draftTotal) : formatCop(v.total)}
                  </td>
                  <td className="max-w-[160px] py-2 align-middle text-text-secondary">
                    {isEditing ? (
                      <select
                        value={draft!.metodoPago}
                        onChange={(e) => setDraft((d) => (d ? { ...d, metodoPago: e.target.value } : d))}
                        className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-xs"
                      >
                        {METODOS_PAGO.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="break-words">{v.metodoPago}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 align-top">
                    {deleteId === v.id ? (
                      <div className="flex max-w-[min(100%,18rem)] flex-col gap-2">
                        <p className="text-xs leading-snug text-danger">
                          ¿Eliminar este registro? Esta acción no se puede deshacer.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => confirmDelete(v.id)}
                            disabled={pending}
                            className={btnDeleteRow}
                          >
                            Confirmar eliminación
                          </button>
                          <button type="button" onClick={() => setDeleteId(null)} disabled={pending} className={btnCancelRow}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : isEditing ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={saveEdit} disabled={pending} className={btnSaveRow}>
                          Guardar
                        </button>
                        <button type="button" onClick={cancelEdit} disabled={pending} className={btnCancelRow}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => startEdit(v)} className={btnEditRow}>
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteId(v.id);
                            setEditingId(null);
                            setDraft(null);
                          }}
                          className={btnDeleteRow}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {isEditing && draft ? (
                  <tr className="bg-surface-elevated/40">
                    <td className="pb-3 pt-0 pr-3" colSpan={7}>
                      <div className="rounded-lg border border-border/80 p-3">
                        <div className="space-y-3">
                            <table className="w-full min-w-[480px] text-sm">
                              <thead>
                                <tr className="border-b border-border text-xs text-text-secondary">
                                  <th className="pb-2 pr-2 text-left font-medium">Plato</th>
                                  <th className="pb-2 pr-2 text-left font-medium">Cantidad</th>
                                  <th className="pb-2 pr-2 text-left font-medium">Precio unit.</th>
                                  <th className="pb-2 text-left font-medium">Subtotal</th>
                                  <th className="w-8 pb-2" />
                                </tr>
                              </thead>
                              <tbody>
                                {draft.lines.map((line, idx) => {
                                  const pu = precioByPlato.get(line.platoId) ?? 0;
                                  const sub = pu * line.cantidad;
                                  return (
                                    <tr key={`${line.platoId}-${idx}`} className="border-b border-border/60">
                                      <td className="py-2 pr-2">
                                        <select
                                          value={line.platoId}
                                          onChange={(e) => {
                                            const platoId = e.target.value;
                                            setDraft((d) => {
                                              if (!d) return d;
                                              const next = [...d.lines];
                                              next[idx] = { ...next[idx]!, platoId };
                                              return { ...d, lines: next };
                                            });
                                          }}
                                          className="w-full max-w-[220px] rounded border border-border bg-surface-elevated px-2 py-1 text-sm"
                                        >
                                          {catalog.map((p) => (
                                            <option key={p.id} value={p.id}>
                                              {p.nombre}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="py-2 pr-2">
                                        <input
                                          type="number"
                                          min={1}
                                          max={99}
                                          value={line.cantidad}
                                          onChange={(e) => {
                                            const q = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
                                            setDraft((d) => {
                                              if (!d) return d;
                                              const next = [...d.lines];
                                              next[idx] = { ...next[idx]!, cantidad: q };
                                              return { ...d, lines: next };
                                            });
                                          }}
                                          className="w-20 rounded border border-border bg-surface-elevated px-2 py-1 tabular-nums"
                                        />
                                      </td>
                                      <td className="py-2 pr-2 whitespace-nowrap">{formatCop(pu)}</td>
                                      <td className="py-2 font-medium whitespace-nowrap">{formatCop(sub)}</td>
                                      <td className="py-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDraft((d) => {
                                              if (!d || d.lines.length <= 1) return d;
                                              const next = d.lines.filter((_, i) => i !== idx);
                                              return { ...d, lines: next };
                                            })
                                          }
                                          className="text-danger hover:underline"
                                          aria-label="Quitar línea"
                                        >
                                          ×
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <button
                              type="button"
                              disabled={draft.lines.length >= 30 || catalog.length === 0}
                              onClick={() =>
                                setDraft((d) => {
                                  if (!d || catalog.length === 0) return d;
                                  const first = catalog[0]!.id;
                                  return { ...d, lines: [...d.lines, { platoId: first, cantidad: 1 }] };
                                })
                              }
                              className="text-sm font-medium text-accent hover:underline disabled:opacity-40"
                            >
                              + Agregar plato
                            </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })
          )}
        </tbody>
      </table>
        {filtradasPorColumna.length > 0 && ordenadas.length > visibleCount ? (
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + 10)}
            className={loadMoreClass}
          >
            Ver {Math.min(10, ordenadas.length - visibleCount)} más
          </button>
        ) : null}
      </div>
      {filtradasPorColumna.length > 0 ? (
        <p className="text-center text-xs text-text-tertiary">
          Mostrando {aMostrar.length} de {ordenadas.length} ventas
        </p>
      ) : null}
    </div>
  );
}
