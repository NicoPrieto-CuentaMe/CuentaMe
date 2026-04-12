import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AddSupplierForm, AddSupplyForm } from "./components/AddForms";
import { InsumosTable, ProveedoresTable } from "./components/MasterTablesInline";
import { CartaTab } from "./components/CartaTab";

const tabs = [
  { key: "proveedores", label: "Proveedores" },
  { key: "insumos", label: "Insumos" },
  { key: "carta", label: "Carta" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function normalizeTab(tab: unknown): TabKey {
  const t = typeof tab === "string" ? tab : "";
  if (t === "platos" || t === "recetas") return "carta";
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

  const [proveedores, insumos, platos, categorias] = await Promise.all([
    prisma.proveedor.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.insumo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.plato.findMany({
      where: { userId },
      include: {
        recetas: {
          include: { insumo: true },
          orderBy: { insumo: { nombre: "asc" } },
        },
        categoria: true,
      },
      orderBy: { nombre: "asc" },
    }),
    prisma.categoria.findMany({
      where: { userId },
      include: { _count: { select: { platos: true } } },
      orderBy: { nombre: "asc" },
    }),
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

      {tab === "proveedores" ? (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-base font-semibold text-text-primary">Proveedores</h3>
          <p className="mt-1 text-sm text-text-tertiary">Crea tus proveedores una sola vez.</p>

          <div className="mt-4">
            <AddSupplierForm />
          </div>

          <div className="mt-6 overflow-x-auto">
            {proveedores.length === 0 ? (
              <p className="text-sm text-text-tertiary">Aún no tienes proveedores registrados</p>
            ) : (
              <ProveedoresTable rows={proveedores} />
            )}
          </div>
        </section>
      ) : null}

      {tab === "insumos" ? (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-base font-semibold text-text-primary">Insumos</h3>
          <p className="mt-1 text-sm text-text-tertiary">
            Define tus insumos con unidad base para cálculos posteriores.
          </p>

          <div className="mt-4">
            <AddSupplyForm />
          </div>

          <div className="mt-6 overflow-x-auto">
            {insumos.length === 0 ? (
              <p className="text-sm text-text-tertiary">Aún no tienes insumos registrados</p>
            ) : (
              <InsumosTable rows={insumos} />
            )}
          </div>
        </section>
      ) : null}

      {tab === "carta" ? (
        <CartaTab
          platos={platos}
          categorias={categorias}
          insumos={insumos}
          initialDishId={searchParams?.dishId}
        />
      ) : null}
    </div>
  );
}
