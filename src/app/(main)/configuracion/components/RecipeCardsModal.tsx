"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Insumo, Plato, Unidad } from "@prisma/client";
import { RecipeBuilderForm } from "./AddForms";
import { UNIT_OPTIONS } from "../units";

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

function unitLabel(unidad: Unidad) {
  return UNIT_OPTIONS.find((u) => u.value === unidad)?.label ?? String(unidad);
}

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

  const openGroup = useMemo(
    () => groups.find((g) => g.platoId === openPlatoId) ?? null,
    [groups, openPlatoId],
  );

  const editInitial = useMemo(() => {
    if (!openGroup) return null;
    return {
      count: openGroup.ingredientes.length,
      rows: openGroup.ingredientes.map((i) => ({
        supplyId: i.insumoId,
        quantity: i.cantidad,
        unit: String(i.unidad),
      })),
    };
  }, [openGroup]);

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
            }}
            aria-label="Cerrar"
          />
          <div className="relative mx-auto mt-16 w-[min(720px,calc(100%-2rem))] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg">
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
                    onClick={() => setEditing(true)}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
                  >
                    Editar receta
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <RecipeBuilderForm
                  activeDishes={activeDishes}
                  supplies={supplies}
                  initialDishId={openGroup.platoId}
                  lockDish
                  initialCount={editInitial?.count}
                  initialRows={editInitial?.rows}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:bg-gray-50 hover:text-[var(--foreground)]"
                  >
                    Volver
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

