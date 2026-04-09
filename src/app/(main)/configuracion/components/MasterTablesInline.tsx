"use client";

import type { Insumo, Plato, Proveedor } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { insumoCategorias, platoCategorias, proveedorCategorias } from "../categories";
import { digitsToSalePriceString, formatCopFromDigits, precioVentaToDigits } from "../cop-price";
import {
  deleteDish,
  deleteSupplier,
  deleteSupply,
  updateInsumo,
  updatePlato,
  updateProveedor,
} from "../actions";
import { UNIT_OPTIONS } from "../units";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

const inlineField =
  "w-full min-w-0 rounded border border-[var(--border)]/50 bg-white/90 px-1.5 py-1 text-sm text-[var(--foreground)] outline-none focus:border-accent";

const btnSave =
  "rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60";
const btnCancel =
  "rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-gray-50";
const btnEdit =
  "rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--foreground)]/80 hover:bg-gray-50";

const unitLabel = new Map(UNIT_OPTIONS.map((u) => [u.value, u.label] as const));

type ProveedorRow = Pick<Proveedor, "id" | "nombre" | "telefono" | "categoria">;
type InsumoRow = Pick<Insumo, "id" | "nombre" | "unidadBase" | "categoria">;
type PlatoRow = Pick<Plato, "id" | "nombre" | "categoria" | "precioVenta" | "active">;

export function ProveedoresTable({ rows }: { rows: ProveedorRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ nombre: string; telefono: string; categoria: string } | null>(null);

  const beginEdit = useCallback((r: ProveedorRow) => {
    setEditingId(r.id);
    setError(null);
    setDraft({
      nombre: r.nombre,
      telefono: r.telefono ?? "",
      categoria: r.categoria ?? "",
    });
  }, []);

  const cancel = useCallback(() => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!editingId || !draft) return;
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("nombre", draft.nombre);
    fd.set("telefono", draft.telefono);
    fd.set("categoria", draft.categoria);
    startTransition(async () => {
      const res = await updateProveedor(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
      setDraft(null);
      setError(null);
      router.refresh();
    });
  }, [draft, editingId, router]);

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[var(--foreground)]/70">
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Nombre</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Teléfono</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Categoría</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const isEdit = editingId === s.id;
              return (
                <tr key={s.id} className="text-[var(--foreground)]/90">
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <input
                        className={inlineField}
                        value={draft.nombre}
                        onChange={(e) => setDraft((d) => (d ? { ...d, nombre: e.target.value } : d))}
                      />
                    ) : (
                      s.nombre
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <input
                        className={inlineField}
                        value={draft.telefono}
                        onChange={(e) => setDraft((d) => (d ? { ...d, telefono: e.target.value } : d))}
                      />
                    ) : (
                      (s.telefono ?? "—")
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <select
                        className={inlineField}
                        value={draft.categoria}
                        onChange={(e) => setDraft((d) => (d ? { ...d, categoria: e.target.value } : d))}
                      >
                        <option value="">Selecciona...</option>
                        {proveedorCategorias.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (s.categoria ?? "—")
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className={btnSave} disabled={pending} onClick={() => void save()}>
                          Guardar
                        </button>
                        <button type="button" className={btnCancel} disabled={pending} onClick={cancel}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className={btnEdit} onClick={() => beginEdit(s)}>
                          Editar
                        </button>
                        <form action={deleteSupplier} className="inline">
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmSubmitButton
                            confirmMessage="¿Eliminar este proveedor? Esta acción no se puede deshacer."
                            className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </ConfirmSubmitButton>
                        </form>
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
}

export function InsumosTable({ rows }: { rows: InsumoRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    nombre: string;
    baseUnit: string;
    categoria: string;
  } | null>(null);

  const beginEdit = useCallback((r: InsumoRow) => {
    setEditingId(r.id);
    setError(null);
    setDraft({
      nombre: r.nombre,
      baseUnit: r.unidadBase,
      categoria: r.categoria ?? "",
    });
  }, []);

  const cancel = useCallback(() => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!editingId || !draft) return;
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("nombre", draft.nombre);
    fd.set("baseUnit", draft.baseUnit);
    fd.set("categoria", draft.categoria);
    startTransition(async () => {
      const res = await updateInsumo(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
      setDraft(null);
      setError(null);
      router.refresh();
    });
  }, [draft, editingId, router]);

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[var(--foreground)]/70">
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Nombre</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Unidad base</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Categoría</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const isEdit = editingId === s.id;
              return (
                <tr key={s.id} className="text-[var(--foreground)]/90">
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <input
                        className={inlineField}
                        value={draft.nombre}
                        onChange={(e) => setDraft((d) => (d ? { ...d, nombre: e.target.value } : d))}
                      />
                    ) : (
                      s.nombre
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <select
                        className={inlineField}
                        value={draft.baseUnit}
                        onChange={(e) => setDraft((d) => (d ? { ...d, baseUnit: e.target.value } : d))}
                      >
                        <option value="" disabled>
                          Selecciona...
                        </option>
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (unitLabel.get(s.unidadBase) ?? s.unidadBase)
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <select
                        className={inlineField}
                        value={draft.categoria}
                        onChange={(e) => setDraft((d) => (d ? { ...d, categoria: e.target.value } : d))}
                      >
                        <option value="">Selecciona...</option>
                        {insumoCategorias.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (s.categoria ?? "—")
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className={btnSave} disabled={pending} onClick={() => void save()}>
                          Guardar
                        </button>
                        <button type="button" className={btnCancel} disabled={pending} onClick={cancel}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className={btnEdit} onClick={() => beginEdit(s)}>
                          Editar
                        </button>
                        <form action={deleteSupply} className="inline">
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmSubmitButton
                            confirmMessage="¿Eliminar este insumo? Si está en recetas, puede fallar."
                            className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </ConfirmSubmitButton>
                        </form>
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
}

function PlatoPrecioInline({
  precioDigits,
  onDigitsChange,
}: {
  precioDigits: string;
  onDigitsChange: (digits: string) => void;
}) {
  const display = useMemo(() => formatCopFromDigits(precioDigits), [precioDigits]);
  return (
    <input
      inputMode="numeric"
      className={inlineField}
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onDigitsChange(digits);
      }}
    />
  );
}

