import type { Unidad } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

export type StockCalculadoInfo =
  | { status: "sin-base" }
  | {
      status: "ok";
      valor: number;
      valorNegativo: boolean;
      unidadLabel: string;
      unidadesMixtas: boolean;
    };

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

/**
 * Convierte `cantidad` desde `desde` hacia `hacia`.
 * Retorna null si las unidades no son del mismo grupo dimensional.
 */
function convertirAUnidad(
  cantidad: number,
  desde: Unidad,
  hacia: Unidad,
): number | null {
  if (desde === hacia) return cantidad;

  const factorMasa: Partial<Record<Unidad, number>> = {
    GRAMO: 1,
    KILOGRAMO: 1000,
    LIBRA: 453.592,
  };
  const factorVolumen: Partial<Record<Unidad, number>> = {
    MILILITRO: 1,
    LITRO: 1000,
  };

  const enMasa = (u: Unidad) => u in factorMasa;
  const enVolumen = (u: Unidad) => u in factorVolumen;

  if (enMasa(desde) && enMasa(hacia)) {
    return (cantidad * factorMasa[desde]!) / factorMasa[hacia]!;
  }
  if (enVolumen(desde) && enVolumen(hacia)) {
    return (cantidad * factorVolumen[desde]!) / factorVolumen[hacia]!;
  }

  return null;
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
  // Pre-indexar compras por insumoId — O(M) en lugar de O(N×M)
  const comprasPorInsumo = new Map<string, typeof compraDetalles>();
  for (const d of compraDetalles) {
    if (!comprasPorInsumo.has(d.insumoId)) comprasPorInsumo.set(d.insumoId, []);
    comprasPorInsumo.get(d.insumoId)!.push(d);
  }

  // Pre-indexar ventas por insumoId — O(K) en lugar de O(N×K)
  const ventasPorInsumo = new Map<string, typeof ventasConsumo>();
  for (const v of ventasConsumo) {
    if (!ventasPorInsumo.has(v.insumoId)) ventasPorInsumo.set(v.insumoId, []);
    ventasPorInsumo.get(v.insumoId)!.push(v);
  }

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

    const comprasIns = comprasPorInsumo.get(ins.id) ?? [];
    for (const d of comprasIns) {
      if (d.compraFecha.getTime() < fechaBase.getTime()) continue;
      const cantidadConvertida = convertirAUnidad(decToNumber(d.cantidad), d.unidad, uBase);
      if (cantidadConvertida !== null) {
        comprado += cantidadConvertida;
        if (d.unidad !== uBase) unidadesMixtas = true;
      } else {
        unidadesMixtas = true;
      }
    }

    let consumido = 0;
    const ventasIns = ventasPorInsumo.get(ins.id) ?? [];
    for (const v of ventasIns) {
      if (v.ventaFecha.getTime() < fechaBase.getTime()) continue;
      const cantidadReceta = decToNumber(v.recetaCantidad);
      const cantidadConvertida = convertirAUnidad(
        v.detalleCantidad * cantidadReceta,
        v.recetaUnidad,
        uBase,
      );
      if (cantidadConvertida !== null) {
        consumido += cantidadConvertida;
        if (v.recetaUnidad !== uBase) unidadesMixtas = true;
      } else {
        unidadesMixtas = true;
      }
    }

    const valorBruto = stockBase + comprado - consumido;
    const valor = Math.round(valorBruto * 1000) / 1000;
    out.set(ins.id, {
      status: "ok",
      valor,
      valorNegativo: valor < 0,
      unidadLabel: unitLabel(uBase),
      unidadesMixtas,
    });
  }

  return out;
}
