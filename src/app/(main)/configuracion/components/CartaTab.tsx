"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import type { Insumo, Plato, Receta, Unidad } from "@prisma/client";
import { createPlato, deletePlatoConReceta, updatePlatoCompleto, type ActionState } from "../actions";
import { platoCategorias } from "../categories";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "../cop-price";
import { RecipesCardsModal, type RecipeCardGroup } from "./RecipeCardsModal";

const initialState: ActionState = { ok: true };

export type CartaPlatoRow = Plato & {
  recetas: Array<
    Receta & {
      insumo: { nombre: string };
    }
  >;
};

function sortCategoryKeys(keys: string[]) {
  const order = new Map<string, number>(platoCategorias.map((c, i) => [c, i]));
  const sin = "(Sin categoría)";
  return [...keys].sort((a, b) => {
    if (a === sin) return 1;
    if (b === sin) return -1;
    const ia = order.has(a) ? order.get(a)! : 1000;
    const ib = order.has(b) ? order.get(b)! : 1000;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "es");
  });
}

function groupByCategory(platos: CartaPlatoRow[]) {
  const map = new Map<string, CartaPlatoRow[]>();
  for (const p of platos) {
    const key = p.categoria?.trim() ? p.categoria.trim() : "(Sin categoría)";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  for (const arr of Array.from(map.values())) {
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }
  return sortCategoryKeys(Array.from(map.keys())).map((k) => ({ categoria: k, platos: map.get(k)! }));
}

function formatPrecioCOP(precio: unknown) {
  return formatCopFromDigits(precioVentaToDigits(precio));
}

type CardStatus = "complete" | "needsRecipe" | "noRecipe";

function cardStatus(p: CartaPlatoRow): CardStatus {
  if (!p.tieneReceta) return "noRecipe";
  if (p.recetas.length >= 1) return "complete";
  return "needsRecipe";
}

const statusDot: Record<CardStatus, string> = {
  complete: "bg-emerald-500",
  needsRecipe: "bg-amber-400",
  noRecipe: "bg-gray-400",
};

function Feedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.message}
    </div>
  );
}

function CreatePlatoModal({
  open,
  onClose,
  platos,
}: {
  open: boolean;
  onClose: () => void;
  platos: CartaPlatoRow[];
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(createPlato, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [precioDisplay, setPrecioDisplay] = useState("");
  const [active, setActive] = useState(true);
  const [tieneReceta, setTieneReceta] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPrecioDisplay("");
    setActive(true);
    setTieneReceta(true);
  }, [open]);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onClose();
      formRef.current?.reset();
      setPrecioDisplay("");
    }
  }, [state.ok, onClose, router]);

  const precioNumerico = useMemo(() => digitsToSalePriceString(precioDisplay), [precioDisplay]);
  const precioFormateado = useMemo(() => formatCopFromDigits(precioDisplay), [precioDisplay]);
  const categoryOptions = useMemo(() => {
    const predefined = new Set<string>(platoCategorias);
    const extra = new Set<string>();
    for (const p of platos) {
      const c = p.categoria?.trim();
      if (c && !predefined.has(c)) extra.add(c);
    }
    return [...platoCategorias, ...Array.from(extra).sort((a, b) => a.localeCompare(b, "es"))];
  }, [platos]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg"
        role="dialog"
        aria-labelledby="plato-create-title"
      >
        <h3 id="plato-create-title" className="text-lg font-semibold text-[var(--foreground)]">
          Crear plato
        </h3>
        <form
          key="create-plato"
          ref={formRef}
          action={formAction}
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            if (!precioNumerico) e.preventDefault();
          }}
        >
          <input type="hidden" name="active" value={active ? "true" : "false"} />
          <input type="hidden" name="tieneReceta" value={tieneReceta ? "true" : "false"} />
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Nombre *</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Ej: Hamburguesa"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Categoría</label>
            <select
              name="category"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Selecciona...</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Precio de venta *</label>
            <input type="hidden" name="salePrice" value={precioNumerico} />
            <input
              required
              inputMode="numeric"
              value={precioFormateado}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                setPrecioDisplay(digits);
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Ej: $ 25.000"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]/90">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[#1a6b3c] focus:ring-[#1a6b3c]"
              />
              Activo
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]/90">
              <input
                type="checkbox"
                checked={tieneReceta}
                onChange={(e) => setTieneReceta(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[#1a6b3c] focus:ring-[#1a6b3c]"
              />
              ¿Tiene receta?
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!precioNumerico}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#1a6b3c" }}
            >
              Crear plato
            </button>
          </div>
          <Feedback state={state} />
        </form>
      </div>
    </div>
  );
}

