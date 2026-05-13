import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { TipoPlato } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAllNominas, getCombosConComponentes, getEmpleadosActivos } from "./actions";
import { InsumosTabPanel, ProveedoresTabPanel } from "./components/MasterTablesInline";
import { CartaTab } from "./components/CartaTab";
import { EmpleadosNominaTab } from "./components/EmpleadosNominaTab";

const tabs = [
  { key: "proveedores", label: "Proveedores" },
  { key: "insumos", label: "Insumos" },
  { key: "carta", label: "Carta" },
  { key: "personal", label: "Personal" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

type CartaPlatoPayload = Prisma.PlatoGetPayload<{
  include: {
    recetas: { include: { insumo: true } };
    categoria: true;
  };
}>;

function normalizeTab(tab: unknown): TabKey {
  const t = typeof tab === "string" ? tab : "";
  if (t === "platos" || t === "recetas") return "carta";
  if (t === "empleados" || t === "nomina") return "personal";
  return (tabs.find((x) => x.key === t)?.key ?? "proveedores") as TabKey;
}

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams?: { tab?: string; dishId?: string };
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const tab = normalizeTab(searchParams?.tab);

  const empleadosNominaPromise =
    tab === "personal"
      ? Promise.all([getEmpleadosActivos(), getAllNominas()])
      : Promise.resolve<[Awaited<ReturnType<typeof getEmpleadosActivos>>, Awaited<ReturnType<typeof getAllNominas>>]>([
          [],
          [],
        ]);

  const cartaPromise =
    tab === "carta"
      ? Promise.all([
          prisma.plato.findMany({
            where: { userId, deletedAt: null, tipo: TipoPlato.PLATO },
            orderBy: { nombre: "asc" },
            include: {
              recetas: {
                include: { insumo: true },
                orderBy: { insumo: { nombre: "asc" } },
              },
              categoria: true,
            },
          }),
          getCombosConComponentes(),
        ])
      : Promise.resolve<[CartaPlatoPayload[], Awaited<ReturnType<typeof getCombosConComponentes>>]>([[], []]);

  const [proveedores, insumos, [platos, combos], categorias, [empleadosActivos, todasNominas]] = await Promise.all([
    prisma.proveedor.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.insumo.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    cartaPromise,
    prisma.categoria.findMany({
      where: { userId, deletedAt: null },
      include: {
        _count: {
          select: {
            platos: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { nombre: "asc" },
    }),
    empleadosNominaPromise,
  ]);

  return (
    <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", background:"#08090a", backgroundImage:"radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize:"24px 24px", minHeight:"100vh" }}>
      {/* Título */}
      <div style={{ padding:"20px 24px 14px", flexShrink:0 }}>
        <h1 style={{ font:"590 22px/1.15 Inter,sans-serif", color:"#f7f8f8", letterSpacing:"-0.5px", margin:0 }}>Configuración</h1>
        <p style={{ font:"400 13px/1.45 Inter,sans-serif", color:"#62666d", margin:"5px 0 0", letterSpacing:"-0.1px" }}>
          Tablas maestras del sistema: proveedores, insumos, carta y personal.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ padding:"0 24px 12px", borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
        <div style={{ display:"flex", gap:4, overflowX:"auto" }}>
          {tabs.map((t) => {
            const active = t.key === tab;
            const disabled = false;
            return disabled ? (
              <span key={t.key} style={{ display:"inline-flex", alignItems:"center", gap:8, height:36, padding:"0 14px", borderRadius:8, font:"510 13px/1 Inter,sans-serif", color:"#4a4d54", cursor:"not-allowed", border:"1px solid transparent", flexShrink:0 }}>
                {t.label}
                <span style={{ font:"510 10px/1 Inter,sans-serif", color:"#4a4d54", background:"rgba(255,255,255,0.03)", padding:"3px 6px", borderRadius:999, letterSpacing:"0.3px", textTransform:"uppercase" }}>Pronto</span>
              </span>
            ) : (
              <Link key={t.key} href={`/configuracion?tab=${t.key}`} style={{
                display:"inline-flex", alignItems:"center", height:36, padding:"0 14px",
                borderRadius:8, font:"510 13px/1 Inter,sans-serif", flexShrink:0,
                letterSpacing:"-0.1px", textDecoration:"none",
                background: active ? "rgba(94,106,210,0.14)" : "transparent",
                border: "1px solid",
                borderColor: active ? "rgba(113,112,255,0.22)" : "transparent",
                color: active ? "#a4adff" : "#8a8f98",
                transition:"all 150ms cubic-bezier(0.16,1,0.3,1)",
              }}>
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding:"20px 24px 32px", display:"flex", flexDirection:"column", gap:16, flex:1 }}>
        {tab === "proveedores" ? <ProveedoresTabPanel rows={proveedores} /> : null}
        {tab === "insumos" ? <InsumosTabPanel rows={insumos} /> : null}
        {tab === "carta" ? (
          <CartaTab platos={platos} categorias={categorias} insumos={insumos} combos={combos} initialDishId={searchParams?.dishId} />
        ) : null}
        {tab === "personal" ? (
          <EmpleadosNominaTab empleadosInicial={empleadosActivos} nominasInicial={todasNominas} />
        ) : null}
      </div>
    </div>
  );
}
