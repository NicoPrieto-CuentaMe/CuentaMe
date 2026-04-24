"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Unidad } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import { useRouter } from "next/navigation";
import { editarInventario, eliminarInventario } from "@/app/actions/inventario";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";
import { ColumnHeader } from "@/components/ui/ColumnHeader";

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

function fechaToInputString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFechaEncabezado(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function formatFechaCelda(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
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

function notasCelda(row: InventarioHistorialRow): string {
  return row.notas?.trim() ? row.notas : "—";
}

function stockToInputString(n: Decimal): string {
  return n.toString();
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
const filtroInsumoClass =
  "w-full min-h-[44px] max-w-md rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";

const idle: ActionState = { ok: true };

type ItemInventarioPlano = {
  row: InventarioHistorialRow;
  grupoFecha: Date;
  grupoLabel: string;
};

function labelGrupoDesdeFecha(fecha: Date): string {
  const t = formatFechaEncabezado(fecha);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function reagruparItemsVisiblesPorFecha(vis: ItemInventarioPlano[]): {
  key: string;
  label: string;
  fecha: Date;
  filas: InventarioHistorialRow[];
}[] {
  const orderKeys: string[] = [];
  const map = new Map<string, { label: string; fecha: Date; filas: ItemInventarioPlano[] }>();
  for (const p of vis) {
    const k = fechaKeyUtc(p.row.fecha);
    if (!map.has(k)) {
      orderKeys.push(k);
      map.set(k, { label: p.grupoLabel, fecha: p.grupoFecha, filas: [] });
    }
    map.get(k)!.filas.push(p);
  }
  return orderKeys.map((k) => {
    const b = map.get(k)!;
    return { key: k, label: b.label, fecha: b.fecha, filas: b.filas.map((x) => x.row) };
  });
}

export function InventarioHistorial({ rows }: { rows: InventarioHistorialRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ fecha: string; stockReal: string; notas: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [busquedaInsumoGlobal, setBusquedaInsumoGlobal] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<"stock" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const noopSort = useCallback((_: string, __: "asc" | "desc") => {}, []);

  useEffect(() => {
    setVisibleCount(10);
  }, [busquedaInsumoGlobal, columnSearch, sortColumn, sortDirection]);

  const onSearchInventario = useCallback((key: string, value: string) => {
    if (key === "stock") return;
    setColumnSearch((p) => ({ ...p, [key]: value }));
  }, []);

  const onSortInventario = useCallback((key: string, dir: "asc" | "desc") => {
    if (key !== "stock") return;
    setSortColumn("stock");
    setSortDirection(dir);
  }, []);

  const startEdit = useCallback((row: InventarioHistorialRow) => {
    setEditingId(row.id);
    setDeleteId(null);
    setDraft({
      fecha: fechaToInputString(row.fecha),
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
      fd.set("fecha", draft.fecha);
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

  const filasTrasInsumoGlobal = useMemo(() => {
    const q = busquedaInsumoGlobal.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.insumo.nombre.toLowerCase().includes(q));
  }, [rows, busquedaInsumoGlobal]);

  const filtradasPorColumna = useMemo(() => {
    return filasTrasInsumoGlobal.filter((row) => {
      const qI = (columnSearch.insumo ?? "").trim().toLowerCase();
      if (qI && !row.insumo.nombre.toLowerCase().includes(qI)) return false;
      const qN = (columnSearch.notas ?? "").trim().toLowerCase();
      if (qN && !notasCelda(row).toLowerCase().includes(qN)) return false;
      return true;
    });
  }, [filasTrasInsumoGlobal, columnSearch]);

  const grupos = useMemo(() => groupByFecha(filtradasPorColumna), [filtradasPorColumna]);

  const itemsPlanos = useMemo((): ItemInventarioPlano[] => {
    const planos: ItemInventarioPlano[] = grupos.flatMap((g) => {
      const grupoLabel = labelGrupoDesdeFecha(g.fecha);
      return g.items.map((row) => ({
        row,
        grupoFecha: g.fecha,
        grupoLabel,
      }));
    });
    if (sortColumn !== "stock") return planos;
    const m = sortDirection === "asc" ? 1 : -1;
    return [...planos].sort(
      (a, b) => (Number(a.row.stockReal) - Number(b.row.stockReal)) * m,
    );
  }, [grupos, sortColumn, sortDirection]);

  const itemsVisibles = useMemo(
    () => itemsPlanos.slice(0, visibleCount),
    [itemsPlanos, visibleCount],
  );

  const bloquesVista = useMemo(
    () => reagruparItemsVisiblesPorFecha(itemsVisibles),
    [itemsVisibles],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no tienes conteos registrados.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-text-secondary" htmlFor="inventario-busq-insumo">
          Buscar por nombre de insumo
        </label>
        <input
          id="inventario-busq-insumo"
          type="search"
          value={busquedaInsumoGlobal}
          onChange={(e) => setBusquedaInsumoGlobal(e.target.value)}
          className={`mt-1 ${filtroInsumoClass}`}
          placeholder="Escribe para filtrar insumos…"
          autoComplete="off"
        />
      </div>

      {filasTrasInsumoGlobal.length === 0 ? (
        <p className="text-sm text-text-tertiary">No hay conteos que coincidan con el nombre de insumo buscado.</p>
      ) : filtradasPorColumna.length === 0 ? (
        <p className="text-sm text-text-tertiary">No hay conteos que coincidan con la búsqueda de columnas.</p>
      ) : itemsPlanos.length === 0 ? null : (
        <div className="space-y-2">
          <div className="space-y-8">
            {bloquesVista.map((bloque) => {
              const n = bloque.filas.length;
              return (
                <div key={bloque.key}>
                  <h3 className="mb-3 text-sm font-semibold text-text-primary">
                    {bloque.label} · {n} {n === 1 ? "insumo contado" : "insumos contados"}
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-elevated/80">
                          <th className="px-3 py-2 font-medium text-text-secondary">Fecha</th>
                          <th className="relative px-3 py-2 font-medium text-text-secondary">
                            <ColumnHeader
                              label="Insumo"
                              columnKey="insumo"
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={noopSort}
                              searchValue={columnSearch.insumo ?? ""}
                              onSearch={onSearchInventario}
                              sortable={false}
                              searchable
                              onClear={() => onSearchInventario("insumo", "")}
                            />
                          </th>
                          <th className="relative px-3 py-2 font-medium text-text-secondary">
                            <ColumnHeader
                              label="Stock registrado"
                              columnKey="stock"
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={onSortInventario}
                              searchValue=""
                              onSearch={onSearchInventario}
                              sortable
                              searchable={false}
                              onClear={() => {
                                if (sortColumn === "stock") {
                                  setSortColumn(null);
                                  setSortDirection("asc");
                                }
                                onSearchInventario("stock", "");
                              }}
                            />
                          </th>
                          <th className="px-3 py-2 font-medium text-text-secondary">Unidad</th>
                          <th className="relative px-3 py-2 font-medium text-text-secondary">
                            <ColumnHeader
                              label="Notas"
                              columnKey="notas"
                              sortColumn={sortColumn}
                              sortDirection={sortDirection}
                              onSort={noopSort}
                              searchValue={columnSearch.notas ?? ""}
                              onSearch={onSearchInventario}
                              sortable={false}
                              searchable
                              onClear={() => onSearchInventario("notas", "")}
                            />
                          </th>
                          <th className="px-3 py-2 font-medium text-text-secondary">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bloque.filas.map((row) => {
                          const isEditing = editingId === row.id && draft;
                          const isDeleting = deleteId === row.id;
                          return (
                            <tr key={row.id} className="border-b border-border last:border-0">
                              <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    value={draft!.fecha}
                                    onChange={(e) =>
                                      setDraft((d) => (d ? { ...d, fecha: e.target.value } : d))
                                    }
                                    className="w-full min-w-[10rem] rounded border border-border bg-surface-elevated px-2 py-1 text-sm text-text-primary"
                                  />
                                ) : (
                                  formatFechaCelda(row.fecha)
                                )}
                              </td>
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
                              <td className="px-3 py-2 text-text-secondary">
                                {unitLabel(row.insumo.unidadBase)}
                              </td>
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
                                  <span
                                    className="truncate text-text-tertiary"
                                    title={row.notas ?? undefined}
                                  >
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
                                      <button
                                        type="button"
                                        onClick={() => setDeleteId(null)}
                                        className={btnSecondary}
                                      >
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
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      disabled={pending}
                                      className={btnSecondary}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => startEdit(row)}
                                      className={btnSecondary}
                                    >
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
          {itemsPlanos.length > visibleCount ? (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + 10)}
              className="w-full rounded-b-lg border border-t-0 border-border bg-surface-elevated/50 py-2 text-center text-xs text-text-tertiary transition hover:bg-surface-elevated"
            >
              Ver {Math.min(10, itemsPlanos.length - visibleCount)} más
            </button>
          ) : null}
          {itemsPlanos.length > 0 ? (
            <p className="text-center text-xs text-text-tertiary">
              Mostrando {itemsVisibles.length} de {itemsPlanos.length} insumos registrados
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
