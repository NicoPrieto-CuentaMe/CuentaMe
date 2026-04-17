import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InventarioForm } from "@/components/inventario/InventarioForm";
import { InventarioHistorial } from "@/components/inventario/InventarioHistorial";
import {
  calcularStockReferenciaPorInsumo,
  mapUltimoInventarioPorInsumo,
  type StockCalculadoInfo,
} from "@/lib/inventario-stock-calculado";

const notDeleted = { deletedAt: null } as const;

export default async function InventarioPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [insumos, fechasTop] = await Promise.all([
    prisma.insumo.findMany({
      where: { userId, ...notDeleted },
      select: { id: true, nombre: true, unidadBase: true, categoria: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.inventario.findMany({
      where: { userId },
      select: { fecha: true },
      distinct: ["fecha"],
      orderBy: { fecha: "desc" },
      take: 10,
    }),
  ]);

  const insumoIds = insumos.map((i) => i.id);

  const [invRows, compraDetallesRaw, recetas, detalleVentas] = await Promise.all([
    insumoIds.length === 0
      ? Promise.resolve([])
      : prisma.inventario.findMany({
          where: { userId, insumoId: { in: insumoIds } },
          select: { insumoId: true, fecha: true, stockReal: true },
        }),
    insumoIds.length === 0
      ? Promise.resolve([])
      : prisma.compraDetalle.findMany({
          where: { userId, insumoId: { in: insumoIds } },
          select: {
            insumoId: true,
            cantidad: true,
            unidad: true,
            compra: { select: { fecha: true } },
          },
        }),
    insumoIds.length === 0
      ? Promise.resolve([])
      : prisma.receta.findMany({
          where: { userId, insumoId: { in: insumoIds } },
          select: { platoId: true, insumoId: true, cantidad: true, unidad: true },
        }),
    prisma.detalleVenta.findMany({
      where: { userId },
      select: {
        platoId: true,
        cantidad: true,
        venta: { select: { fecha: true } },
      },
    }),
  ]);

  const ultimoPorInsumo = mapUltimoInventarioPorInsumo(invRows);

  const compraDetalles = compraDetallesRaw.map((d) => ({
    insumoId: d.insumoId,
    cantidad: d.cantidad,
    unidad: d.unidad,
    compraFecha: d.compra.fecha,
  }));

  const ventasConsumo: {
    platoId: string;
    ventaFecha: Date;
    detalleCantidad: number;
    insumoId: string;
    recetaCantidad: (typeof recetas)[number]["cantidad"];
    recetaUnidad: (typeof recetas)[number]["unidad"];
  }[] = [];

  for (const dv of detalleVentas) {
    for (const r of recetas) {
      if (r.platoId !== dv.platoId) continue;
      ventasConsumo.push({
        platoId: dv.platoId,
        ventaFecha: dv.venta.fecha,
        detalleCantidad: dv.cantidad,
        insumoId: r.insumoId,
        recetaCantidad: r.cantidad,
        recetaUnidad: r.unidad,
      });
    }
  }

  const stockMap = calcularStockReferenciaPorInsumo(insumos, ultimoPorInsumo, compraDetalles, ventasConsumo);
  const stockCalculadoById: Record<string, StockCalculadoInfo> = {};
  stockMap.forEach((info, id) => {
    stockCalculadoById[id] = info;
  });

  const fechasList = fechasTop.map((f) => f.fecha);

  const inventarioRows =
    fechasList.length === 0
      ? []
      : await prisma.inventario.findMany({
          where: { userId, fecha: { in: fechasList } },
          include: {
            insumo: { select: { nombre: true, unidadBase: true } },
          },
          orderBy: [{ fecha: "desc" }, { insumo: { nombre: "asc" } }],
        });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Inventario</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Registra conteos físicos del stock en tu depósito y revisa el historial reciente.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Nuevo conteo</h2>
        <InventarioForm insumos={insumos} stockCalculadoById={stockCalculadoById} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Historial de conteos</h2>
        <InventarioHistorial rows={inventarioRows} />
      </div>
    </div>
  );
}
