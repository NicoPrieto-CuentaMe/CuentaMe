import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InventarioForm } from "@/components/inventario/InventarioForm";
import { InventarioHistorial } from "@/components/inventario/InventarioHistorial";
import { getStockActual } from "@/lib/get-stock-actual";

export default async function InventarioPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Fechas recientes para el historial (últimas 10 fechas distintas con conteos)
  const fechasTop = await prisma.inventario.findMany({
    where: { userId },
    select: { fecha: true },
    distinct: ["fecha"],
    orderBy: { fecha: "desc" },
    take: 10,
  });

  const [{ stockById, error: stockError }, inventarioRows] = await Promise.all([
    getStockActual(userId),
    fechasTop.length === 0
      ? Promise.resolve([])
      : prisma.inventario.findMany({
          where: { userId, fecha: { in: fechasTop.map((f) => f.fecha) } },
          include: {
            insumo: { select: { nombre: true, unidadBase: true } },
          },
          orderBy: [{ fecha: "desc" }, { insumo: { nombre: "asc" } }],
        }),
  ]);

  // Obtener lista de insumos para el formulario (sin deletedAt)
  const insumos = await prisma.insumo.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, nombre: true, unidadBase: true, categoria: true },
    orderBy: { nombre: "asc" },
  });

  // Serializar Decimal → number para Client Components
  const inventarioRowsSerialized = (Array.isArray(inventarioRows) ? inventarioRows : []).map(
    (r) => ({
      ...r,
      stockReal: Number(r.stockReal.toString()),
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Inventario</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Registra conteos físicos del stock en tu depósito y revisa el historial reciente.
        </p>
      </div>

      {stockError && (
        <div className="rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
          No se pudo calcular el stock actualizado. Los datos mostrados pueden estar incompletos.
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Nuevo conteo</h2>
        <InventarioForm insumos={insumos} stockCalculadoById={stockById} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Historial de conteos</h2>
        <InventarioHistorial rows={inventarioRowsSerialized} />
      </div>
    </div>
  );
}
