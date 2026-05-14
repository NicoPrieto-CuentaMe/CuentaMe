import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ComprasForm } from "@/components/compras/ComprasForm";
import { ComprasTableWrapper } from "@/components/compras/ComprasTable";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 0 40px" }}>
      <div>
        <h1 style={{ font: "590 22px/1.15 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.5px", margin: 0 }}>Compras</h1>
        <p style={{ font: "400 13px/1.45 Inter,sans-serif", color: "#62666d", margin: "5px 0 0" }}>Registra compras a proveedores y consulta el historial reciente.</p>
      </div>

      <section
        style={{
          position: "relative",
          background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 18,
          padding: "32px 36px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <h1 style={{ font: "590 32px/1.15 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-1px", margin: 0 }}>
          Nueva compra
        </h1>
        <ComprasForm proveedores={proveedores} insumos={insumos} />
      </section>

      <ComprasTableWrapper rows={compras} />
    </div>
  );
}
