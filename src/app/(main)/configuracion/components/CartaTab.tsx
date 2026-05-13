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
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ font: "510 13px/1.2 Inter,sans-serif", color: "#d0d6e0", letterSpacing: "-0.1px" }}>
        {title}
      </span>
      <span
        style={{
          font: "510 11px/1 Inter,sans-serif",
          color: "#8a8f98",
          background: "rgba(255,255,255,0.04)",
          padding: "3px 7px",
          borderRadius: 999,
        }}
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
  const [addPlatoOpen, setAddPlatoOpen] = useState(false);

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
    setAddPlatoOpen(false);
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
      setAddPlatoOpen(false);
    }
  }, [stateCombo.ok, stateCombo.message, onClose, router]);

  const precioComboNumerico = useMemo(() => digitsToSalePriceString(precioComboDisplay), [precioComboDisplay]);
  const precioComboFormateado = useMemo(() => formatCopFromDigits(precioComboDisplay), [precioComboDisplay]);

  const platosParaCombo = useMemo(
    () =>
      platos
        .filter((p) => p.tipo === TipoPlato.PLATO)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [platos],
  );

  useEffect(() => {
    if (tipoCrear === "PLATO") setAddPlatoOpen(false);
  }, [tipoCrear]);

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

            <div className="space-y-3 border-t border-border pt-4">
              <h4 className="text-sm font-semibold text-text-primary">Platos del combo</h4>
              {componentesLocal.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {componentesLocal.map((c, i) => (
                    <div key={c.platoId}>
                      <input type="hidden" name={`componentePlatoId_${i}`} value={c.platoId} />
                      <input type="hidden" name={`componenteCantidad_${i}`} value={c.cantidad} />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 8,
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            font: "510 13px/1.3 Inter,sans-serif",
                            color: "#f7f8f8",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.nombre}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 7,
                            padding: 2,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setComponentesLocal((prev) =>
                                prev.map((x) =>
                                  x.platoId === c.platoId ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x,
                                ),
                              )
                            }
                            style={{
                              width: 28,
                              height: 28,
                              border: "none",
                              background: "transparent",
                              color: "#d0d6e0",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 5,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                              <path d="M5 12h14" />
                            </svg>
                          </button>
                          <span
                            style={{
                              minWidth: 22,
                              textAlign: "center",
                              font: "590 13px/1 Inter,sans-serif",
                              color: "#f7f8f8",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {c.cantidad}
                          </span>
                          <button
                            type="button"
                            disabled={c.cantidad >= 20}
                            onClick={() =>
                              setComponentesLocal((prev) =>
                                prev.map((x) =>
                                  x.platoId === c.platoId ? { ...x, cantidad: Math.min(20, x.cantidad + 1) } : x,
                                ),
                              )
                            }
                            style={{
                              width: 28,
                              height: 28,
                              border: "none",
                              background: "transparent",
                              color: c.cantidad >= 20 ? "#4a4d54" : "#d0d6e0",
                              cursor: c.cantidad >= 20 ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 5,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setComponentesLocal((prev) => prev.filter((x) => x.platoId !== c.platoId))}
                          style={{
                            width: 24,
                            height: 24,
                            border: "none",
                            background: "rgba(224,82,82,0.14)",
                            borderRadius: 6,
                            color: "#ff8585",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <label
                    style={{
                      font: "510 12px/1 Inter,sans-serif",
                      color: "#8a8f98",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Agregar plato
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddPlatoOpen((o) => !o)}
                    style={{
                      width: "100%",
                      height: 38,
                      padding: "0 10px",
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8,
                      color: addPlatoId ? "#f7f8f8" : "#62666d",
                      font: "510 13px/1 Inter,sans-serif",
                      outline: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                    }}
                  >
                    <span>
                      {addPlatoId
                        ? (platosParaCombo.find((p) => p.id === addPlatoId)?.nombre ?? "Selecciona un plato…")
                        : "Selecciona un plato…"}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      style={{ flexShrink: 0, color: "#8a8f98" }}
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {addPlatoOpen && (
                    <>
                      <div onClick={() => setAddPlatoOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          zIndex: 50,
                          background: "#191a1b",
                          border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 8,
                          padding: 4,
                          maxHeight: 220,
                          overflowY: "auto",
                          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        {platosParaCombo.map((p) => {
                          const yaAgregado = componentesLocal.some((c) => c.platoId === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setAddPlatoId(p.id);
                                setAddPlatoOpen(false);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                height: 34,
                                padding: "0 10px",
                                background: addPlatoId === p.id ? "rgba(113,112,255,0.12)" : "transparent",
                                border: "none",
                                borderRadius: 6,
                                color: addPlatoId === p.id ? "#a4adff" : "#d0d6e0",
                                font: "510 13px/1 Inter,sans-serif",
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                              onMouseEnter={(e) => {
                                if (addPlatoId !== p.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                              }}
                              onMouseLeave={(e) => {
                                if (addPlatoId !== p.id) e.currentTarget.style.background = "transparent";
                              }}
                            >
                              <span>{p.nombre}</span>
                              {yaAgregado && (
                                <span style={{ font: "510 10px/1 Inter,sans-serif", color: "#62666d", letterSpacing: "0.3px" }}>
                                  en combo
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!addPlatoId}
                  onClick={() => {
                    if (!addPlatoId) return;
                    const p = platos.find((x) => x.id === addPlatoId);
                    if (!p) return;
                    setComponentesLocal((prev) => {
                      const existing = prev.find((x) => x.platoId === p.id);
                      if (existing) {
                        return prev.map((x) =>
                          x.platoId === p.id ? { ...x, cantidad: Math.min(20, x.cantidad + 1) } : x,
                        );
                      }
                      return [...prev, { platoId: p.id, nombre: p.nombre, cantidad: 1 }];
                    });
                    setAddPlatoId("");
                  }}
                  style={{
                    height: 38,
                    padding: "0 16px",
                    background: addPlatoId ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.04)",
                    border: "1px solid",
                    borderColor: addPlatoId ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: addPlatoId ? "#a4adff" : "#62666d",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: addPlatoId ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                    transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                    flexShrink: 0,
                  }}
                >
                  + Agregar
                </button>
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

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCat = (key: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [pendingCatDelete, startCatDeleteTransition] = useTransition();
  const [renamePending, startRenameTransition] = useTransition();
  const [inlineOpen, setInlineOpen] = useState(false);
  const [stateCategoria, formActionCategoria] = useFormState(createCategoria, formIdleState);
  const [deleteTarget, setDeleteTarget] = useState<CartaCategoriaRow | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

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

  useEffect(() => {
    if (stateCategoria.ok && stateCategoria.message) {
      router.refresh();
      setInlineOpen(false);
    }
  }, [stateCategoria.ok, stateCategoria.message, router]);

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

  const startRename = useCallback((c: CartaCategoriaRow) => {
    setRenameId(c.id);
    setRenameDraft(c.nombre);
    setRenameError(null);
  }, []);

  const handleDeleteCategoria = useCallback((id: string) => {
    const c = categorias.find((x) => x.id === id);
    if (c) setDeleteTarget(c);
  }, [categorias]);

  const handleAddCategoria = useCallback(() => setInlineOpen(true), []);

  const confirmDeleteCategoria = useCallback(() => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startCatDeleteTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteCategoria(formIdleState, fd);
      if (res.ok) {
        setDeleteTarget(null);
        router.refresh();
      }
    });
  }, [deleteTarget, router]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {platosNecesitanReceta.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 16px",
            background: "rgba(217,119,6,0.10)",
            border: "1px solid rgba(217,119,6,0.25)",
            borderRadius: 10,
          }}
          role="status"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d97706"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ flexShrink: 0, marginTop: 1 }}
            aria-hidden
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p style={{ font: "400 13px/1.5 Inter,sans-serif", color: "#f4b35e", margin: 0 }}>
            {platosNecesitanReceta.length === 1 ? "1 plato necesita receta: " : `${platosNecesitanReceta.length} platos necesitan receta: `}
            {platosNecesitanReceta.slice(0, 3).map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  style={{
                    fontWeight: 600,
                    color: "#f87171",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    font: "inherit",
                  }}
                  onClick={() => handleAlertPlatoClick(p)}
                >
                  {p.nombre}
                  {p.categoria?.nombre ? ` · ${p.categoria.nombre}` : ""}
                </button>
              </span>
            ))}
            {platosNecesitanReceta.length > 3 && (
              <span style={{ color: "#8a8f98" }}> +{platosNecesitanReceta.length - 3} más</span>
            )}
          </p>
        </div>
      )}

      {platosConInconsistenciaUnidades.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 16px",
            background: "rgba(224,82,82,0.10)",
            border: "1px solid rgba(224,82,82,0.25)",
            borderRadius: 10,
          }}
          role="status"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e05252"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ flexShrink: 0, marginTop: 1 }}
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p style={{ font: "400 13px/1.5 Inter,sans-serif", color: "#fca5a5", margin: 0 }}>
            {platosConInconsistenciaUnidades.length === 1
              ? "1 plato tiene inconsistencias de unidades: "
              : `${platosConInconsistenciaUnidades.length} platos tienen inconsistencias de unidades: `}
            {platosConInconsistenciaUnidades.slice(0, 3).map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  style={{
                    fontWeight: 600,
                    color: "#f87171",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    font: "inherit",
                  }}
                  onClick={() => handleAlertPlatoClick(p)}
                >
                  {p.nombre}
                </button>
              </span>
            ))}
            {platosConInconsistenciaUnidades.length > 3 && (
              <span style={{ color: "#8a8f98" }}> +{platosConInconsistenciaUnidades.length - 3} más</span>
            )}
          </p>
        </div>
      )}

      <section
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          padding: "18px 22px 20px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <h2 style={{ font: "510 16px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.2px", margin: 0 }}>
            Categorías del menú
          </h2>
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              padding: "6px 10px",
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 999,
              alignSelf: "flex-start",
            }}
          >
            {[
              { color: "#7170ff", label: "Receta completa" },
              { color: "#e0a062", label: "Receta pendiente" },
              { color: "rgba(255,255,255,0.18)", label: "No requiere receta" },
            ].map((l) => (
              <span
                key={l.label}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 11px/1 Inter,sans-serif", color: "#8a8f98" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                {l.label}
              </span>
            ))}
          </div>
          <p style={{ font: "400 12px/1.4 Inter,sans-serif", color: "#62666d", margin: 0 }}>
            Crea y ordena bloques para tu carta. Los platos pueden quedar sin categoría.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {categorias.map((c) => (
            <div key={c.id} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
                {renameId === c.id ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 32,
                      padding: "0 8px",
                      background: "rgba(94,106,210,0.12)",
                      border: "1px solid rgba(113,112,255,0.4)",
                      borderRadius: 999,
                    }}
                  >
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
                          void commitRename(c);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setRenameDraft(c.nombre);
                          cancelRename();
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "#f7f8f8",
                        font: "510 13px/1 Inter,sans-serif",
                        width: 120,
                        padding: "0 4px",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 32,
                      padding: "0 6px 0 14px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 999,
                      cursor: "pointer",
                    }}
                    onClick={() => startRename(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        startRename(c);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span style={{ font: "510 13px/1 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.1px" }}>{c.nombre}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategoria(c.id);
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.06)",
                        border: "none",
                        color: "#8a8f98",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      aria-label="Eliminar"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              {renameError && renameId === c.id ? (
                <p style={{ maxWidth: 220, paddingLeft: 4, fontSize: 12, color: "#f87171", margin: 0 }}>{renameError}</p>
              ) : null}
            </div>
          ))}
          {!inlineOpen ? (
            <button
              type="button"
              onClick={handleAddCategoria}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 32,
                padding: "0 14px",
                background: "transparent",
                border: "1px dashed rgba(113,112,255,0.32)",
                borderRadius: 999,
                color: "#a4adff",
                font: "510 13px/1 Inter,sans-serif",
                cursor: "pointer",
                transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva categoría
            </button>
          ) : (
            <form action={formActionCategoria} className="flex flex-wrap items-center gap-2">
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
              <Feedback state={stateCategoria} />
            </form>
          )}
        </div>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-text-primary">Eliminar categoría</h3>
            {deleteTarget._count.platos > 0 ? (
              <p className="mt-2 text-sm text-text-secondary">
                Esta categoría tiene {deleteTarget._count.platos}{" "}
                {deleteTarget._count.platos === 1 ? "plato" : "platos"}. Al eliminarla, dejará de mostrarse en la carta;
                los platos conservan el vínculo para informes e historial.
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
                disabled={pendingCatDelete}
                onClick={confirmDeleteCategoria}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {pendingCatDelete ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          padding: "18px 22px 22px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ font: "510 16px/1.2 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.2px", margin: 0 }}>Menú</h2>
            <p style={{ font: "400 12px/1.4 Inter,sans-serif", color: "#62666d", margin: "4px 0 0" }}>
              Platos y combos agrupados por categoría.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateModalKey((k) => k + 1);
              setCreateOpen(true);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              padding: "0 16px",
              background: "linear-gradient(180deg,#6b78de,#5e6ad2)",
              border: "1px solid rgba(113,112,255,0.5)",
              borderRadius: 10,
              color: "#fff",
              font: "590 13px/1 Inter,sans-serif",
              cursor: "pointer",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 14px rgba(94,106,210,0.32)",
              flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Crear plato o combo
          </button>
        </div>

        {menuSections.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {menuSections.map((sec) => {
              const isOpen = expandedCats.has(sec.key);
              return (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => toggleCat(sec.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 13px",
                    background: isOpen ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.03)",
                    border: "1px solid",
                    borderColor: isOpen ? "rgba(113,112,255,0.45)" : "rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    color: isOpen ? "#fff" : "#d0d6e0",
                    font: "510 13px/1 Inter,sans-serif",
                    cursor: "pointer",
                    transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                    boxShadow: isOpen ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  {isOpen && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                  <span>{sec.titulo}</span>
                  <span
                    style={{
                      font: "510 11px/1 Inter,sans-serif",
                      color: isOpen ? "rgba(255,255,255,0.7)" : "#62666d",
                      background: isOpen ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                      padding: "2px 6px",
                      borderRadius: 999,
                      minWidth: 18,
                      textAlign: "center",
                    }}
                  >
                    {sec.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {platos.length === 0 ? (
          <p style={{ font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>Aún no tienes platos en tu carta. Crea el primero.</p>
        ) : menuSections.length === 0 ? (
          <p style={{ font: "400 13px/1.4 Inter,sans-serif", color: "#62666d" }}>No hay platos para mostrar en las categorías.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {menuSections.map((sec) => {
              const isOpen = expandedCats.has(sec.key);
              if (!isOpen) return null;
              return (
                <div key={sec.key}>
                  <CartaGroupHeading title={sec.titulo} count={sec.count} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                    {sec.items.map((entry) => {
                      const isCombo = entry.tipoItem === "COMBO";
                      const isPlato = entry.tipoItem === "PLATO";
                      const dotColor = isCombo
                        ? "rgba(255,255,255,0.18)"
                        : cardStatus(entry.item) === "complete"
                          ? "#7170ff"
                          : cardStatus(entry.item) === "needsRecipe"
                            ? "#e0a062"
                            : "rgba(255,255,255,0.18)";
                      const cardClickable = isCombo || (isPlato && entry.item.tieneReceta);

                      return (
                        <div
                          key={entry.item.id}
                          id={isPlato ? `carta-plato-${entry.item.id}` : undefined}
                          role={cardClickable ? "button" : undefined}
                          tabIndex={cardClickable ? 0 : undefined}
                          title={
                            isCombo
                              ? "Ver componentes del combo"
                              : isPlato && !entry.item.tieneReceta
                                ? "Este plato no requiere receta"
                                : undefined
                          }
                          onClick={() => {
                            if (isCombo) setComboEditId(entry.item.id);
                            else if (isPlato) handleCardClick(entry.item);
                          }}
                          onKeyDown={(e) => {
                            if (!cardClickable) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (isCombo) setComboEditId(entry.item.id);
                              else if (isPlato) handleCardClick(entry.item);
                            }
                          }}
                          style={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            minHeight: 88,
                            padding: "12px 14px",
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: 10,
                            cursor: cardClickable ? "pointer" : "default",
                            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
                          }}
                          onMouseEnter={(e) => {
                            if (cardClickable) {
                              e.currentTarget.style.background = "rgba(255,255,255,0.045)";
                              e.currentTarget.style.borderColor = "rgba(113,112,255,0.25)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.025)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: dotColor,
                                flexShrink: 0,
                                boxShadow: "0 0 0 3px rgba(0,0,0,0.18)",
                              }}
                              title={
                                isPlato
                                  ? cardStatus(entry.item) === "complete"
                                    ? "Receta completa"
                                    : cardStatus(entry.item) === "needsRecipe"
                                      ? "Falta completar la receta"
                                      : "Sin receta"
                                  : undefined
                              }
                            />
                            <div style={{ flex: 1 }} />
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                height: 20,
                                padding: "0 8px",
                                background: entry.item.active ? "rgba(113,112,255,0.16)" : "rgba(255,255,255,0.05)",
                                border: `1px solid ${entry.item.active ? "rgba(113,112,255,0.30)" : "rgba(255,255,255,0.08)"}`,
                                borderRadius: 999,
                                font: "590 9px/1 Inter,sans-serif",
                                letterSpacing: "0.6px",
                                textTransform: "uppercase",
                                color: entry.item.active ? "#a4adff" : "#62666d",
                              }}
                            >
                              {entry.item.active ? "Activo" : "Inactivo"}
                            </span>
                            {isCombo && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  height: 20,
                                  padding: "0 8px",
                                  background: "rgba(224,160,98,0.14)",
                                  border: "1px solid rgba(224,160,98,0.30)",
                                  borderRadius: 999,
                                  font: "590 9px/1 Inter,sans-serif",
                                  letterSpacing: "0.6px",
                                  textTransform: "uppercase",
                                  color: "#e0a062",
                                }}
                              >
                                Combo
                              </span>
                            )}
                            {isPlato && (
                              <div style={{ position: "relative" }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuId(menuId === entry.item.id ? null : entry.item.id);
                                  }}
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 5,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "transparent",
                                    border: "none",
                                    color: "#62666d",
                                    cursor: "pointer",
                                  }}
                                  aria-label="Más opciones"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <circle cx="12" cy="5" r="1" />
                                    <circle cx="12" cy="12" r="1" />
                                    <circle cx="12" cy="19" r="1" />
                                  </svg>
                                </button>
                                {menuId === entry.item.id && (
                                  <>
                                    <div onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "calc(100% + 4px)",
                                        right: 0,
                                        zIndex: 50,
                                        minWidth: 160,
                                        background: "#191a1b",
                                        border: "1px solid rgba(255,255,255,0.10)",
                                        borderRadius: 8,
                                        padding: 4,
                                        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 2,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditPlato(entry.item as CartaPlatoRow);
                                          setEditModalKey((k) => k + 1);
                                          setMenuId(null);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 8,
                                          height: 32,
                                          padding: "0 10px",
                                          background: "transparent",
                                          border: "none",
                                          borderRadius: 6,
                                          color: "#d0d6e0",
                                          font: "510 13px/1 Inter,sans-serif",
                                          cursor: "pointer",
                                          textAlign: "left",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = "transparent";
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                        Editar plato
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeletePlato(entry.item as CartaPlatoRow);
                                          setMenuId(null);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 8,
                                          height: 32,
                                          padding: "0 10px",
                                          background: "transparent",
                                          border: "none",
                                          borderRadius: 6,
                                          color: "#ff8585",
                                          font: "510 13px/1 Inter,sans-serif",
                                          cursor: "pointer",
                                          textAlign: "left",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = "rgba(224,82,82,0.08)";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = "transparent";
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                          <path d="M10 11v6M14 11v6" />
                                        </svg>
                                        Eliminar plato
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 14, textAlign: "left" }}>
                            <span style={{ font: "590 14px/1.3 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.15px" }}>
                              {entry.item.nombre}
                            </span>
                            <span style={{ font: "510 13px/1.3 Inter,sans-serif", color: "#8a8f98", fontVariantNumeric: "tabular-nums" }}>
                              {formatPrecioCOP(entry.item.precioVenta)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