function EditPlatoModal({
  open,
  onClose,
  platos,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  platos: CartaPlatoRow[];
  initial: CartaPlatoRow | null;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(updatePlatoCompleto, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [precioDisplay, setPrecioDisplay] = useState("");
  const [active, setActive] = useState(true);
  const [tieneReceta, setTieneReceta] = useState(true);

  useEffect(() => {
    if (!open || !initial) return;
    setPrecioDisplay(precioVentaToDigits(initial.precioVenta));
    setActive(initial.active);
    setTieneReceta(initial.tieneReceta);
  }, [open, initial]);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onClose();
      formRef.current?.reset();
    }
  }, [state.ok, onClose, router]);

  const precioNumerico = useMemo(() => digitsToSalePriceString(precioDisplay), [precioDisplay]);
  const precioFormateado = useMemo(() => formatCopFromDigits(precioDisplay), [precioDisplay]);
  const categoryOptions = useMemo(() => {
    const predefined = new Set<string>(platoCategorias);
    const extra = new Set<string>();
    for (const p of platos) {
      const c = p.categoria?.trim();
      if (c && !predefined.has(c)) extra.add(c);
    }
    return [...platoCategorias, ...Array.from(extra).sort((a, b) => a.localeCompare(b, "es"))];
  }, [platos]);

  if (!open || !initial) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg"
        role="dialog"
        aria-labelledby="plato-edit-title"
      >
        <h3 id="plato-edit-title" className="text-lg font-semibold text-[var(--foreground)]">
          Editar plato
        </h3>
        <form
          key={initial.id}
          ref={formRef}
          action={formAction}
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            if (!precioNumerico) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="active" value={active ? "true" : "false"} />
          <input type="hidden" name="tieneReceta" value={tieneReceta ? "true" : "false"} />
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Nombre *</label>
            <input
              name="nombre"
              required
              defaultValue={initial.nombre}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Categoría</label>
            <select
              name="categoria"
              defaultValue={initial.categoria ?? ""}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Selecciona...</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">Precio de venta *</label>
            <input type="hidden" name="salePrice" value={precioNumerico} />
            <input
              required
              inputMode="numeric"
              value={precioFormateado}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                setPrecioDisplay(digits);
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Ej: $ 25.000"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]/90">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[#1a6b3c] focus:ring-[#1a6b3c]"
              />
              Activo
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]/90">
              <input
                type="checkbox"
                checked={tieneReceta}
                onChange={(e) => setTieneReceta(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[#1a6b3c] focus:ring-[#1a6b3c]"
              />
              ¿Tiene receta?
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!precioNumerico}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#1a6b3c" }}
            >
              Guardar cambios
            </button>
          </div>
          <Feedback state={state} />
        </form>
      </div>
    </div>
  );
}

