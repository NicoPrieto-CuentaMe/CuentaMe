import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Platos disponibles para ventas nuevas: activos y no eliminados (soft delete).
 * Usar esta forma de consulta al implementar el selector de platos.
 */
export default async function VentasPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const platosSelector = userId
    ? await prisma.plato.findMany({
        where: { userId, deletedAt: null, active: true },
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true, precioVenta: true },
      })
    : [];

  return (
    <div
      className="rounded-xl border border-border bg-surface p-8 shadow-sm"
      data-platos-selector-count={platosSelector.length}
    >
      <p className="text-sm text-text-tertiary">Ventas — contenido próximamente.</p>
    </div>
  );
}
