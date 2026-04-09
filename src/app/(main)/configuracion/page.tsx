import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AddDishForm, AddSupplierForm, AddSupplyForm } from "./components/AddForms";
import { InsumosTable, PlatosTable, ProveedoresTable } from "./components/MasterTablesInline";
import { RecipesCardsModal } from "./components/RecipeCardsModal";

const tabs = [
  { key: "proveedores", label: "Proveedores" },
  { key: "insumos", label: "Insumos" },
  { key: "platos", label: "Platos" },
  { key: "recetas", label: "Recetas" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function normalizeTab(tab: unknown): TabKey {
  const t = typeof tab === "string" ? tab : "";
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

  const [proveedores, insumos, platos, recetas] = await Promise.all([
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
      orderBy: { createdAt: "desc" },
    }),
    prisma.receta.findMany({
      where: { userId },
      include: { plato: true, insumo: true },
      orderBy: [{ plato: { nombre: "asc" } }, { insumo: { nombre: "asc" } }],
    }),
  ]);

  const activeDishes = platos.filter((d) => d.active);

  const recipesByDish = recetas.reduce(
    (acc, ri) => {
      const key = ri.platoId;
      const existing = acc.get(key);
      if (existing) existing.ingredients.push(ri);
      else acc.set(key, { dishName: ri.plato.nombre, ingredients: [ri] });
      return acc;
    },
    new Map<string, { dishName: string; ingredients: typeof recetas }>(),
  );

  const platosConReceta = new Set(recetas.map((r) => r.platoId));
  const platosSinReceta = activeDishes
    .filter((p) => !platosConReceta.has(p.id))
    .map((p) => ({ id: p.id, nombre: p.nombre }));

  const recipeGroups = Array.from(recipesByDish.entries()).map(([platoId, g]) => ({
    platoId,
    platoNombre: g.dishName,
    ingredientes: g.ingredients.map((ri) => ({
      id: ri.id,
      insumoId: ri.insumoId,
      insumoNombre: ri.insumo.nombre,
      cantidad: String(ri.cantidad),
      unidad: ri.unidad,
    })),
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Configuración</h2>
            <p className="mt-1 text-sm text-[var(--foreground)]/60">
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
                      ? "bg-accent/10 text-accent"
                      : "border border-[var(--border)] bg-white text-[var(--foreground)]/80 hover:bg-gray-50 hover:text-[var(--foreground)]"
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
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Proveedores</h3>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">Crea tus proveedores una sola vez.</p>

          <div className="mt-4">
            <AddSupplierForm />
          </div>

          <div className="mt-6 overflow-x-auto">
            {proveedores.length === 0 ? (
              <p className="text-sm text-[var(--foreground)]/60">Aún no tienes proveedores registrados</p>
            ) : (
              <ProveedoresTable rows={proveedores} />
            )}
          </div>
        </section>
      ) : null}

      {tab === "insumos" ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Insumos</h3>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Define tus insumos con unidad base para cálculos posteriores.
          </p>

          <div className="mt-4">
            <AddSupplyForm />
          </div>

          <div className="mt-6 overflow-x-auto">
            {insumos.length === 0 ? (
              <p className="text-sm text-[var(--foreground)]/60">Aún no tienes insumos registrados</p>
            ) : (
              <InsumosTable rows={insumos} />
            )}
          </div>
        </section>
      ) : null}

      {tab === "platos" ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Platos</h3>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Crea tus platos con precio de venta y estado activo.
          </p>

          <div className="mt-4">
            <AddDishForm />
          </div>

          <div className="mt-6 overflow-x-auto">
            {platos.length === 0 ? (
              <p className="text-sm text-[var(--foreground)]/60">Aún no tienes platos registrados</p>
            ) : (
              <PlatosTable rows={platos} />
            )}
          </div>
        </section>
      ) : null}

      {tab === "recetas" ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Recetas</h3>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Agrega ingredientes a cada plato (solo aparecen platos activos).
          </p>

          <div className="mt-4">
            <RecipesCardsModal
              groups={recipeGroups}
              platosSinReceta={platosSinReceta}
              activeDishes={activeDishes}
              supplies={insumos}
              preselectedDishId={searchParams?.dishId}
            />
          </div>

        </section>
      ) : null}
    </div>
  );
}