function DeletePlatoModal({
  open,
  plato,
  onClose,
  onConfirm,
  pending,
}: {
  open: boolean;
  plato: CartaPlatoRow | null;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  if (!open || !plato) return null;
  const hasRecetaRows = plato.recetas.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Eliminar plato</h3>
        <p className="mt-2 text-sm text-[var(--foreground)]/80">
          ¿Seguro que deseas eliminar <strong>{plato.nombre}</strong>?
        </p>
        {hasRecetaRows ? (
          <p className="mt-2 text-sm text-amber-800">
            Este plato tiene una receta asociada que también será eliminada.
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CartaTab({
  platos,
  insumos,
  initialDishId,
}: {
  platos: CartaPlatoRow[];
  insumos: Insumo[];
  initialDishId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlato, setEditPlato] = useState<CartaPlatoRow | null>(null);
  const [deletePlato, setDeletePlato] = useState<CartaPlatoRow | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [recipePlatoId, setRecipePlatoId] = useState<string | null>(null);

  const grouped = useMemo(() => groupByCategory(platos), [platos]);

  const activeDishes = useMemo(() => platos.filter((p) => p.active), [platos]);

  const recipeGroups: RecipeCardGroup[] = useMemo(
    () =>
      platos
        .filter((p) => p.tieneReceta)
        .map((p) => ({
          platoId: p.id,
          platoNombre: p.nombre,
          ingredientes: p.recetas.map((ri) => ({
            id: ri.id,
            insumoId: ri.insumoId,
            insumoNombre: ri.insumo.nombre,
            cantidad: String(ri.cantidad),
            unidad: ri.unidad as Unidad,
          })),
        })),
    [platos],
  );

  const platosSinReceta = useMemo(() => {
    return activeDishes
      .filter((p) => p.tieneReceta && p.recetas.length === 0)
      .map((p) => ({ id: p.id, nombre: p.nombre }));
  }, [activeDishes]);

  useEffect(() => {
    if (!initialDishId) return;
    const p = platos.find((x) => x.id === initialDishId);
    if (p?.tieneReceta) setRecipePlatoId(initialDishId);
  }, [initialDishId, platos]);

  const handleCardClick = useCallback(
    (p: CartaPlatoRow) => {
      if (!p.tieneReceta) return;
      setRecipePlatoId(p.id);
    },
    [],
  );

  const handleDelete = useCallback(() => {
    if (!deletePlato) return;
    const id = deletePlato.id;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deletePlatoConReceta(fd);
      if (res.ok) {
        setDeletePlato(null);
        if (recipePlatoId === id) setRecipePlatoId(null);
        router.refresh();
      }
    });
  }, [deletePlato, recipePlatoId, router]);

  return (
    <section className="relative rounded-xl border border-[var(--border)] bg-[#f8f9fa] p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)]">Carta</h3>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Tus platos por categoría; abre la receta desde cada tarjeta cuando aplique.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          style={{ backgroundColor: "#1a6b3c" }}
        >
          Crear plato
        </button>
      </div>

      {platos.length === 0 ? (
        <p className="text-sm text-[var(--foreground)]/60">Aún no tienes platos en tu carta. Crea el primero.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ categoria, platos: list }) => (
            <div key={categoria}>
              <h4 className="mb-3 text-sm font-bold text-[var(--foreground)]">{categoria}</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => {
                  const st = cardStatus(p);
                  const clickable = p.tieneReceta;
                  return (
                    <div
                      key={p.id}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      title={!clickable ? "Este plato no requiere receta" : undefined}
                      onClick={() => handleCardClick(p)}
                      onKeyDown={(e) => {
                        if (!clickable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleCardClick(p);
                        }
                      }}
                      className={`relative rounded-xl border border-[var(--border)] bg-white p-4 pt-10 shadow-sm transition-shadow ${
                        clickable
                          ? "cursor-pointer hover:shadow-md"
                          : "cursor-default hover:shadow-sm"
                      }`}
                    >
                      <span
                        className={`absolute left-3 top-3 h-2.5 w-2.5 rounded-full ${statusDot[st]}`}
                        title={
                          st === "complete"
                            ? "Receta completa"
                            : st === "needsRecipe"
                              ? "Falta completar la receta"
                              : "Sin receta"
                        }
                      />
                      <div className="absolute right-2 top-2">
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-lg leading-none text-[var(--foreground)]/70 hover:bg-gray-100"
                          aria-label="Más opciones"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuId((prev) => (prev === p.id ? null : p.id));
                          }}
                        >
                          ⋯
                        </button>
                        {menuId === p.id ? (
                          <>
                            <button
                              type="button"
                              className="fixed inset-0 z-10 cursor-default"
                              aria-label="Cerrar menú"
                              onClick={() => setMenuId(null)}
                            />
                            <div className="absolute right-0 top-9 z-20 min-w-[160px] rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuId(null);
                                  setEditPlato(p);
                                }}
                              >
                                Editar plato
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuId(null);
                                  setDeletePlato(p);
                                }}
                              >
                                Eliminar plato
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                      <div className="pr-6">
                        <div className="text-sm font-semibold text-[var(--foreground)]">{p.nombre}</div>
                        <div className="mt-1 text-sm text-[var(--foreground)]/80">{formatPrecioCOP(p.precioVenta)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreatePlatoModal open={createOpen} onClose={() => setCreateOpen(false)} platos={platos} />
      <EditPlatoModal open={editPlato !== null} onClose={() => setEditPlato(null)} platos={platos} initial={editPlato} />
      <DeletePlatoModal
        open={deletePlato !== null}
        plato={deletePlato}
        onClose={() => setDeletePlato(null)}
        onConfirm={handleDelete}
        pending={pending}
      />

      <RecipesCardsModal
        variant="embedded"
        groups={recipeGroups}
        platosSinReceta={platosSinReceta}
        activeDishes={activeDishes}
        supplies={insumos}
        externalPlatoId={recipePlatoId}
        onExternalClose={() => setRecipePlatoId(null)}
      />
    </section>
  );
}
