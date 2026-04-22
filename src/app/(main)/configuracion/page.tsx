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
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Configuración</h2>
            <p className="mt-1 text-sm text-text-tertiary">
              Tablas maestras que alimentan el resto del sistema.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 md:w-auto">
            {tabs.map((t) => {
              const active = t.key === tab;
              return (
                <Link
                  key={t.key}
                  href={`/configuracion?tab=${t.key}`}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent-light text-accent"
                      : "border border-border bg-surface-elevated text-text-secondary hover:bg-border hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {tab === "proveedores" ? <ProveedoresTabPanel rows={proveedores} /> : null}

      {tab === "insumos" ? <InsumosTabPanel rows={insumos} /> : null}

      {tab === "carta" ? (
        <CartaTab
          platos={platos}
          categorias={categorias}
          insumos={insumos}
          combos={combos}
          initialDishId={searchParams?.dishId}
        />
      ) : null}

      {tab === "personal" ? (
        <EmpleadosNominaTab empleadosInicial={empleadosActivos} nominasInicial={todasNominas} />
      ) : null}
    </div>
  );
}
