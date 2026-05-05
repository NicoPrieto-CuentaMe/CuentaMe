"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MetodoPagoVenta, TipoVenta } from "@prisma/client";

export type MetricasDia = {
  totalVentas: number;
  totalCompras: number;
  totalGastos: number;
  balance: number;
  numTransacciones: number;
  totalPlatosVendidos: number;
  numMesas: number;
  numDomicilios: number;
  numParaLlevar: number;
  porMetodo: Record<string, number>;
  errores: string[];
};

export async function getMetricasDia(): Promise<MetricasDia | null> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return null;

    const CO_OFFSET_MS = 5 * 60 * 60 * 1000;
    const ahoraUtc = Date.now();
    const ahoraCo = new Date(ahoraUtc - CO_OFFSET_MS);
    const y = ahoraCo.getUTCFullYear();
    const mo = ahoraCo.getUTCMonth();
    const d = ahoraCo.getUTCDate();
    const inicioDia = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
    const finDia = new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));

    const [resVentas, resCompras, resGastos, resDetalles] = await Promise.allSettled([
      prisma.venta.findMany({
        where: { userId, fecha: { gte: inicioDia, lte: finDia } },
        select: { total: true, metodoPago: true, tipo: true },
      }),
      prisma.compra.findMany({
        where: { userId, fecha: { gte: inicioDia, lte: finDia } },
        select: { total: true },
      }),
      prisma.gastoFijo.findMany({
        where: { userId, fecha: { gte: inicioDia, lte: finDia } },
        select: { monto: true },
      }),
      prisma.detalleVenta.findMany({
        where: { userId, venta: { fecha: { gte: inicioDia, lte: finDia } } },
        select: { cantidad: true },
      }),
    ]);

    const errores: string[] = [];

    const ventas = resVentas.status === "fulfilled" ? resVentas.value : [];
    if (resVentas.status === "rejected") {
      console.error("[getMetricasDia] ventas", resVentas.reason);
      errores.push("ventas");
    }

    const compras = resCompras.status === "fulfilled" ? resCompras.value : [];
    if (resCompras.status === "rejected") {
      console.error("[getMetricasDia] compras", resCompras.reason);
      errores.push("compras");
    }

    const gastos = resGastos.status === "fulfilled" ? resGastos.value : [];
    if (resGastos.status === "rejected") {
      console.error("[getMetricasDia] gastos", resGastos.reason);
      errores.push("gastos");
    }

    const detalles = resDetalles.status === "fulfilled" ? resDetalles.value : [];
    if (resDetalles.status === "rejected") {
      console.error("[getMetricasDia] detalles", resDetalles.reason);
      errores.push("detalles");
    }

    const totalVentas = ventas.reduce((sum, v) => sum + Number(v.total), 0);
    const totalCompras = compras.reduce((sum, c) => sum + Number(c.total), 0);
    const totalGastos = gastos.reduce((sum, g) => sum + Number(g.monto), 0);

    // porMetodo: todas las claves del enum inicializadas en 0
    const porMetodo: Record<string, number> = Object.fromEntries(
      Object.values(MetodoPagoVenta).map((m) => [m, 0]),
    );
    for (const v of ventas) {
      porMetodo[v.metodoPago] = (porMetodo[v.metodoPago] ?? 0) + Number(v.total);
    }

    const totalPlatosVendidos = detalles.reduce((sum, d) => sum + d.cantidad, 0);
    const numMesas = ventas.filter((v) => v.tipo === TipoVenta.MESA).length;
    const numDomicilios = ventas.filter((v) => v.tipo === TipoVenta.DOMICILIO).length;
    const numParaLlevar = ventas.filter((v) => v.tipo === TipoVenta.PARA_LLEVAR).length;

    return {
      totalVentas,
      totalCompras,
      totalGastos,
      balance: totalVentas - totalCompras - totalGastos,
      numTransacciones: ventas.length,
      totalPlatosVendidos,
      numMesas,
      numDomicilios,
      numParaLlevar,
      porMetodo,
      errores,
    };
  } catch (e) {
    console.error("[getMetricasDia]", e);
    return null;
  }
}
