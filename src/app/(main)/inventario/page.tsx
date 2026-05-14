import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { InventarioForm } from "@/components/inventario/InventarioForm";
import { InventarioHistorialWrapper } from "@/components/inventario/InventarioHistorial";
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 0 40px" }}>
      <div>
        <h1 style={{ font: "590 22px/1.15 Inter,sans-serif", color: "#f7f8f8", letterSpacing: "-0.5px", margin: 0 }}>Inventario</h1>
        <p style={{ font: "400 13px/1.45 Inter,sans-serif", color: "#62666d", margin: "5px 0 0" }}>
          Registra conteos físicos del stock en tu depósito y revisa el historial reciente.
        </p>
      </div>

      {stockError && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 16px",
            background: "rgba(217,119,6,0.10)",
            border: "1px solid rgba(217,119,6,0.25)",
            borderRadius: 10,
          }}
        >
          <p style={{ font: "400 13px/1.5 Inter,sans-serif", color: "#f4b35e", margin: 0 }}>
            No se pudo calcular el stock actualizado. Los datos mostrados pueden estar incompletos.
          </p>
        </div>
      )}

      <section
        style={{
          position: "relative",
          background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 18,
          padding: "28px 32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ font: "590 10px/1 Inter,sans-serif", color: "#62666d", letterSpacing: "1.6px", textTransform: "uppercase" }}>
          NUEVO CONTEO
        </div>
        <InventarioForm insumos={insumos} stockCalculadoById={stockById} />
      </section>

      <InventarioHistorialWrapper rows={inventarioRowsSerialized} />
    </div>
  );
}
