import { TipoPlato } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calcularStockReferenciaPorInsumo,
  mapUltimoInventarioPorInsumo,
  type StockCalculadoInfo,
} from "@/lib/inventario-stock-calculado";

export type { StockCalculadoInfo };

const notDeleted = { deletedAt: null } as const;

export async function getStockActual(
  userId: string,
): Promise<{ stockById: Record<string, StockCalculadoInfo>; error: boolean }> {
  try {
    const insumos = await prisma.insumo.findMany({
      where: { userId, ...notDeleted },
      select: { id: true, nombre: true, unidadBase: true },
      orderBy: { nombre: "asc" },
    });

    if (insumos.length === 0) {
      return { stockById: {}, error: false };
    }

    const insumoIds = insumos.map((i) => i.id);

    // Paso 1: último inventario por insumo (necesario para calcular fechaMinima)
    const invRows = await prisma.inventario.findMany({
      where: { userId, insumoId: { in: insumoIds } },
      select: { insumoId: true, fecha: true, stockReal: true },
    });

    const ultimoPorInsumo = mapUltimoInventarioPorInsumo(invRows);

    // Paso 2: fechaMinima = la más antigua entre los últimos conteos
    // Solo traemos compras y ventas posteriores a ese punto — fix bugs #14 y #15
    let fechaMinima: Date | undefined;
    for (const v of Array.from(ultimoPorInsumo.values())) {
      if (!fechaMinima || v.fecha.getTime() < fechaMinima.getTime()) {
        fechaMinima = v.fecha;
      }
    }

    // Paso 3: queries filtradas por fechaMinima
    const [compraDetallesRaw, recetas, detalleVentas, comboItems] = await Promise.all([
      prisma.compraDetalle.findMany({
        where: {
          userId,
          insumoId: { in: insumoIds },
          ...(fechaMinima ? { compra: { fecha: { gte: fechaMinima } } } : {}),
        },
        select: {
          insumoId: true,
          cantidad: true,
          unidad: true,
          compra: { select: { fecha: true } },
        },
      }),
      prisma.receta.findMany({
        where: { userId, insumoId: { in: insumoIds } },
        select: { platoId: true, insumoId: true, cantidad: true, unidad: true },
      }),
      prisma.detalleVenta.findMany({
        where: {
          userId,
          ...(fechaMinima ? { venta: { fecha: { gte: fechaMinima } } } : {}),
        },
        select: {
          platoId: true,
          cantidad: true,
          venta: { select: { fecha: true } },
          plato: { select: { tipo: true } },
        },
      }),
      prisma.comboItem.findMany({
        where: { userId },
        select: { comboId: true, platoId: true, cantidad: true },
      }),
    ]);

    const compraDetalles = compraDetallesRaw.map((d) => ({
      insumoId: d.insumoId,
      cantidad: d.cantidad,
      unidad: d.unidad,
      compraFecha: d.compra.fecha,
    }));

    // Pre-indexar recetas por platoId
    const recetasPorPlato = new Map<string, (typeof recetas)[number][]>();
    for (const r of recetas) {
      if (!recetasPorPlato.has(r.platoId)) recetasPorPlato.set(r.platoId, []);
      recetasPorPlato.get(r.platoId)!.push(r);
    }

    // Pre-indexar comboItems por comboId
    const itemsPorCombo = new Map<string, typeof comboItems>();
    for (const item of comboItems) {
      if (!itemsPorCombo.has(item.comboId)) itemsPorCombo.set(item.comboId, []);
      itemsPorCombo.get(item.comboId)!.push(item);
    }

    // Expandir ventas a consumo por insumo
    const ventasConsumo: {
      platoId: string;
      ventaFecha: Date;
      detalleCantidad: number;
      insumoId: string;
      recetaCantidad: (typeof recetas)[number]["cantidad"];
      recetaUnidad: (typeof recetas)[number]["unidad"];
    }[] = [];

    for (const dv of detalleVentas) {
      const recetasPlato = recetasPorPlato.get(dv.platoId) ?? [];
      for (const r of recetasPlato) {
        ventasConsumo.push({
          platoId: dv.platoId,
          ventaFecha: dv.venta.fecha,
          detalleCantidad: dv.cantidad,
          insumoId: r.insumoId,
          recetaCantidad: r.cantidad,
          recetaUnidad: r.unidad,
        });
      }

      if (dv.plato.tipo === TipoPlato.COMBO) {
        const items = itemsPorCombo.get(dv.platoId) ?? [];
        for (const item of items) {
          const recetasComponente = recetasPorPlato.get(item.platoId) ?? [];
          for (const r of recetasComponente) {
            ventasConsumo.push({
              platoId: item.platoId,
              ventaFecha: dv.venta.fecha,
              detalleCantidad: dv.cantidad * item.cantidad,
              insumoId: r.insumoId,
              recetaCantidad: r.cantidad,
              recetaUnidad: r.unidad,
            });
          }
        }
      }
    }

    const stockMap = calcularStockReferenciaPorInsumo(
      insumos,
      ultimoPorInsumo,
      compraDetalles,
      ventasConsumo,
    );

    const stockById: Record<string, StockCalculadoInfo> = {};
    stockMap.forEach((info, id) => {
      stockById[id] = info;
    });

    return { stockById, error: false };
  } catch (e) {
    console.error("[getStockActual]", e);
    return { stockById: {}, error: true };
  }
}
