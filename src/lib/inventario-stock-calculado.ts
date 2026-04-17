import type { Unidad } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { sonUnidadesCompatibles } from "@/lib/unidades.config";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

export type StockCalculadoInfo =
  | { status: "sin-base" }
  | { status: "ok"; valor: number; unidadLabel: string; unidadesMixtas: boolean };

type InsumoLite = { id: string; unidadBase: Unidad };

function unitLabel(u: Unidad): string {
  return UNIT_OPTIONS.find((x) => x.value === u)?.label ?? u;
}

function decToNumber(d: Prisma.Decimal): number {
  return Number(d.toString());
}

/** Último inventario por insumo: recorrer filas ordenadas por fecha desc y tomar la primera de cada insumoId. */
export function mapUltimoInventarioPorInsumo(
  rows: { insumoId: string; fecha: Date; stockReal: Prisma.Decimal }[],
): Map<string, { fecha: Date; stockReal: Prisma.Decimal }> {
  const sorted = [...rows].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const m = new Map<string, { fecha: Date; stockReal: Prisma.Decimal }>();
  for (const r of sorted) {
    if (!m.has(r.insumoId)) m.set(r.insumoId, { fecha: r.fecha, stockReal: r.stockReal });
  }
  return m;
}

export function calcularStockReferenciaPorInsumo(
  insumos: InsumoLite[],
  ultimoPorInsumo: Map<string, { fecha: Date; stockReal: Prisma.Decimal }>,
  compraDetalles: {
    insumoId: string;
    cantidad: Prisma.Decimal;
    unidad: Unidad;
    compraFecha: Date;
  }[],
  ventasConsumo: {
    platoId: string;
    ventaFecha: Date;
    detalleCantidad: number;
    insumoId: string;
    recetaCantidad: Prisma.Decimal;
    recetaUnidad: Unidad;
  }[],
): Map<string, StockCalculadoInfo> {
  const out = new Map<string, StockCalculadoInfo>();

  for (const ins of insumos) {
    const base = ultimoPorInsumo.get(ins.id);
    if (!base) {
      out.set(ins.id, { status: "sin-base" });
      continue;
    }

    const fechaBase = base.fecha;
    const stockBase = decToNumber(base.stockReal);
    const uBase = ins.unidadBase;

    let comprado = 0;
    let unidadesMixtas = false;
    for (const d of compraDetalles) {
      if (d.insumoId !== ins.id) continue;
      if (d.compraFecha.getTime() < fechaBase.getTime()) continue;
      if (d.unidad === uBase) {
        comprado += decToNumber(d.cantidad);
      } else {
        unidadesMixtas = true;
      }
    }

    let consumido = 0;
    for (const v of ventasConsumo) {
      if (v.insumoId !== ins.id) continue;
      if (v.ventaFecha.getTime() < fechaBase.getTime()) continue;
      if (!sonUnidadesCompatibles(uBase as string, v.recetaUnidad as string)) continue;
      if (v.recetaUnidad !== uBase) {
        unidadesMixtas = true;
        continue;
      }
      consumido += v.detalleCantidad * decToNumber(v.recetaCantidad);
    }

    const valor = stockBase + comprado - consumido;
    out.set(ins.id, {
      status: "ok",
      valor,
      unidadLabel: unitLabel(uBase),
      unidadesMixtas,
    });
  }

  return out;
}
