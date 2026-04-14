import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ComprasForm } from "@/components/compras/ComprasForm";
import { ComprasTable } from "@/components/compras/ComprasTable";

const notDeleted = { deletedAt: null } as const;

export default async function ComprasPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [proveedores, insumos, compras] = await Promise.all([
    prisma.proveedor.findMany({
      where: { userId, ...notDeleted },
      select: { id: true, nombre: true, categorias: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.insumo.findMany({
      where: { userId, ...notDeleted },
      select: { id: true, nombre: true, unidadBase: true, categoria: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.compra.findMany({
      where: { userId },
      take: 50,
      orderBy: { fecha: "desc" },
      include: {
        proveedor: { select: { nombre: true } },
        detalles: {
          include: { insumo: { select: { nombre: true } } },
          orderBy: { insumo: { nombre: "asc" } },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Compras</h1>
        <p className="mt-1 text-sm text-text-tertiary">Registra compras a proveedores y consulta el historial reciente.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Nueva compra</h2>
        <ComprasForm proveedores={proveedores} insumos={insumos} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Últimas compras</h2>
        <ComprasTable rows={compras} />
      </div>
    </div>
  );
}
