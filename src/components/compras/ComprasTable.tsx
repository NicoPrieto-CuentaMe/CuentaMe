"use client";

import { Fragment, useState } from "react";
import type { Prisma } from "@prisma/client";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

type Row = Prisma.CompraGetPayload<{
  include: {
    proveedor: { select: { nombre: true } };
    detalles: { include: { insumo: { select: { nombre: true } } } };
  };
}>;

function formatFecha(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const y = d.getUTCFullYear();
  return `${day}/${m}/${y}`;
}

function formatCop(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(x);
}

function formatCantidad(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(x);
}

function unidadLabel(u: string): string {
  return UNIT_OPTIONS.find((o) => o.value === u)?.label ?? u;
}

export function ComprasTable({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no hay compras registradas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="w-8 pb-2 pr-1" aria-hidden />
            <th className="pb-2 pr-3 font-semibold">Fecha</th>
            <th className="pb-2 pr-3 font-semibold">Proveedor</th>
            <th className="pb-2 pr-3 font-semibold">Items</th>
            <th className="pb-2 pr-3 font-semibold">Total</th>
            <th className="pb-2 font-semibold">Notas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-text-primary">
          {rows.map((c) => {
            const expanded = open.has(c.id);
            const nItems = c.detalles.length;
            return (
              <Fragment key={c.id}>
                <tr className="align-top">
                  <td className="py-2 pr-1 align-middle">
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="rounded p-1 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                      aria-expanded={expanded}
                      aria-label={expanded ? "Ocultar detalle" : "Ver detalle"}
                    >
                      <span className="inline-block w-4 text-center text-xs">{expanded ? "▼" : "▶"}</span>
                    </button>
                  </td>
                  <td className="cursor-pointer py-2 pr-3 whitespace-nowrap align-middle" onClick={() => toggle(c.id)}>
                    {formatFecha(c.fecha)}
                  </td>
                  <td className="cursor-pointer py-2 pr-3 align-middle" onClick={() => toggle(c.id)}>
                    {c.proveedor.nombre}
                  </td>
                  <td className="cursor-pointer py-2 pr-3 align-middle tabular-nums" onClick={() => toggle(c.id)}>
                    {nItems}
                  </td>
                  <td className="cursor-pointer py-2 pr-3 align-middle font-medium whitespace-nowrap" onClick={() => toggle(c.id)}>
                    {formatCop(c.total)}
                  </td>
                  <td className="max-w-[220px] cursor-pointer py-2 break-words text-text-secondary align-middle" onClick={() => toggle(c.id)}>
                    {c.notas?.trim() ? c.notas : "—"}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-surface-elevated/40">
                    <td />
                    <td className="pb-3 pt-0 pr-3" colSpan={5}>
                      <div className="rounded-lg border border-border/80 p-3">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead>
                            <tr className="border-b border-border text-xs text-text-secondary">
                              <th className="pb-2 pr-2 text-left font-medium">Insumo</th>
                              <th className="pb-2 pr-2 text-left font-medium">Cantidad</th>
                              <th className="pb-2 pr-2 text-left font-medium">Precio unitario</th>
                              <th className="pb-2 text-left font-medium">Total línea</th>
                            </tr>
                          </thead>
                          <tbody className="text-text-primary">
                            {c.detalles.map((d) => (
                              <tr key={d.id} className="border-b border-border/60 last:border-0">
                                <td className="py-2 pr-2 align-top">{d.insumo.nombre}</td>
                                <td className="py-2 pr-2 whitespace-nowrap">
                                  {formatCantidad(d.cantidad)} {unidadLabel(d.unidad)}
                                </td>
                                <td className="py-2 pr-2 whitespace-nowrap">{formatCop(d.precioUnitario)}</td>
                                <td className="py-2 font-medium whitespace-nowrap">{formatCop(d.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