export function PlatosTable({ rows }: { rows: PlatoRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    nombre: string;
    categoria: string;
    precioDigits: string;
    active: boolean;
  } | null>(null);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }),
    [],
  );

  const beginEdit = useCallback((r: PlatoRow) => {
    setEditingId(r.id);
    setError(null);
    setDraft({
      nombre: r.nombre,
      categoria: r.categoria ?? "",
      precioDigits: precioVentaToDigits(r.precioVenta),
      active: r.active,
    });
  }, []);

  const cancel = useCallback(() => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!editingId || !draft) return;
    const salePrice = digitsToSalePriceString(draft.precioDigits);
    if (!salePrice) {
      setError("El precio de venta debe ser mayor a 0.");
      return;
    }
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("nombre", draft.nombre);
    fd.set("categoria", draft.categoria);
    fd.set("salePrice", salePrice);
    fd.set("active", draft.active ? "true" : "false");
    startTransition(async () => {
      const res = await updatePlato(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingId(null);
      setDraft(null);
      setError(null);
      router.refresh();
    });
  }, [draft, editingId, router]);

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[var(--foreground)]/70">
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Nombre</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Categoría</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Precio</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Activo</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const isEdit = editingId === d.id;
              return (
                <tr key={d.id} className="text-[var(--foreground)]/90">
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <input
                        className={inlineField}
                        value={draft.nombre}
                        onChange={(e) => setDraft((x) => (x ? { ...x, nombre: e.target.value } : x))}
                      />
                    ) : (
                      d.nombre
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <select
                        className={inlineField}
                        value={draft.categoria}
                        onChange={(e) => setDraft((x) => (x ? { ...x, categoria: e.target.value } : x))}
                      >
                        <option value="">Selecciona...</option>
                        {platoCategorias.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (d.categoria ?? "—")
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <PlatoPrecioInline
                        precioDigits={draft.precioDigits}
                        onDigitsChange={(digits) => setDraft((x) => (x ? { ...x, precioDigits: digits } : x))}
                      />
                    ) : (
                      money.format(Number(d.precioVenta))
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit && draft ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                          checked={draft.active}
                          onChange={(e) => setDraft((x) => (x ? { ...x, active: e.target.checked } : x))}
                        />
                        <span>{draft.active ? "Activo" : "Inactivo"}</span>
                      </label>
                    ) : d.active ? (
                      <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-[var(--foreground)]/70">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 align-middle">
                    {isEdit ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className={btnSave} disabled={pending} onClick={() => void save()}>
                          Guardar
                        </button>
                        <button type="button" className={btnCancel} disabled={pending} onClick={cancel}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" className={btnEdit} onClick={() => beginEdit(d)}>
                          Editar
                        </button>
                        <form action={deleteDish} className="inline">
                          <input type="hidden" name="id" value={d.id} />
                          <ConfirmSubmitButton
                            confirmMessage="¿Eliminar este plato? Si tiene receta, puede fallar."
                            className="rounded border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </ConfirmSubmitButton>
                        </form>
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
}
