"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import type { Categoria, Insumo, Plato, Receta, Unidad } from "@prisma/client";
import {
  createCategoria,
  createPlato,
  deleteCategoria,
  deletePlatoConReceta,
  updateCategoria,
  updatePlatoCompleto,
  type ActionState,
} from "../actions";
import { sonUnidadesCompatibles } from "@/lib/unidades.config";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "../cop-price";
import { RecipesCardsModal, type RecipeCardGroup } from "./RecipeCardsModal";

/** Estado inicial para useFormState: no marcar éxito hasta que el server devuelva resultado explícito. */
const formIdleState: ActionState = { ok: false, message: "" };

export type CartaCategoriaRow = Categoria & {
  _count: { platos: number };
};

export type CartaPlatoRow = Plato & {
  recetas: Array<
    Receta & {
      insumo: { nombre: string; unidadBase: Unidad };
    }
  >;
  categoria: Categoria | null;
};

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
  complete: "bg-success",
  needsRecipe: "bg-warning",
  noRecipe: "bg-text-tertiary",
};

function Feedback({ state }: { state: ActionState }) {
  if (!("ok" in state) || state.ok) return null;
  if (!state.message?.trim()) return null;
  return (
    <div className="mt-3 rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">
      {state.message}
    </div>
  );
}

function CartaGroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h4 className="text-sm font-medium text-text-secondary">{title}</h4>
      <span
        className="inline-flex min-h-[1.25rem] items-center rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-xs tabular-nums text-text-tertiary"
        aria-label={`${count} platos`}
      >
        {count}
      </span>
    </div>
  );
}

function buildMenuSections(platos: CartaPlatoRow[], categorias: CartaCategoriaRow[]) {
  const knownCatIds = new Set(categorias.map((c) => c.id));
  const byId = new Map<string, CartaPlatoRow[]>();
  for (const p of platos) {
    const cid = p.categoriaId ?? "__sin__";
    if (!byId.has(cid)) byId.set(cid, []);
    byId.get(cid)!.push(p);
  }
  for (const arr of Array.from(byId.values())) {
    arr.sort((a: CartaPlatoRow, b: CartaPlatoRow) => a.nombre.localeCompare(b.nombre, "es"));
  }

  const sections: { key: string; titulo: string; count: number; platos: CartaPlatoRow[] }[] = [];
  for (const c of categorias) {
    const list = byId.get(c.id) ?? [];
    if (list.length > 0) {
      sections.push({ key: c.id, titulo: c.nombre, count: list.length, platos: list });
    }
  }
  for (const [cid, list] of Array.from(byId.entries())) {
    if (cid === "__sin__" || knownCatIds.has(cid) || list.length === 0) continue;
    const titulo = list[0]?.categoria?.nombre?.trim() || "Categoría";
    sections.push({ key: cid, titulo, count: list.length, platos: list });
  }
  const sin = byId.get("__sin__") ?? [];
  if (sin.length > 0) {
    sections.push({ key: "__sin__", titulo: "Sin categoría", count: sin.length, platos: sin });
  }
  return sections;
}

