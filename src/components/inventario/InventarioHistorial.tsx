"use client";

import { useCallback, useState, useTransition } from "react";
import type { Unidad } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import { useRouter } from "next/navigation";
import { editarInventario, eliminarInventario } from "@/app/actions/inventario";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

export type InventarioHistorialRow = {
  id: string;
  fecha: Date;
  stockReal: Decimal;
  notas: string | null;
  insumo: { nombre: string; unidadBase: Unidad };
};

function fechaKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatFechaEncabezado(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function unitLabel(u: Unidad): string {
  return UNIT_OPTIONS.find((x) => x.value === u)?.label ?? u;
}

function formatStock(n: Decimal): string {
  const num = Number(n.toString());
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(num);
}

function stockToInputString(n: Decimal): string {
  const s = n.toString();
  return s;
}

function groupByFecha(rows: InventarioHistorialRow[]): { fecha: Date; items: InventarioHistorialRow[] }[] {
  const map = new Map<string, InventarioHistorialRow[]>();
  for (const r of rows) {
    const k = fechaKeyUtc(r.fecha);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return keys.map((k) => {
    const items = map.get(k)!;
    const fecha = items[0]!.fecha;
    items.sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre, "es"));
    return { fecha, items };
  });
}

const btnSecondary =
  "rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-elevated";
const btnDanger =
  "rounded-lg border border-danger bg-danger-light px-3 py-1.5 text-sm font-medium text-danger hover:opacity-90";

const idle: ActionState = { ok: true };

export function InventarioHistorial({ rows }: { rows: InventarioHistorialRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ stockReal: string; notas: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const startEdit = useCallback((row: InventarioHistorialRow) => {
    setEditingId(row.id);
    setDeleteId(null);
    setDraft({
      stockReal: stockToInputString(row.stockReal),
      notas: row.notas?.trim() ?? "",
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(null);
  }, []);

  const saveEdit = useCallback(
    (registroId: string) => {
      if (!draft) return;
      const fd = new FormData();
      fd.set("registroId", registroId);
      fd.set("stockReal", draft.stockReal);
      fd.set("notas", draft.notas);
      startTransition(async () => {
        const res = await editarInventario(idle, fd);
        if (res.ok) {
          setEditingId(null);
          setDraft(null);
          router.refresh();
        }
      });
    },
    [draft, router],
  );

  const confirmDelete = useCallback(
    (registroId: string) => {
      const fd = new FormData();
      fd.set("registroId", registroId);
      startTransition(async () => {
        const res = await eliminarInventario(idle, fd);
        if (res.ok) {
          setDeleteId(null);
          router.refresh();
        }
      });
    },
    [router],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no tienes conteos registrados.</p>;
  }

  const grupos = groupByFecha(rows);

  return (
    <div className="space-y-8">
      {grupos.map((g) => {
        const titulo = formatFechaEncabezado(g.fecha);
        const capitalized = titulo.charAt(0).toUpperCase() + titulo.slice(1);
        const n = g.items.length;
        return (
          <div key={fechaKeyUtc(g.fecha)}>
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              {capitalized} · {n} {n === 1 ? "insumo contado" : "insumos contados"}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/80">
                    <th className="px-3 py-2 font-medium text-text-secondary">Insumo</th>
                    <th className="px-3 py-2 font-medium text-text-secondary">Stock registrado</th>
                    <th className="px-3 py-2 font-medium text-text-secondary">Unidad</th>
                    <th className="px-3 py-2 font-medium text-text-secondary">Notas</th>
                    <th className="px-3 py-2 font-medium text-text-secondary">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((row) => {
                    const isEditing = editingId === row.id && draft;
                    const isDeleting = deleteId === row.id;

                    return (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-text-primary">{row.insumo.nombre}</td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              inputMode="decimal"
                              type="text"
                              value={draft!.stockReal}
                              onChange={(e) => setDraft((d) => (d ? { ...d, stockReal: e.target.value } : d))}
                              className="w-full max-w-[8rem] rounded border border-border bg-surface-elevated px-2 py-1 tabular-nums text-text-primary"
                            />
                          ) : (
                            <span className="tabular-nums text-text-primary">{formatStock(row.stockReal)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{unitLabel(row.insumo.unidadBase)}</td>
                        <td className="max-w-[200px] px-3 py-2">
                          {isEditing ? (
                            <input
                              type="text"
                              maxLength={500}
                              value={draft!.notas}
                              onChange={(e) => setDraft((d) => (d ? { ...d, notas: e.target.value } : d))}
                              className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-text-primary"
                              placeholder="Opcional"
                            />
                          ) : (
                            <span className="truncate text-text-tertiary" title={row.notas ?? undefined}>
                              {row.notas?.trim() ? row.notas : "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {isDeleting ? (
                            <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-light/30 p-2">
                              <p className="text-xs text-danger">
                                ¿Eliminar este registro? Esta acción no se puede deshacer.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => confirmDelete(row.id)}
                                  disabled={pending}
                                  className={btnDanger}
                                >
                                  Confirmar eliminación
                                </button>
                                <button type="button" onClick={() => setDeleteId(null)} className={btnSecondary}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(row.id)}
                                disabled={pending}
                                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                              >
                                Guardar
                              </button>
                              <button type="button" onClick={cancelEdit} disabled={pending} className={btnSecondary}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => startEdit(row)} className={btnSecondary}>
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteId(row.id);
                                  setEditingId(null);
                                  setDraft(null);
                                }}
                                className={btnDanger}
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
