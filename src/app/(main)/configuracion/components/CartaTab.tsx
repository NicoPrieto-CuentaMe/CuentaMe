"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { TipoPlato, type Categoria, type Insumo, type Plato, type Receta, type Unidad } from "@prisma/client";
import { X } from "lucide-react";
import {
  addCombo,
  addComboItem,
  createCategoria,
  createPlato,
  deleteCategoria,
  deleteCombo,
  deletePlatoConReceta,
  getCombosConComponentes,
  removeComboItem,
  updateCategoria,
  updateCombo,
  updateComboItemCantidad,
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

export type CombosConComponentesList = Awaited<ReturnType<typeof getCombosConComponentes>>;
export type ComboConComponentesRow = CombosConComponentesList[number];

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

type MenuSectionItem =
  | { tipoItem: "PLATO"; item: CartaPlatoRow }
  | { tipoItem: "COMBO"; item: ComboConComponentesRow };

function buildMenuSections(platos: CartaPlatoRow[], combos: ComboConComponentesRow[], categorias: CartaCategoriaRow[]) {
  const knownCatIds = new Set(categorias.map((c) => c.id));
  const byId = new Map<string, MenuSectionItem[]>();

  const push = (cid: string, entry: MenuSectionItem) => {
    if (!byId.has(cid)) byId.set(cid, []);
    byId.get(cid)!.push(entry);
  };

  for (const p of platos) push(p.categoriaId ?? "__sin__", { tipoItem: "PLATO", item: p });
  for (const c of combos) push(c.categoriaId ?? "__sin__", { tipoItem: "COMBO", item: c });

  for (const arr of Array.from(byId.values())) {
    arr.sort((a, b) => a.item.nombre.localeCompare(b.item.nombre, "es"));
  }

  const sections: { key: string; titulo: string; count: number; items: MenuSectionItem[] }[] = [];
  for (const c of categorias) {
    const list = byId.get(c.id) ?? [];
    if (list.length > 0) {
      sections.push({ key: c.id, titulo: c.nombre, count: list.length, items: list });
    }
  }
  for (const [cid, list] of Array.from(byId.entries())) {
    if (cid === "__sin__" || knownCatIds.has(cid) || list.length === 0) continue;
    const titulo = list[0]?.item?.categoria?.nombre?.trim() || "Categoría";
    sections.push({ key: cid, titulo, count: list.length, items: list });
  }
  const sin = byId.get("__sin__") ?? [];
  if (sin.length > 0) {
    sections.push({ key: "__sin__", titulo: "Sin categoría", count: sin.length, items: sin });
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
  platos,
}: {
  open: boolean;
  onClose: () => void;
  categorias: CartaCategoriaRow[];
  platos: CartaPlatoRow[];
}) {
  const router = useRouter();

  const [tipoCrear, setTipoCrear] = useState<"PLATO" | "COMBO">("PLATO");

  const [statePlato, formActionPlato] = useFormState(createPlato, formIdleState);
  const [precioDisplay, setPrecioDisplay] = useState("");
  const [active, setActive] = useState(true);
  const [tieneReceta, setTieneReceta] = useState(true);

  const [stateCombo, formActionCombo] = useFormState(addCombo, formIdleState);
  const [precioComboDisplay, setPrecioComboDisplay] = useState("");
  const [comboActiveNew, setComboActiveNew] = useState(true);
  const [componentesLocal, setComponentesLocal] = useState<
    Array<{ platoId: string; nombre: string; cantidad: number }>
  >([]);
  const [addPlatoId, setAddPlatoId] = useState("");
  const [addCant, setAddCant] = useState(1);

  useEffect(() => {
    if (!open) return;
    setTipoCrear("PLATO");
    setPrecioDisplay("");
    setActive(true);
    setTieneReceta(true);
    setPrecioComboDisplay("");
    setComboActiveNew(true);
    setComponentesLocal([]);
    setAddPlatoId("");
    setAddCant(1);
  }, [open]);

  useEffect(() => {
    if (statePlato.ok && statePlato.message) {
      router.refresh();
      onClose();
      setPrecioDisplay("");
    }
  }, [statePlato.ok, statePlato.message, onClose, router]);

  const precioNumerico = useMemo(() => digitsToSalePriceString(precioDisplay), [precioDisplay]);
  const precioFormateado = useMemo(() => formatCopFromDigits(precioDisplay), [precioDisplay]);

  useEffect(() => {
    if (stateCombo.ok && stateCombo.message) {
      router.refresh();
      onClose();
      setPrecioComboDisplay("");
      setComponentesLocal([]);
    }
  }, [stateCombo.ok, stateCombo.message, onClose, router]);

  const precioComboNumerico = useMemo(() => digitsToSalePriceString(precioComboDisplay), [precioComboDisplay]);
  const precioComboFormateado = useMemo(() => formatCopFromDigits(precioComboDisplay), [precioComboDisplay]);

  const platosParaCombo = useMemo(
    () =>
      platos
        .filter((p) => p.tipo === TipoPlato.PLATO)
        .filter((p) => !componentesLocal.some((c) => c.platoId === p.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [platos, componentesLocal],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-20">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lg" role="dialog">
        <h3 className="text-lg font-semibold text-text-primary">Crear</h3>

        <div className="mt-4 inline-flex rounded-lg border border-border bg-surface-elevated p-1">
          <button
            type="button"
            onClick={() => setTipoCrear("PLATO")}
            className={`min-h-[44px] rounded-md px-4 py-2 text-sm font-semibold sm:min-h-0 ${
              tipoCrear === "PLATO" ? "bg-accent text-white" : "border border-border text-text-secondary"
            }`}
          >
            Plato
          </button>
          <button
            type="button"
            onClick={() => setTipoCrear("COMBO")}
            className={`min-h-[44px] rounded-md px-4 py-2 text-sm font-semibold sm:min-h-0 ${
              tipoCrear === "COMBO" ? "bg-accent text-white" : "border border-border text-text-secondary"
            }`}
          >
            Combo
          </button>
        </div>

        {tipoCrear === "PLATO" ? (
          <form
            action={formActionPlato}
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
            <Feedback state={statePlato} />
          </form>
        ) : (
          <form
            action={formActionCombo}
            className="mt-4 grid gap-4"
            onSubmit={(e) => {
              if (!precioComboNumerico) e.preventDefault();
            }}
          >
            <div>
              <label className="text-sm font-medium text-text-secondary">Nombre *</label>
              <input
                name="nombre"
                required
                maxLength={100}
                className="mt-1 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
                placeholder="Ej: Combo familiar"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Precio de venta *</label>
              <input type="hidden" name="precioVenta" value={precioComboNumerico} />
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
                  $
                </span>
                <input
                  required
                  inputMode="numeric"
                  type="text"
                  value={precioComboFormateado}
                  onChange={(e) => setPrecioComboDisplay(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated py-2 pl-8 pr-3 text-sm text-text-primary outline-none focus:border-accent"
                  placeholder="0"
                />
              </div>
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
            <input type="hidden" name="active" value={comboActiveNew ? "true" : "false"} />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={comboActiveNew}
                onChange={(e) => setComboActiveNew(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent"
              />
              Activo
            </label>

            {componentesLocal.map((c, i) => (
              <div key={c.platoId} className="hidden">
                <input type="hidden" name={`componentePlatoId_${i}`} value={c.platoId} />
                <input type="hidden" name={`componenteCantidad_${i}`} value={c.cantidad} />
              </div>
            ))}

            <div className="space-y-3 border-t border-border pt-4">
              <h4 className="text-sm font-semibold text-text-primary">Platos del combo</h4>
              {componentesLocal.length > 0 ? (
                <ul className="space-y-2">
                  {componentesLocal.map((c) => (
                    <li
                      key={c.platoId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm"
                    >
                      <span className="text-text-primary">
                        {c.nombre} <span className="text-text-tertiary">× {c.cantidad}</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {c.cantidad > 1 ? (
                          <button
                            type="button"
                            className="rounded-md border border-border bg-transparent px-2 py-1 text-sm text-text-primary hover:bg-border"
                            aria-label="Reducir cantidad"
                            onClick={() => {
                              setComponentesLocal((prev) =>
                                prev.map((x) =>
                                  x.platoId === c.platoId
                                    ? { ...x, cantidad: Math.max(1, x.cantidad - 1) }
                                    : x,
                                ),
                              );
                            }}
                          >
                            −
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-md border border-border bg-transparent px-2 py-1 text-sm text-text-primary hover:bg-border disabled:opacity-50"
                          aria-label="Aumentar cantidad"
                          disabled={c.cantidad >= 20}
                          onClick={() => {
                            setComponentesLocal((prev) =>
                              prev.map((x) =>
                                x.platoId === c.platoId
                                  ? { ...x, cantidad: Math.min(20, x.cantidad + 1) }
                                  : x,
                              ),
                            );
                          }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-danger bg-danger-light px-2 py-1 text-sm text-danger hover:opacity-90"
                          aria-label={`Quitar ${c.nombre}`}
                          onClick={() => {
                            setComponentesLocal((prev) => prev.filter((x) => x.platoId !== c.platoId));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-text-secondary" htmlFor="combo-add-plato">
                    Agregar plato
                  </label>
                  <select
                    id="combo-add-plato"
                    value={addPlatoId}
                    onChange={(e) => setAddPlatoId(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  >
                    <option value="">Selecciona…</option>
                    {platosParaCombo.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-text-secondary" htmlFor="combo-add-cant">
                    Cantidad
                  </label>
                  <input
                    id="combo-add-cant"
                    type="number"
                    min={1}
                    max={20}
                    value={addCant}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setAddCant(1);
                        return;
                      }
                      const n = Number(v);
                      if (!Number.isFinite(n)) return;
                      setAddCant(Math.min(20, Math.max(1, Math.round(n))));
                    }}
                    className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  />
                </div>
                <div className="flex items-end sm:col-span-2">
                  <button
                    type="button"
                    className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text-primary hover:bg-border"
                    onClick={() => {
                      if (!addPlatoId) return;
                      const p = platos.find((x) => x.id === addPlatoId);
                      if (!p) return;
                      setComponentesLocal((prev) => [
                        ...prev,
                        { platoId: p.id, nombre: p.nombre, cantidad: addCant },
                      ]);
                      setAddPlatoId("");
                      setAddCant(1);
                    }}
                  >
                    Agregar
                  </button>
                </div>
              </div>
              <p className="text-xs text-text-tertiary">
                Puedes agregar los platos ahora o después desde la carta.
              </p>
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
                disabled={!precioComboNumerico}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Crear combo
              </button>
            </div>
            <Feedback state={stateCombo} />
          </form>
        )}
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

const comboActionIdle: ActionState = { ok: true };

const comboInputClass =
  "w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";
const comboBtnSecondary =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-elevated sm:min-h-0";
const comboBtnDanger =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-danger bg-danger-light px-3 py-2 text-sm font-medium text-danger hover:opacity-90 sm:min-h-0";
const comboBtnAccent =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover sm:min-h-0";

function ComboEditModal({
  open,
  onClose,
  combo,
  platos,
  categorias,
}: {
  open: boolean;
  onClose: () => void;
  combo: ComboConComponentesRow | null;
  platos: CartaPlatoRow[];
  categorias: CartaCategoriaRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editNombre, setEditNombre] = useState("");
  const [editPrecioDigits, setEditPrecioDigits] = useState("");
  const [editCategoriaId, setEditCategoriaId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editComboError, setEditComboError] = useState<string | null>(null);
  const [addItemPlatoId, setAddItemPlatoId] = useState("");
  const [addItemCantidad, setAddItemCantidad] = useState(1);
  const [addItemError, setAddItemError] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editPrecioFmt = useMemo(() => formatCopFromDigits(editPrecioDigits), [editPrecioDigits]);

  const platosDisponibles = useMemo(() => {
    if (!combo) return [];
    const ids = new Set(combo.itemsCombo.map((i) => i.platoId));
    return platos
      .filter((p) => p.tipo === TipoPlato.PLATO)
      .filter((p) => !ids.has(p.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [platos, combo]);

  useEffect(() => {
    if (!open || !combo) return;
    setEditNombre(combo.nombre);
    setEditPrecioDigits(precioVentaToDigits(combo.precioVenta));
    setEditCategoriaId(combo.categoriaId ?? "");
    setEditActive(combo.active);
    setEditComboError(null);
    setAddItemPlatoId("");
    setAddItemCantidad(1);
    setAddItemError(null);
    setItemActionError(null);
    setDeleteConfirm(false);
    setDeleteError(null);
  }, [open, combo]);

  const saveCombo = useCallback(() => {
    if (!combo) return;
    const nombre = editNombre.trim();
    if (!nombre) {
      setEditComboError("El nombre es obligatorio.");
      return;
    }
    const precioVenta = digitsToSalePriceString(editPrecioDigits);
    if (!precioVenta) {
      setEditComboError("El precio debe ser mayor a 0.");
      return;
    }
    const fd = new FormData();
    fd.set("id", combo.id);
    fd.set("nombre", nombre);
    fd.set("precioVenta", precioVenta);
    fd.set("categoriaId", editCategoriaId);
    fd.set("active", editActive ? "true" : "false");
    startTransition(async () => {
      const res = await updateCombo(comboActionIdle, fd);
      if (res.ok) {
        setEditComboError(null);
        router.refresh();
      } else {
        setEditComboError(res.message ?? "No se pudo guardar.");
      }
    });
  }, [combo, editNombre, editPrecioDigits, editCategoriaId, editActive, router]);

  const removeItem = useCallback(
    (itemId: string) => {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("id", itemId);
        const res = await removeComboItem(comboActionIdle, fd);
        if (res.ok) {
          setItemActionError(null);
          router.refresh();
        } else {
          setItemActionError(res.message ?? "No se pudo quitar el plato.");
        }
      });
    },
    [router],
  );

  const bumpCantidad = useCallback(
    (itemId: string, current: number, delta: number) => {
      const next = current + delta;
      if (next < 1 || next > 20) return;
      startTransition(async () => {
        const fd = new FormData();
        fd.set("id", itemId);
        fd.set("cantidad", String(next));
        const res = await updateComboItemCantidad(comboActionIdle, fd);
        if (res.ok) {
          setItemActionError(null);
          router.refresh();
        } else {
          setItemActionError(res.message ?? "No se pudo actualizar la cantidad.");
        }
      });
    },
    [router],
  );

  const submitAddItem = useCallback(() => {
    if (!combo) return;
    if (!addItemPlatoId) {
      setAddItemError("Selecciona un plato.");
      return;
    }
    if (addItemCantidad < 1 || addItemCantidad > 20) {
      setAddItemError("La cantidad debe estar entre 1 y 20.");
      return;
    }
    setAddItemError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("comboId", combo.id);
      fd.set("platoId", addItemPlatoId);
      fd.set("cantidad", String(addItemCantidad));
      const res = await addComboItem(comboActionIdle, fd);
      if (res.ok) {
        setAddItemPlatoId("");
        setAddItemCantidad(1);
        router.refresh();
      } else {
        setAddItemError(res.message ?? "No se pudo agregar.");
      }
    });
  }, [addItemPlatoId, addItemCantidad, combo, router]);

  const confirmDelete = useCallback(() => {
    if (!combo) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", combo.id);
      const res = await deleteCombo(comboActionIdle, fd);
      if (res.ok) {
        setDeleteError(null);
        onClose();
        router.refresh();
      } else {
        setDeleteError(res.message ?? "No se pudo eliminar el combo.");
      }
    });
  }, [combo, onClose, router]);

  if (!open || !combo) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-12">
      <button type="button" className="fixed inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 pr-12 pt-12 shadow-lg"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="absolute right-3 top-3 z-20 rounded-md p-1.5 text-text-secondary hover:bg-border hover:text-text-primary"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h3 className="pr-2 text-lg font-semibold text-text-primary">{combo.nombre}</h3>
        <div key={combo.id} className="mt-4 space-y-6">
          <div className="space-y-3 rounded-lg border border-border bg-surface-elevated/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Componentes</h4>
            {combo.itemsCombo.length === 0 ? (
              <p className="text-sm text-text-tertiary">Este combo no tiene platos aún.</p>
            ) : (
              <ul className="space-y-2">
                {combo.itemsCombo.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <span className="text-text-primary">
                      {item.plato.nombre} <span className="text-text-tertiary">× {item.cantidad}</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.cantidad > 1 ? (
                        <button
                          type="button"
                          className={comboBtnSecondary}
                          aria-label="Reducir cantidad"
                          onClick={() => bumpCantidad(item.id, item.cantidad, -1)}
                        >
                          −
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={comboBtnSecondary}
                        disabled={item.cantidad >= 20}
                        aria-label="Aumentar cantidad"
                        onClick={() => bumpCantidad(item.id, item.cantidad, 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={`${comboBtnDanger} px-2`}
                        aria-label={`Quitar ${item.plato.nombre}`}
                        onClick={() => removeItem(item.id)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {itemActionError ? <p className="text-xs text-danger">{itemActionError}</p> : null}
            {platosDisponibles.length > 0 ? (
              <div className="mt-3 rounded-lg border border-border bg-surface p-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Agregar plato</h5>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-text-secondary" htmlFor={`add-plato-${combo.id}`}>
                      Plato
                    </label>
                    <select
                      id={`add-plato-${combo.id}`}
                      value={addItemPlatoId}
                      onChange={(e) => {
                        setAddItemPlatoId(e.target.value);
                        setAddItemError(null);
                      }}
                      className={`mt-1 ${comboInputClass}`}
                    >
                      <option value="">Selecciona…</option>
                      {platosDisponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary" htmlFor={`add-cant-${combo.id}`}>
                      Cantidad
                    </label>
                    <input
                      id={`add-cant-${combo.id}`}
                      type="number"
                      min={1}
                      max={20}
                      value={addItemCantidad}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setAddItemCantidad(1);
                          setAddItemError(null);
                          return;
                        }
                        const n = Number(v);
                        if (!Number.isFinite(n)) return;
                        setAddItemCantidad(Math.min(20, Math.max(1, Math.round(n))));
                        setAddItemError(null);
                      }}
                      className={`mt-1 ${comboInputClass}`}
                    />
                  </div>
                </div>
                {addItemError ? <p className="mt-2 text-xs text-danger">{addItemError}</p> : null}
                <button
                  type="button"
                  className={`${comboBtnAccent} mt-3`}
                  onClick={submitAddItem}
                >
                  Agregar
                </button>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-surface-elevated/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Datos del combo</h4>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor={`edit-combo-nombre-${combo.id}`}>
                Nombre *
              </label>
              <input
                id={`edit-combo-nombre-${combo.id}`}
                type="text"
                value={editNombre}
                onChange={(e) => {
                  setEditNombre(e.target.value);
                  setEditComboError(null);
                }}
                maxLength={100}
                className={`mt-1 ${comboInputClass}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor={`edit-combo-precio-${combo.id}`}>
                Precio de venta *
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">$</span>
                <input
                  id={`edit-combo-precio-${combo.id}`}
                  inputMode="numeric"
                  type="text"
                  value={editPrecioFmt}
                  onChange={(e) => {
                    setEditPrecioDigits(e.target.value.replace(/[^\d]/g, ""));
                    setEditComboError(null);
                  }}
                  className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated py-2 pl-8 pr-3 text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor={`edit-combo-cat-${combo.id}`}>
                Categoría
              </label>
              <select
                id={`edit-combo-cat-${combo.id}`}
                value={editCategoriaId}
                onChange={(e) => {
                  setEditCategoriaId(e.target.value);
                  setEditComboError(null);
                }}
                className={`mt-1 ${comboInputClass}`}
              >
                <option value="">Sin categoría</option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent"
              />
              Activo
            </label>
            {editComboError ? <p className="text-xs text-danger">{editComboError}</p> : null}
            <button
              type="button"
              disabled={pending}
              className={comboBtnAccent}
              onClick={saveCombo}
            >
              Guardar cambios
            </button>
          </div>

          <div className="space-y-3 border-t border-danger/30 pt-4">
            {!deleteConfirm ? (
              <button
                type="button"
                className="w-full min-h-[44px] rounded-lg border border-danger bg-transparent px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-light"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteConfirm(true);
                }}
              >
                Eliminar combo
              </button>
            ) : (
              <div className="space-y-3 rounded-lg border border-danger/40 bg-danger-light/20 p-4">
                <p className="text-sm text-danger">
                  ¿Eliminar este combo y sus componentes? Esta acción no se puede deshacer.
                </p>
                {deleteError ? <p className="text-xs text-danger">{deleteError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-[44px] flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
                    disabled={pending}
                    onClick={confirmDelete}
                  >
                    Confirmar eliminación
                  </button>
                  <button
                    type="button"
                    className="min-h-[44px] flex-1 rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text-primary hover:bg-border"
                    onClick={() => {
                      setDeleteConfirm(false);
                      setDeleteError(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CartaTab({
  platos: platosRaw,
  categorias: categoriasRaw,
  insumos: insumosRaw,
  combos: combosInicial,
  initialDishId,
}: {
  platos: CartaPlatoRow[];
  categorias: CartaCategoriaRow[];
  insumos: Insumo[];
  combos: CombosConComponentesList;
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
  const combos = combosInicial;

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
  const [comboEditId, setComboEditId] = useState<string | null>(null);

  const menuSections = useMemo(() => buildMenuSections(platos, combos, categorias), [platos, combos, categorias]);

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
            <p className="mt-1 text-sm text-text-tertiary">Platos y combos agrupados por categoría.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateModalKey((k) => k + 1);
              setCreateOpen(true);
            }}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover"
          >
            Crear plato o combo
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
                  {sec.items.map((entry) => {
                    const isPlato = entry.tipoItem === "PLATO";
                    const isCombo = entry.tipoItem === "COMBO";
                    const dotClass =
                      entry.tipoItem === "PLATO" ? statusDot[cardStatus(entry.item)] : "bg-text-tertiary";
                    const clickablePlato = entry.tipoItem === "PLATO" && entry.item.tieneReceta;
                    const cardClickable = isCombo || clickablePlato;
                    return (
                      <div
                        key={entry.item.id}
                        id={isPlato ? `carta-plato-${entry.item.id}` : undefined}
                        role={cardClickable ? "button" : undefined}
                        tabIndex={cardClickable ? 0 : undefined}
                        title={
                          isCombo
                            ? "Ver componentes del combo"
                            : !clickablePlato && isPlato
                              ? "Este plato no requiere receta"
                              : undefined
                        }
                        onClick={() => {
                          if (isCombo) setComboEditId(entry.item.id);
                          else if (entry.tipoItem === "PLATO") handleCardClick(entry.item);
                        }}
                        onKeyDown={(e) => {
                          if (isCombo && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            setComboEditId(entry.item.id);
                            return;
                          }
                          if (!clickablePlato) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (entry.tipoItem === "PLATO") handleCardClick(entry.item);
                          }
                        }}
                        className={`relative rounded-xl border border-border bg-surface p-4 pt-10 shadow-sm transition-shadow ${
                          cardClickable ? "cursor-pointer hover:shadow-md" : "cursor-default hover:shadow-sm"
                        }`}
                      >
                        <span
                          className={`absolute left-3 top-3 h-2.5 w-2.5 rounded-full ${dotClass}`}
                          title={
                            entry.tipoItem === "PLATO"
                              ? cardStatus(entry.item) === "complete"
                                ? "Receta completa"
                                : cardStatus(entry.item) === "needsRecipe"
                                  ? "Falta completar la receta"
                                  : "Sin receta"
                              : undefined
                          }
                        />
                        <div className="absolute right-2 top-2 flex items-start gap-1">
                          <span
                            className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              entry.item.active ? "bg-accent-light text-accent" : "bg-surface-elevated text-text-tertiary"
                            }`}
                          >
                            {entry.item.active ? "Activo" : "Inactivo"}
                          </span>
                          {entry.tipoItem === "COMBO" ? (
                            <span className="mt-0.5 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">
                              Combo
                            </span>
                          ) : null}

                          {isPlato ? (
                            <>
                              <button
                                type="button"
                                className="rounded-md px-2 py-1 text-lg leading-none text-text-secondary hover:bg-surface-elevated"
                                aria-label="Más opciones"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (entry.tipoItem === "PLATO") setMenuId((prev) => (prev === entry.item.id ? null : entry.item.id));
                                }}
                              >
                                ⋯
                              </button>
                              {entry.tipoItem === "PLATO" && menuId === entry.item.id ? (
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
                                        setEditPlato(entry.item);
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
                                        setDeletePlato(entry.item);
                                      }}
                                    >
                                      Eliminar plato
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        <div className="pr-14">
                          <div className="text-sm font-semibold text-text-primary">{entry.item.nombre}</div>
                          <div className="mt-1 text-sm text-text-secondary">{formatPrecioCOP(entry.item.precioVenta)}</div>
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
        platos={platos}
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

      <ComboEditModal
        open={comboEditId !== null}
        onClose={() => setComboEditId(null)}
        combo={combos.find((c) => c.id === comboEditId) ?? null}
        platos={platos}
        categorias={categorias}
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
