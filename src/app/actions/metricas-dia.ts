"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type MetricasDia = {
  totalVentas: number;
  totalCompras: number;
  totalGastos: number;
  balance: number;
  numVentas: number;
  porMetodo: Record<string, number>;
};

export async function getMetricasDia(): Promise<MetricasDia | null> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return null;

    // Colombia = UTC-5 (sin horario de verano)
    const CO_OFFSET_MS = 5 * 60 * 60 * 1000;
    const ahoraUtc = Date.now();
    const ahoraCo = new Date(ahoraUtc - CO_OFFSET_MS);
    const y = ahoraCo.getUTCFullYear();
    const mo = ahoraCo.getUTCMonth();
    const d = ahoraCo.getUTCDate();
    // Las fechas en BD están almacenadas como 12:00:00Z del día civil
    // El rango cubre todo el día civil colombiano
    const inicioDia = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
    const finDia = new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));

    const [ventas, compras, gastos] = await Promise.all([
      prisma.venta.findMany({
        where: { userId, fecha: { gte: inicioDia, lte: finDia } },
        select: { total: true, metodoPago: true },
      }),
      prisma.compra.findMany({
        where: { userId, fecha: { gte: inicioDia, lte: finDia } },
        select: { total: true },
      }),
      prisma.gastoFijo.findMany({
        where: { userId, fecha: { gte: inicioDia, lte: finDia } },
        select: { monto: true },
      }),
    ]);

    const totalVentas = ventas.reduce((sum, v) => sum + Number(v.total), 0);
    const totalCompras = compras.reduce((sum, c) => sum + Number(c.total), 0);
    const totalGastos = gastos.reduce((sum, g) => sum + Number(g.monto), 0);

    const porMetodo: Record<string, number> = {};
    for (const v of ventas) {
      const mp = v.metodoPago ?? "Otro";
      porMetodo[mp] = (porMetodo[mp] ?? 0) + Number(v.total);
    }

    return {
      totalVentas,
      totalCompras,
      totalGastos,
      balance: totalVentas - totalCompras - totalGastos,
      numVentas: ventas.length,
      porMetodo,
    };
  } catch (e) {
    console.error("[getMetricasDia]", e);
    return null;
  }
}
