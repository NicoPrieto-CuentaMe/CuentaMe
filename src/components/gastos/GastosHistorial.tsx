"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { GastoFijo } from "@prisma/client";
import { useRouter } from "next/navigation";
import { deleteGastoFijo } from "@/app/actions/gastos";
import { CATEGORIA_LABELS, METODO_PAGO_LABELS, PERIODICIDAD_LABELS } from "@/lib/gastos-constants";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import type { CategoriaGasto } from "@prisma/client";

const idle: ActionState = { ok: true };

const btnSecondary =
  "rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-elevated";
const btnDanger =
  "rounded-lg border border-danger bg-danger-light px-3 py-1.5 text-sm font-medium text-danger hover:opacity-90";

function monthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatFecha(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatCop(monto: { toString(): string }): string {
  const n = Number(monto.toString());
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function GastosHistorial({
  rows,
  onEdit,
}: {
  rows: GastoFijo[];
  onEdit: (g: GastoFijo) => void;
}) {
  const router = useRouter();
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaGasto | "">("");
  const [mesFiltro, setMesFiltro] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      set.add(monthKeyUtc(r.fecha));
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [rows]);

  const mesLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of mesesDisponibles) {
      const [y, m] = k.split("-").map(Number);
      const d = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
      const label = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
      map.set(k, label.charAt(0).toUpperCase() + label.slice(1));
    }
    return map;
  }, [mesesDisponibles]);

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (categoriaFiltro && r.categoria !== categoriaFiltro) return false;
      if (mesFiltro && monthKeyUtc(r.fecha) !== mesFiltro) return false;
      return true;
    });
  }, [rows, categoriaFiltro, mesFiltro]);

  const confirmDelete = useCallback(
    (id: string) => {
      const fd = new FormData();
      fd.set("id", id);
      startTransition(async () => {
        const res = await deleteGastoFijo(idle, fd);
        if (res.ok) {
          setDeleteId(null);
          setDeleteError(null);
          router.refresh();
        } else {
          setDeleteError(res.message ?? "No se pudo eliminar.");
        }
      });
    },
    [router],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no has registrado gastos fijos.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[min(100%,200px)]">
          <label className="text-xs font-medium text-text-secondary" htmlFor="filtro-cat">
            Categoría
          </label>
          <select
            id="filtro-cat"
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro((e.target.value || "") as CategoriaGasto | "")}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          >
            <option value="">Todas las categorías</option>
            {(Object.keys(CATEGORIA_LABELS) as CategoriaGasto[]).map((k) => (
              <option key={k} value={k}>
                {CATEGORIA_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[min(100%,220px)]">
          <label className="text-xs font-medium text-text-secondary" htmlFor="filtro-mes">
            Mes y año
          </label>
          <select
            id="filtro-mes"
            value={mesFiltro}
            onChange={(e) => setMesFiltro(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          >
            <option value="">Todos los períodos</option>
            {mesesDisponibles.map((k) => (
              <option key={k} value={k}>
                {mesLabels.get(k) ?? k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-text-tertiary">No hay gastos que coincidan con los filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/80">
                <th className="px-3 py-2 font-medium text-text-secondary">Fecha</th>
                <th className="px-3 py-2 font-medium text-text-secondary">Categoría</th>
                <th className="px-3 py-2 font-medium text-text-secondary">Descripción</th>
                <th className="px-3 py-2 font-medium text-text-secondary">Monto</th>
                <th className="px-3 py-2 font-medium text-text-secondary">Periodicidad</th>
                <th className="px-3 py-2 font-medium text-text-secondary">Método de pago</th>
                <th className="px-3 py-2 font-medium text-text-secondary">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((row) => {
                const isDeleting = deleteId === row.id;
                return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-text-primary">{formatFecha(row.fecha)}</td>
                    <td className="px-3 py-2 text-text-secondary">{CATEGORIA_LABELS[row.categoria]}</td>
                    <td className="max-w-[200px] px-3 py-2 text-text-tertiary">
                      <span className="line-clamp-2" title={row.descripcion ?? undefined}>
                        {row.descripcion?.trim() ? row.descripcion : "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-text-primary">
                      {formatCop(row.monto)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{PERIODICIDAD_LABELS[row.periodicidad]}</td>
                    <td className="px-3 py-2 text-text-secondary">{METODO_PAGO_LABELS[row.metodoPago]}</td>
                    <td className="px-3 py-2 align-top">
                      {isDeleting ? (
                        <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-light/30 p-2">
                          <p className="text-xs text-danger">¿Eliminar este gasto? Esta acción no se puede deshacer.</p>
                          {deleteError ? (
                            <p className="text-xs text-danger">{deleteError}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => confirmDelete(row.id)}
                              disabled={pending}
                              className={btnDanger}
                            >
                              Confirmar eliminación
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteId(null);
                                setDeleteError(null);
                              }}
                              className={btnSecondary}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onEdit(row);
                              setDeleteId(null);
                              setDeleteError(null);
                            }}
                            className={btnSecondary}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteId(row.id);
                              setDeleteError(null);
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
      )}
    </div>
  );
}
