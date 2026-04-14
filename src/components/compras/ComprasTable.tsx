import type { Prisma } from "@prisma/client";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

type Row = Prisma.CompraGetPayload<{
  include: { proveedor: { select: { nombre: true } }; insumo: { select: { nombre: true } } };
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
  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no hay compras registradas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="pb-2 pr-3 font-semibold">Fecha</th>
            <th className="pb-2 pr-3 font-semibold">Proveedor</th>
            <th className="pb-2 pr-3 font-semibold">Insumo</th>
            <th className="pb-2 pr-3 font-semibold">Cantidad</th>
            <th className="pb-2 pr-3 font-semibold">Precio unitario</th>
            <th className="pb-2 pr-3 font-semibold">Total</th>
            <th className="pb-2 font-semibold">Notas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-text-primary">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="py-2 pr-3 whitespace-nowrap">{formatFecha(r.fecha)}</td>
              <td className="py-2 pr-3">{r.proveedor.nombre}</td>
              <td className="py-2 pr-3">{r.insumo.nombre}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {formatCantidad(r.cantidad)} {unidadLabel(r.unidad)}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatCop(r.precioUnitario)}</td>
              <td className="py-2 pr-3 whitespace-nowrap font-medium">{formatCop(r.total)}</td>
              <td className="py-2 max-w-[200px] break-words text-text-secondary">{r.notas ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
