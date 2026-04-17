import type { Unidad } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

export type InventarioHistorialRow = {
  id: string;
  fecha: Date;
  stockReal: Decimal;
  notas: string | null;
  insumo: { nombre: string; unidadBase: Unidad };
};

function fechaKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatFechaEncabezado(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function unitLabel(u: Unidad): string {
  return UNIT_OPTIONS.find((x) => x.value === u)?.label ?? u;
}

function formatStock(n: Decimal): string {
  const num = Number(n.toString());
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(num);
}

function groupByFecha(rows: InventarioHistorialRow[]): { fecha: Date; items: InventarioHistorialRow[] }[] {
  const map = new Map<string, InventarioHistorialRow[]>();
  for (const r of rows) {
    const k = fechaKeyUtc(r.fecha);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return keys.map((k) => {
    const items = map.get(k)!;
    const fecha = items[0]!.fecha;
    items.sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre, "es"));
    return { fecha, items };
  });
}

export function InventarioHistorial({ rows }: { rows: InventarioHistorialRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-tertiary">Aún no tienes conteos registrados.</p>;
  }

  const grupos = groupByFecha(rows);

  return (
    <div className="space-y-8">
      {grupos.map((g) => {
        const titulo = formatFechaEncabezado(g.fecha);
        const capitalized = titulo.charAt(0).toUpperCase() + titulo.slice(1);
        const n = g.items.length;
        return (
          <div key={fechaKeyUtc(g.fecha)}>
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              {capitalized} · {n} {n === 1 ? "insumo contado" : "insumos contados"}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/80">
                    <th className="px-3 py-2 font-medium text-text-secondary">Insumo</th>
                    <th className="px-3 py-2 font-medium text-text-secondary">Stock registrado</th>
                    <th className="px-3 py-2 font-medium text-text-secondary">Unidad</th>
                    <th className="px-3 py-2 font-medium text-text-secondary">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-text-primary">{row.insumo.nombre}</td>
                      <td className="px-3 py-2 tabular-nums text-text-primary">{formatStock(row.stockReal)}</td>
                      <td className="px-3 py-2 text-text-secondary">{unitLabel(row.insumo.unidadBase)}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-text-tertiary" title={row.notas ?? undefined}>
                        {row.notas ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
