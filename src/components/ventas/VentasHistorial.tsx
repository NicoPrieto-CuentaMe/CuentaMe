"use client";

import { Fragment, useState } from "react";
import type { Prisma } from "@prisma/client";

type Row = Prisma.VentaGetPayload<{
  include: {
    detalles: {
      include: {
        plato: { select: { nombre: true; precioVenta: true } };
      };
    };
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
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(x);
}

export function VentasHistorial({ rows }: { rows: Row[] }) {
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
    return <p className="text-sm text-text-tertiary">Aún no hay ventas registradas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="w-8 pb-2 pr-1" aria-hidden />
            <th className="pb-2 pr-3 font-semibold">Fecha</th>
            <th className="pb-2 pr-3 font-semibold">Hora</th>
            <th className="pb-2 pr-3 font-semibold">Tipo</th>
            <th className="pb-2 pr-3 font-semibold">Platos</th>
            <th className="pb-2 pr-3 font-semibold">Total</th>
            <th className="pb-2 font-semibold">Método pago</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-text-primary">
          {rows.map((v) => {
            const expanded = open.has(v.id);
            const nItems = v.detalles.reduce((s, d) => s + d.cantidad, 0);
            return (
              <Fragment key={v.id}>
                <tr className="align-top">
                  <td className="py-2 pr-1 align-middle">
                    <button
                      type="button"
                      onClick={() => toggle(v.id)}
                      className="rounded p-1 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                      aria-expanded={expanded}
                      aria-label={expanded ? "Ocultar detalle" : "Ver detalle"}
                    >
                      <span className="inline-block w-4 text-center text-xs">{expanded ? "▼" : "▶"}</span>
                    </button>
                  </td>
                  <td className="cursor-pointer py-2 pr-3 whitespace-nowrap align-middle" onClick={() => toggle(v.id)}>
                    {formatFecha(v.fecha)}
                  </td>
                  <td className="cursor-pointer py-2 pr-3 whitespace-nowrap align-middle" onClick={() => toggle(v.id)}>
                    {v.hora}
                  </td>
                  <td className="max-w-[200px] cursor-pointer py-2 pr-3 align-middle text-text-secondary" onClick={() => toggle(v.id)}>
                    {v.tipo}
                  </td>
                  <td className="cursor-pointer py-2 pr-3 align-middle tabular-nums" onClick={() => toggle(v.id)}>
                    {nItems} items
                  </td>
                  <td className="cursor-pointer py-2 pr-3 align-middle font-medium whitespace-nowrap" onClick={() => toggle(v.id)}>
                    {formatCop(v.total)}
                  </td>
                  <td className="max-w-[160px] cursor-pointer py-2 break-words align-middle text-text-secondary" onClick={() => toggle(v.id)}>
                    {v.metodoPago}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-surface-elevated/40">
                    <td />
                    <td className="pb-3 pt-0 pr-3" colSpan={6}>
                      <div className="rounded-lg border border-border/80 p-3">
                        <table className="w-full min-w-[480px] text-sm">
                          <thead>
                            <tr className="border-b border-border text-xs text-text-secondary">
                              <th className="pb-2 pr-2 text-left font-medium">Plato</th>
                              <th className="pb-2 pr-2 text-left font-medium">Cantidad</th>
                              <th className="pb-2 pr-2 text-left font-medium">Precio unit.</th>
                              <th className="pb-2 text-left font-medium">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="text-text-primary">
                            {v.detalles.map((d) => {
                              const sub = Number(d.precioUnitario) * d.cantidad;
                              return (
                                <tr key={d.id} className="border-b border-border/60 last:border-0">
                                  <td className="py-2 pr-2 align-top">{d.plato.nombre}</td>
                                  <td className="py-2 pr-2 tabular-nums">{d.cantidad}</td>
                                  <td className="py-2 pr-2 whitespace-nowrap">{formatCop(d.precioUnitario)}</td>
                                  <td className="py-2 font-medium whitespace-nowrap">{formatCop(sub)}</td>
                                </tr>
                              );
                            })}
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
