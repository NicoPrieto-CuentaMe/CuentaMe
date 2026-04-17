import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VentasForm } from "@/components/ventas/VentasForm";
import { VentasHistorial } from "@/components/ventas/VentasHistorial";

const notDeleted = { deletedAt: null } as const;

export default async function VentasPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [platos, ventas] = await Promise.all([
    prisma.plato.findMany({
      where: { userId, ...notDeleted, active: true },
      select: {
        id: true,
        nombre: true,
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
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Ventas</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Registra ventas rápido: elige platos y cantidades como en una caja registradora.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Nueva venta</h2>
        <VentasForm platos={platos} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Últimas ventas</h2>
        <VentasHistorial rows={ventas} />
      </div>
    </div>
  );
}
