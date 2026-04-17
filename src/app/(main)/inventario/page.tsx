import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InventarioForm } from "@/components/inventario/InventarioForm";
import { InventarioHistorial } from "@/components/inventario/InventarioHistorial";

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
        <InventarioForm insumos={insumos} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Historial de conteos</h2>
        <InventarioHistorial rows={inventarioRows} />
      </div>
    </div>
  );
}
