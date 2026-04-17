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

const idle: ActionState = { ok: true };

export function VentasHistorial({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
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

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = useCallback((v: Row) => {
    const t = parseTipoRow(v.tipo);
    setEditingId(v.id);
    setDeleteId(null);
    setOpen((prev) => new Set(prev).add(v.id));
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
          setOpen((prev) => {
            const n = new Set(prev);
            n.delete(ventaId);
            return n;
          });
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

  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no hay ventas registradas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="pb-2 pr-3 font-semibold">Fecha</th>
            <th className="pb-2 pr-3 font-semibold">Hora</th>
            <th className="pb-2 pr-3 font-semibold">Tipo</th>
            <th className="pb-2 pr-3 font-semibold">Items</th>
            <th className="pb-2 pr-3 font-semibold">Total</th>
            <th className="pb-2 pr-3 font-semibold">Método pago</th>
            <th className="pb-2 pr-2 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-text-primary">
          {rows.map((v) => {
            const expanded = open.has(v.id);
            const nItems = v.detalles.reduce((s, d) => s + d.cantidad, 0);
            const isEditing = editingId === v.id && draft;
            const todayMax = new Date().toISOString().slice(0, 10);
            const canToggleDetail = !isEditing && deleteId !== v.id;
            const dataCellToggle = canToggleDetail
              ? {
                  onClick: () => toggle(v.id),
                  className: "cursor-pointer py-2 pr-3 align-middle",
                }
              : { className: "py-2 pr-3 align-middle" };

            return (
              <Fragment key={v.id}>
                <tr className="align-top">
                  <td {...dataCellToggle}>
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
                  <td {...dataCellToggle}>
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
                  <td
                    {...(canToggleDetail
                      ? { onClick: () => toggle(v.id), className: "max-w-[200px] cursor-pointer py-2 pr-3 align-middle text-text-secondary" }
                      : { className: "max-w-[200px] py-2 pr-3 align-middle text-text-secondary" })}
                  >
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
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(v.id),
                          className: "cursor-pointer py-2 pr-3 align-middle tabular-nums",
                        }
                      : { className: "py-2 pr-3 align-middle tabular-nums" })}
                  >
                    {isEditing ? `${draft!.lines.length} ítems` : `${nItems} items`}
                  </td>
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(v.id),
                          className: "cursor-pointer py-2 pr-3 align-middle font-medium whitespace-nowrap",
                        }
                      : { className: "py-2 pr-3 align-middle font-medium whitespace-nowrap" })}
                  >
                    {isEditing ? formatCop(draftTotal) : formatCop(v.total)}
                  </td>
                  <td
                    {...(canToggleDetail
                      ? {
                          onClick: () => toggle(v.id),
                          className: "max-w-[160px] cursor-pointer py-2 align-middle text-text-secondary",
                        }
                      : { className: "max-w-[160px] py-2 align-middle text-text-secondary" })}
                  >
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
                {expanded ? (
                  <tr className="bg-surface-elevated/40">
                    <td className="pb-3 pt-0 pr-3" colSpan={7}>
                      <div className="rounded-lg border border-border/80 p-3">
                        {isEditing && draft ? (
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
                        ) : (
                          <>
                            <table className="w-full min-w-[480px] text-sm">
                              <thead>
                                <tr className="border-b border-border text-xs text-text-secondary">
                                  <th className="pb-2 pr-2 text-left font-medium">Plato</th>
                                  <th className="pb-2 pr-2 text-left font-medium">Cantidad</th>
                                  <th className="pb-2 pr-2 text-left font-medium">Precio unit.</th>
                                  <th className="pb-2 text-left font-medium">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="text-text-primary">
                                {v.detalles.map((d) => {
                                  const sub = Number(d.precioUnitario) * d.cantidad;
                                  return (
                                    <tr key={d.id} className="border-b border-border/60 last:border-0">
                                      <td className="py-2 pr-2 align-top">{d.plato.nombre}</td>
                                      <td className="py-2 pr-2 tabular-nums">{d.cantidad}</td>
                                      <td className="py-2 pr-2 whitespace-nowrap">{formatCop(d.precioUnitario)}</td>
                                      <td className="py-2 font-medium whitespace-nowrap">{formatCop(sub)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
