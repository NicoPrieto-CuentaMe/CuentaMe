import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VentasForm } from "@/components/ventas/VentasForm";

const notDeleted = { deletedAt: null } as const;

export default async function VentasPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [platos, ventas, rankingRows] = await Promise.all([
    prisma.plato.findMany({
      where: { userId, ...notDeleted, active: true },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        precioVenta: true,
        categoriaId: true,
        categoria: { select: { id: true, nombre: true } },
      },
      orderBy: { nombre: "asc" },
    }),
    prisma.venta.findMany({
      where: { userId },
      take: 50,
      orderBy: [{ fecha: "desc" }, { hora: "desc" }],
      include: {
        detalles: {
          include: {
            plato: { select: { nombre: true, precioVenta: true } },
          },
          orderBy: { plato: { nombre: "asc" } },
        },
      },
    }),
    prisma.detalleVenta.groupBy({
      by: ["platoId"],
      where: { userId },
      _sum: { cantidad: true },
      orderBy: { _sum: { cantidad: "desc" } },
    }),
  ]);

  const rankingVentas: Record<string, number> = {};
  for (const row of rankingRows) {
    rankingVentas[row.platoId] = row._sum.cantidad ?? 0;
  }

  return (
    <>
      <VentasForm platos={platos} rankingVentas={rankingVentas} historialRows={ventas} />
    </>
  );
}
