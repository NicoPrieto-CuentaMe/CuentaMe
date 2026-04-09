"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Insumo, Plato, Unidad } from "@prisma/client";
import { RecipeBuilderForm } from "./AddForms";
import { UNIT_OPTIONS } from "../units";
import { updateReceta } from "../actions";

type Ingredient = {
  id: string;
  insumoId: string;
  insumoNombre: string;
  cantidad: string;
  unidad: Unidad;
};

export type RecipeCardGroup = {
  platoId: string;
  platoNombre: string;
  ingredientes: Ingredient[];
};

type EditRow = {
  insumoId: string;
  cantidad: string;
  unidad: string;
};

function unitLabel(unidad: Unidad) {
  return UNIT_OPTIONS.find((u) => u.value === unidad)?.label ?? String(unidad);
}

const cellInput =
  "w-full min-w-0 rounded border border-[var(--border)]/70 bg-white px-1.5 py-1 text-xs text-[var(--foreground)] outline-none focus:border-accent sm:text-sm";

export function RecipesCardsModal({
  groups,
  platosSinReceta,
  activeDishes,
  supplies,
  preselectedDishId,
}: {
  groups: RecipeCardGroup[];
  platosSinReceta: Array<{ id: string; nombre: string }>;
  activeDishes: Plato[];
  supplies: Insumo[];
  preselectedDishId?: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [openPlatoId, setOpenPlatoId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suppliesSorted = useMemo(
    () => [...supplies].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [supplies],
  );

  const openGroup = useMemo(
    () => groups.find((g) => g.platoId === openPlatoId) ?? null,
    [groups, openPlatoId],
  );

  const beginEdit = useCallback(() => {
    if (!openGroup) return;
    setEditError(null);
    setEditRows(
      openGroup.ingredientes.map((i) => ({
        insumoId: i.insumoId,
        cantidad: i.cantidad,
        unidad: i.unidad,
      })),
    );
    setEditing(true);
  }, [openGroup]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditRows([]);
    setEditError(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!openGroup) return;

    if (editRows.length < 1) {
      setEditError("Debe haber al menos 1 ingrediente.");
      return;
    }
    const ids = editRows.map((r) => r.insumoId.trim());
    if (ids.some((id) => !id)) {
      setEditError("Selecciona un insumo en cada fila.");
      return;
    }
    if (new Set(ids).size !== ids.length) {
      setEditError("No puedes repetir el mismo insumo en la receta.");
      return;
    }
    for (let i = 0; i < editRows.length; i++) {
      const r = editRows[i];
      if (!r.cantidad.trim()) {
        setEditError(`Ingresa la cantidad en la fila ${i + 1}.`);
        return;
      }
      if (!r.unidad.trim()) {
        setEditError(`Selecciona la unidad en la fila ${i + 1}.`);
        return;
      }
    }

    startTransition(async () => {
      const res = await updateReceta({
        platoId: openGroup.platoId,
        ingredientes: editRows.map((r) => ({
          insumoId: r.insumoId.trim(),
          cantidad: r.cantidad.trim(),
          unidad: r.unidad.trim(),
        })),
      });
      if (!res.ok) {
        setEditError(res.message);
        return;
      }
      setEditing(false);
      setEditRows([]);
      setEditError(null);
      router.refresh();
    });
  }, [editRows, openGroup, router]);

  const addRow = useCallback(() => {
    setEditRows((rows) => [...rows, { insumoId: "", cantidad: "", unidad: "" }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setEditRows((rows) => rows.filter((_, i) => i !== index));
  }, []);

  const updateRow = useCallback((index: number, patch: Partial<EditRow>) => {
    setEditRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  return (
    <div className="space-y-4">
      {platosSinReceta.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">
            {platosSinReceta.length} platos aún no tienen receta:
          </span>{" "}
          {platosSinReceta.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                const params = new URLSearchParams(search?.toString());
                params.set("tab", "recetas");
                params.set("dishId", p.id);
                router.replace(`/configuracion?${params.toString()}`);
              }}
              className="underline decoration-amber-400 underline-offset-2 hover:decoration-amber-600"
            >
              {p.nombre}
              {idx < platosSinReceta.length - 1 ? ", " : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <RecipeBuilderForm activeDishes={activeDishes} supplies={supplies} initialDishId={preselectedDishId} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--foreground)]/60">Aún no tienes recetas registradas</p>
        ) : (
          groups.map((g) => (
            <button
              key={g.platoId}
              type="button"
              onClick={() => {
                setOpenPlatoId(g.platoId);
                setEditing(false);
                setEditRows([]);
                setEditError(null);
              }}
              className="rounded-xl border border-[var(--border)] bg-white p-4 text-left shadow-sm hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--foreground)]">{g.platoNombre}</div>
                  <div className="mt-1 text-sm text-[var(--foreground)]/60">
                    {g.ingredientes.length} ingredientes
                  </div>
                </div>
                <div className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                  Ver
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {openGroup ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setOpenPlatoId(null);
              setEditing(false);
              setEditRows([]);
              setEditError(null);
            }}
            aria-label="Cerrar"
          />
          <div className="relative mx-auto mt-16 max-h-[calc(100vh-5rem)] w-[min(760px,calc(100%-2rem))] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-base font-semibold text-[var(--foreground)]">{openGroup.platoNombre}</h4>
                <p className="mt-1 text-sm text-[var(--foreground)]/60">
                  {openGroup.ingredientes.length} ingredientes
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpenPlatoId(null);
                  setEditing(false);
                  setEditRows([]);
                  setEditError(null);
                }}
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:bg-gray-50 hover:text-[var(--foreground)]"
              >
                Cerrar
              </button>
            </div>

            {!editing ? (
              <div className="mt-4 space-y-2">
                <div className="rounded-lg border border-[var(--border)] bg-white">
                  <div className="grid grid-cols-12 gap-2 border-b border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]/70">
                    <div className="col-span-6">Insumo</div>
                    <div className="col-span-3">Cantidad</div>
                    <div className="col-span-3">Unidad</div>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {openGroup.ingredientes.map((i) => (
                      <div key={i.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm text-[var(--foreground)]/90">
                        <div className="col-span-6">{i.insumoNombre}</div>
                        <div className="col-span-3">{i.cantidad}</div>
                        <div className="col-span-3">{unitLabel(i.unidad)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={beginEdit}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
                  >
                    Editar receta
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border-2 border-amber-200/90 bg-amber-50/50 p-3 shadow-inner">
                {editError ? (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {editError}
                  </div>
                ) : null}

                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/60">
                    Modo edición
                  </span>
                  <button
                    type="button"
                    onClick={addRow}
                    className="rounded border border-dashed border-amber-400/80 bg-white px-2.5 py-1 text-xs font-medium text-[var(--foreground)]/90 hover:bg-amber-50"
                  >
                    ＋ Agregar insumo
                  </button>
                </div>

                <div className="overflow-x-auto rounded-md border border-amber-200/80 bg-white">
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-12 gap-1 border-b border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--foreground)]/70 sm:gap-2 sm:px-3 sm:text-sm">
                      <div className="col-span-5">Insumo</div>
                      <div className="col-span-2">Cantidad</div>
                      <div className="col-span-4">Unidad</div>
                      <div className="col-span-1 text-center"> </div>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {editRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 items-center gap-1 px-2 py-1.5 sm:gap-2 sm:px-3">
                          <div className="col-span-5">
                            <select
                              className={cellInput}
                              value={row.insumoId}
                              onChange={(e) => updateRow(idx, { insumoId: e.target.value })}
                            >
                              <option value="">Selecciona...</option>
                              {suppliesSorted.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.0001"
                              min="0"
                              className={cellInput}
                              value={row.cantidad}
                              onChange={(e) => updateRow(idx, { cantidad: e.target.value })}
                            />
                          </div>
                          <div className="col-span-4">
                            <select
                              className={cellInput}
                              value={row.unidad}
                              onChange={(e) => updateRow(idx, { unidad: e.target.value })}
                            >
                              <option value="">—</option>
                              {UNIT_OPTIONS.map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <button
                              type="button"
                              disabled={editRows.length <= 1}
                              title={editRows.length <= 1 ? "Debe quedar al menos una fila" : "Quitar fila"}
                              onClick={() => removeRow(idx)}
                              className="rounded px-1.5 py-0.5 text-lg leading-none text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-amber-200/80 pt-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={cancelEdit}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:bg-gray-50 hover:text-[var(--foreground)] disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={saveEdit}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
                  >
                    {pending ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