function CategoriaChips({
  categorias,
  onDeleted,
}: {
  categorias: CartaCategoriaRow[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renamePending, startRenameTransition] = useTransition();
  const [inlineOpen, setInlineOpen] = useState(false);
  const [state, formAction] = useFormState(createCategoria, formIdleState);
  const [deleteTarget, setDeleteTarget] = useState<CartaCategoriaRow | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok && state.message) {
      router.refresh();
      setInlineOpen(false);
    }
  }, [state.ok, state.message, router]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteCategoria(formIdleState, fd);
      if (res.ok) {
        setDeleteTarget(null);
        router.refresh();
        onDeleted();
      }
    });
  }, [deleteTarget, onDeleted, router]);

  const cancelRename = useCallback(() => {
    setRenameId(null);
    setRenameDraft("");
    setRenameError(null);
  }, []);

  const commitRename = useCallback(
    (c: CartaCategoriaRow) => {
      if (renameId !== c.id) return;
      const next = renameDraft.trim();
      if (!next) {
        cancelRename();
        return;
      }
      if (next === c.nombre) {
        cancelRename();
        return;
      }
      startRenameTransition(async () => {
        const res = await updateCategoria(c.id, next);
        if (!res.ok) {
          setRenameError(res.message);
          return;
        }
        cancelRename();
        router.refresh();
      });
    },
    [renameDraft, renameId, cancelRename, router],
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-text-primary">Categorías del menú</h4>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden />
          Receta completa
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
          Receta pendiente
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-text-tertiary" aria-hidden />
          No requiere receta
        </span>
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        Crea y ordena bloques para tu carta. Los platos pueden quedar sin categoría.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {categorias.map((c) => (
          <div key={c.id} className="inline-flex max-w-full flex-col gap-0.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-secondary">
              {renameId === c.id ? (
                <input
                  autoFocus
                  disabled={renamePending}
                  value={renameDraft}
                  onChange={(e) => {
                    setRenameDraft(e.target.value);
                    setRenameError(null);
                  }}
                  onBlur={() => commitRename(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRenameDraft(c.nombre);
                      cancelRename();
                    }
                  }}
                  className="min-h-[1.875rem] min-w-[80px] max-w-[200px] rounded-full border border-accent bg-surface-elevated px-2 py-1 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="max-w-[200px] truncate text-left font-medium text-text-primary no-underline decoration-none hover:no-underline"
                    style={{ textDecoration: "none" }}
                    onClick={() => {
                      setRenameId(c.id);
                      setRenameDraft(c.nombre);
                      setRenameError(null);
                    }}
                  >
                    {c.nombre}
                  </button>
                  <button
                    type="button"
                    className="rounded px-1 text-base leading-none text-text-tertiary hover:bg-border hover:text-danger"
                    aria-label={`Eliminar categoría ${c.nombre}`}
                    onClick={() => setDeleteTarget(c)}
                  >
                    ×
                  </button>
                </>
              )}
            </span>
            {renameError && renameId === c.id ? (
              <p className="max-w-[220px] pl-1 text-xs text-danger">{renameError}</p>
            ) : null}
          </div>
        ))}

        {!inlineOpen ? (
          <button
            type="button"
            onClick={() => setInlineOpen(true)}
            className="inline-flex items-center rounded-full border border-dashed border-accent/50 bg-surface px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-light"
          >
            ＋ Nueva categoría
          </button>
        ) : (
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input
              name="nombre"
              required
              autoFocus
              placeholder="Nombre"
              className="w-40 rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Agregar
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-primary hover:bg-border"
              onClick={() => setInlineOpen(false)}
            >
              Cancelar
            </button>
            <Feedback state={state} />
          </form>
        )}
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-text-primary">Eliminar categoría</h3>
            {deleteTarget._count.platos > 0 ? (
              <p className="mt-2 text-sm text-text-secondary">
                Esta categoría tiene {deleteTarget._count.platos}{" "}
                {deleteTarget._count.platos === 1 ? "plato" : "platos"}. Al eliminarla, dejará de mostrarse en la
                carta; los platos conservan el vínculo para informes e historial.
              </p>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">¿Eliminar la categoría «{deleteTarget.nombre}»?</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm text-text-primary hover:bg-border"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmDelete}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {pending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreatePlatoModal({
  open,
  onClose,
  categorias,
}: {
  open: boolean;
  onClose: () => void;
  categorias: CartaCategoriaRow[];
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(createPlato, formIdleState);
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
    if (state.ok && state.message) {
      router.refresh();
      onClose();
      setPrecioDisplay("");
    }
  }, [state.ok, state.message, onClose, router]);

  const precioNumerico = useMemo(() => digitsToSalePriceString(precioDisplay), [precioDisplay]);
  const precioFormateado = useMemo(() => formatCopFromDigits(precioDisplay), [precioDisplay]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-20">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lg" role="dialog">
        <h3 className="text-lg font-semibold text-text-primary">Crear plato</h3>
        <form
          action={formAction}
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            if (!precioNumerico) e.preventDefault();
          }}
        >
          <input type="hidden" name="active" value={active ? "true" : "false"} />
          <input type="hidden" name="tieneReceta" value={tieneReceta ? "true" : "false"} />
          <div>
            <label className="text-sm font-medium text-text-secondary">Nombre *</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              placeholder="Ej: Hamburguesa"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary">Categoría</label>
            <select
              name="categoriaId"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary">Precio de venta *</label>
            <input type="hidden" name="salePrice" value={precioNumerico} />
            <input
              required
              inputMode="numeric"
              value={precioFormateado}
              onChange={(e) => setPrecioDisplay(e.target.value.replace(/[^\d]/g, ""))}
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              placeholder="Ej: $ 25.000"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={tieneReceta}
                onChange={(e) => setTieneReceta(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent"
              />
              ¿Tiene receta?
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent"
              />
              Activo
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-border"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!precioNumerico}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
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
  categorias,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  categorias: CartaCategoriaRow[];
  initial: CartaPlatoRow | null;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(updatePlatoCompleto, formIdleState);
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
    if (state.ok && state.message) {
      router.refresh();
      onClose();
    }
  }, [state.ok, state.message, onClose, router]);

  const precioNumerico = useMemo(() => digitsToSalePriceString(precioDisplay), [precioDisplay]);
  const precioFormateado = useMemo(() => formatCopFromDigits(precioDisplay), [precioDisplay]);

  if (!open || !initial) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-20">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lg" role="dialog">
        <h3 className="text-lg font-semibold text-text-primary">Editar plato</h3>
        <form
          key={initial.id}
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
            <label className="text-sm font-medium text-text-secondary">Nombre *</label>
            <input
              name="nombre"
              required
              defaultValue={initial.nombre}
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary">Categoría</label>
            <select
              name="categoriaId"
              defaultValue={initial.categoriaId ?? ""}
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary">Precio de venta *</label>
            <input type="hidden" name="salePrice" value={precioNumerico} />
            <input
              required
              inputMode="numeric"
              value={precioFormateado}
              onChange={(e) => setPrecioDisplay(e.target.value.replace(/[^\d]/g, ""))}
              className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={tieneReceta}
                onChange={(e) => setTieneReceta(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent"
              />
              ¿Tiene receta?
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent"
              />
              Activo
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-border"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!precioNumerico}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
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
  const tieneIngredientes = plato.recetas.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-text-primary">Eliminar plato</h3>
        {tieneIngredientes ? (
          <>
            <p className="mt-2 text-sm text-text-secondary">
              Este plato tiene una receta asociada que también será eliminada. ¿Confirmas?
            </p>
            <p className="mt-1 text-sm font-medium text-text-primary">{plato.nombre}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">
            ¿Seguro que deseas eliminar <strong>{plato.nombre}</strong>?
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text-primary hover:bg-border"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
          >
            {pending ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CartaTab({
  platos: platosRaw,
  categorias: categoriasRaw,
  insumos: insumosRaw,
  initialDishId,
}: {
  platos: CartaPlatoRow[];
  categorias: CartaCategoriaRow[];
  insumos: Insumo[];
  initialDishId?: string;
}) {
  const platos = useMemo(
    () => platosRaw.filter((p) => p.deletedAt == null),
    [platosRaw],
  );
  const categorias = useMemo(
    () => categoriasRaw.filter((c) => c.deletedAt == null),
    [categoriasRaw],
  );
  const insumos = useMemo(
    () => insumosRaw.filter((i) => i.deletedAt == null),
    [insumosRaw],
  );

  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingDeletePlato, setPendingDeletePlato] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createModalKey, setCreateModalKey] = useState(0);
  const [editModalKey, setEditModalKey] = useState(0);
  const [editPlato, setEditPlato] = useState<CartaPlatoRow | null>(null);
  const [deletePlato, setDeletePlato] = useState<CartaPlatoRow | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [recipePlatoId, setRecipePlatoId] = useState<string | null>(null);

  const menuSections = useMemo(() => buildMenuSections(platos, categorias), [platos, categorias]);

  /** Platos marcados con receta obligatoria pero sin filas de receta aún. */
  const platosNecesitanReceta = useMemo(() => {
    return [...platos]
      .filter((p) => p.tieneReceta && p.recetas.length === 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [platos]);

  const platosConInconsistenciaUnidades = useMemo(() => {
    return [...platos]
      .filter((plato) =>
        plato.recetas.some((receta) =>
          !sonUnidadesCompatibles(receta.insumo.unidadBase as string, receta.unidad as string),
        ),
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [platos]);

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

  const handleCardClick = useCallback((p: CartaPlatoRow) => {
    if (!p.tieneReceta) return;
    setRecipePlatoId(p.id);
  }, []);

  const handleAlertPlatoClick = useCallback((p: CartaPlatoRow) => {
    const el = document.getElementById(`carta-plato-${p.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    handleCardClick(p);
  }, [handleCardClick]);

  const closeCreateModal = useCallback(() => setCreateOpen(false), []);
  const closeEditModal = useCallback(() => setEditPlato(null), []);

  const handleDeletePlato = useCallback(() => {
    if (!deletePlato) return;
    const id = deletePlato.id;
    setPendingDeletePlato(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deletePlatoConReceta(fd);
      setPendingDeletePlato(false);
      if (res.ok) {
        setDeletePlato(null);
        if (recipePlatoId === id) setRecipePlatoId(null);
        router.refresh();
      }
    });
  }, [deletePlato, recipePlatoId, router]);

  return (
    <div className="space-y-6">
      <CategoriaChips categorias={categorias} onDeleted={() => router.refresh()} />

      {platosNecesitanReceta.length > 0 ? (
        <div
          className="flex gap-3 rounded-lg border-l-4 border-warning bg-warning-light px-4 py-3 text-sm text-text-primary shadow-sm"
          role="status"
        >
          <span className="shrink-0 select-none text-lg leading-snug text-warning" aria-hidden>
            ⚠
          </span>
          <p className="min-w-0 leading-relaxed">
            <span className="font-medium">
              {platosNecesitanReceta.length === 1
                ? "1 plato necesita receta"
                : `${platosNecesitanReceta.length} platos necesitan receta`}
            </span>
            {": "}
            {platosNecesitanReceta.slice(0, 3).map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  className="font-medium text-warning underline decoration-warning/80 underline-offset-2 transition hover:text-warning hover:decoration-warning"
                  onClick={() => handleAlertPlatoClick(p)}
                >
                  {p.nombre}
                </button>
              </span>
            ))}
            {platosNecesitanReceta.length > 3 ? (
              <span className="text-text-secondary">
                {" "}
                +{platosNecesitanReceta.length - 3} más
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      {platosConInconsistenciaUnidades.length > 0 ? (
        <div
          className="flex gap-3 rounded-lg border-l-4 border-danger bg-danger-light px-4 py-3 text-sm text-text-primary shadow-sm"
          role="status"
        >
          <span className="shrink-0 select-none text-lg leading-snug text-danger" aria-hidden>
            ✕
          </span>
          <p className="min-w-0 leading-relaxed">
            <span className="font-medium">
              {platosConInconsistenciaUnidades.length === 1
                ? "1 plato tiene inconsistencias de unidades"
                : `${platosConInconsistenciaUnidades.length} platos tienen inconsistencias de unidades`}
            </span>
            {": "}
            {platosConInconsistenciaUnidades.slice(0, 3).map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  className="font-medium text-danger underline decoration-danger/80 underline-offset-2 transition hover:text-danger hover:decoration-danger"
                  onClick={() => handleAlertPlatoClick(p)}
                >
                  {p.nombre}
                </button>
              </span>
            ))}
            {platosConInconsistenciaUnidades.length > 3 ? (
              <span className="text-text-secondary">
                {" "}
                +{platosConInconsistenciaUnidades.length - 3} más
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      <section className="relative rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Menú</h3>
            <p className="mt-1 text-sm text-text-tertiary">Platos agrupados por categoría.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateModalKey((k) => k + 1);
              setCreateOpen(true);
            }}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover"
          >
            Crear plato
          </button>
        </div>

        {platos.length === 0 ? (
          <p className="text-sm text-text-tertiary">Aún no tienes platos en tu carta. Crea el primero.</p>
        ) : menuSections.length === 0 ? (
          <p className="text-sm text-text-tertiary">No hay platos para mostrar en las categorías.</p>
        ) : (
          <div className="space-y-10">
            {menuSections.map((sec) => (
              <div key={sec.key}>
                <CartaGroupHeading title={sec.titulo} count={sec.count} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sec.platos.map((p) => {
                    const st = cardStatus(p);
                    const clickable = p.tieneReceta;
                    return (
                      <div
                        key={p.id}
                        id={`carta-plato-${p.id}`}
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
                        className={`relative rounded-xl border border-border bg-surface p-4 pt-10 shadow-sm transition-shadow ${
                          clickable ? "cursor-pointer hover:shadow-md" : "cursor-default hover:shadow-sm"
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
                        <div className="absolute right-2 top-2 flex items-start gap-1">
                          <span
                            className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              p.active ? "bg-accent-light text-accent" : "bg-surface-elevated text-text-tertiary"
                            }`}
                          >
                            {p.active ? "Activo" : "Inactivo"}
                          </span>
                          <button
                            type="button"
                            className="rounded-md px-2 py-1 text-lg leading-none text-text-secondary hover:bg-surface-elevated"
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
                              <div className="absolute right-0 top-9 z-20 min-w-[160px] rounded-lg border border-border bg-surface py-1 shadow-lg">
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm hover:bg-border"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuId(null);
                                    setEditModalKey((k) => k + 1);
                                    setEditPlato(p);
                                  }}
                                >
                                  Editar plato
                                </button>
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-light"
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
                        <div className="pr-14">
                          <div className="text-sm font-semibold text-text-primary">{p.nombre}</div>
                          <div className="mt-1 text-sm text-text-secondary">{formatPrecioCOP(p.precioVenta)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <CreatePlatoModal
        key={createModalKey}
        open={createOpen}
        onClose={closeCreateModal}
        categorias={categorias}
      />
      <EditPlatoModal
        key={editPlato ? `edit-${editPlato.id}-${editModalKey}` : "edit-closed"}
        open={editPlato !== null}
        onClose={closeEditModal}
        categorias={categorias}
        initial={editPlato}
      />
      <DeletePlatoModal
        open={deletePlato !== null}
        plato={deletePlato}
        onClose={() => setDeletePlato(null)}
        onConfirm={handleDeletePlato}
        pending={pendingDeletePlato}
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
    </div>
  );
}
