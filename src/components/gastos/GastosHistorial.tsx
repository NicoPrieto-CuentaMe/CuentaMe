"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { GastoFijo } from "@prisma/client";
import { useRouter } from "next/navigation";
import { deleteGastoFijo } from "@/app/actions/gastos";
import { CATEGORIA_LABELS, METODO_PAGO_LABELS, PERIODICIDAD_LABELS } from "@/lib/gastos-constants";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import type { CategoriaGasto } from "@prisma/client";
import { ColumnHeader } from "@/components/ui/ColumnHeader";

const idle: ActionState = { ok: true };

const btnSecondary =
  "rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-elevated";
const btnDanger =
  "rounded-lg border border-danger bg-danger-light px-3 py-1.5 text-sm font-medium text-danger hover:opacity-90";
const loadMoreClass =
  "w-full border border-border border-t-0 bg-surface-elevated/50 py-2 text-center text-xs text-text-tertiary transition hover:bg-surface-elevated";

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

  const [visibleCount, setVisibleCount] = useState(10);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    setVisibleCount(10);
  }, [categoriaFiltro, mesFiltro]);

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

  const filtradasPorColumna = useMemo(() => {
    return filtradas.filter((row) => {
      const qFecha = (columnSearch.fecha ?? "").trim().toLowerCase();
      if (qFecha && !formatFecha(row.fecha).toLowerCase().includes(qFecha)) return false;

      const qCat = (columnSearch.categoria ?? "").trim().toLowerCase();
      if (qCat && !CATEGORIA_LABELS[row.categoria].toLowerCase().includes(qCat)) return false;

      const qMonto = (columnSearch.monto ?? "").trim().toLowerCase();
      if (qMonto && !formatCop(row.monto).toLowerCase().includes(qMonto)) return false;

      const qPer = (columnSearch.periodicidad ?? "").trim().toLowerCase();
      if (qPer && !PERIODICIDAD_LABELS[row.periodicidad].toLowerCase().includes(qPer)) return false;

      const qMp = (columnSearch.metodoPago ?? "").trim().toLowerCase();
      if (qMp && !METODO_PAGO_LABELS[row.metodoPago].toLowerCase().includes(qMp)) return false;

      return true;
    });
  }, [filtradas, columnSearch]);

  const ordenadas = useMemo(() => {
    if (!sortColumn) return filtradasPorColumna;
    const arr = [...filtradasPorColumna];
    const m = sortDirection === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortColumn) {
        case "fecha": {
          return (a.fecha.getTime() - b.fecha.getTime()) * m;
        }
        case "categoria": {
          return CATEGORIA_LABELS[a.categoria].localeCompare(CATEGORIA_LABELS[b.categoria], "es") * m;
        }
        case "monto": {
          return (Number(a.monto) - Number(b.monto)) * m;
        }
        case "periodicidad": {
          return (
            PERIODICIDAD_LABELS[a.periodicidad].localeCompare(PERIODICIDAD_LABELS[b.periodicidad], "es") * m
          );
        }
        case "metodoPago": {
          return (
            METODO_PAGO_LABELS[a.metodoPago].localeCompare(METODO_PAGO_LABELS[b.metodoPago], "es") * m
          );
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [filtradasPorColumna, sortColumn, sortDirection]);

  const aMostrar = useMemo(
    () => ordenadas.slice(0, visibleCount),
    [ordenadas, visibleCount],
  );

  const onSort = useCallback((key: string, dir: "asc" | "desc") => {
    setSortColumn(key);
    setSortDirection(dir);
    setVisibleCount(10);
  }, []);

  const onSearch = useCallback((key: string, value: string) => {
    setColumnSearch((prev) => ({ ...prev, [key]: value }));
    setVisibleCount(10);
  }, []);

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
      ) : filtradasPorColumna.length === 0 ? (
        <p className="text-sm text-text-tertiary">No hay gastos que coincidan con la búsqueda de columnas.</p>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/80">
                  <th className="relative px-3 py-2 font-medium text-text-secondary">
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
                  <th className="relative px-3 py-2 font-medium text-text-secondary">
                    <ColumnHeader
                      label="Categoría"
                      columnKey="categoria"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={onSort}
                      searchValue={columnSearch.categoria ?? ""}
                      onSearch={onSearch}
                      onClear={() => {
                        if (sortColumn === "categoria") {
                          setSortColumn(null);
                          setSortDirection("asc");
                        }
                        onSearch("categoria", "");
                      }}
                    />
                  </th>
                  <th className="relative px-3 py-2 font-medium text-text-secondary">
                    <ColumnHeader
                      label="Monto"
                      columnKey="monto"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={onSort}
                      searchValue={columnSearch.monto ?? ""}
                      onSearch={onSearch}
                      onClear={() => {
                        if (sortColumn === "monto") {
                          setSortColumn(null);
                          setSortDirection("asc");
                        }
                        onSearch("monto", "");
                      }}
                    />
                  </th>
                  <th className="relative px-3 py-2 font-medium text-text-secondary">
                    <ColumnHeader
                      label="Periodicidad"
                      columnKey="periodicidad"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={onSort}
                      searchValue={columnSearch.periodicidad ?? ""}
                      onSearch={onSearch}
                      onClear={() => {
                        if (sortColumn === "periodicidad") {
                          setSortColumn(null);
                          setSortDirection("asc");
                        }
                        onSearch("periodicidad", "");
                      }}
                    />
                  </th>
                  <th className="relative px-3 py-2 font-medium text-text-secondary">
                    <ColumnHeader
                      label="Método de pago"
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
                  <th className="px-3 py-2 font-medium text-text-secondary">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {aMostrar.map((row) => {
                  const isDeleting = deleteId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-text-primary">{formatFecha(row.fecha)}</td>
                      <td className="px-3 py-2 text-text-secondary">{CATEGORIA_LABELS[row.categoria]}</td>
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
            {ordenadas.length > visibleCount ? (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 10)}
                className={loadMoreClass}
              >
                Ver {Math.min(10, ordenadas.length - visibleCount)} más
              </button>
            ) : null}
          </div>
          <p className="text-center text-xs text-text-tertiary">
            Mostrando {aMostrar.length} de {ordenadas.length} gastos
          </p>
        </div>
      )}
    </div>
  );
}
