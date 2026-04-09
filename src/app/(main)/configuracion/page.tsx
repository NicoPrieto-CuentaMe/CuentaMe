import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmitButton } from "./components/ConfirmSubmitButton";
import { AddDishForm, AddRecipeIngredientForm, AddSupplierForm, AddSupplyForm } from "./components/AddForms";
import { deleteDish, deleteRecipeIngredient, deleteSupplier, deleteSupply } from "./actions";
import { UNIT_OPTIONS } from "./units";

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

const unitLabel = new Map(UNIT_OPTIONS.map((u) => [u.value, u.label] as const));

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
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

  const money = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

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
              <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-[var(--foreground)]/70">
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Nombre</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Teléfono</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Categoría</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((s) => (
                    <tr key={s.id} className="text-[var(--foreground)]/90">
                      <td className="border-b border-[var(--border)] px-3 py-2">{s.nombre}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{s.telefono ?? "—"}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{s.categoria ?? "—"}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        <form action={deleteSupplier}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmSubmitButton
                            confirmMessage="¿Eliminar este proveedor? Esta acción no se puede deshacer."
                            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-[var(--foreground)]/70">
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Nombre</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Unidad base</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Categoría</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {insumos.map((s) => (
                    <tr key={s.id} className="text-[var(--foreground)]/90">
                      <td className="border-b border-[var(--border)] px-3 py-2">{s.nombre}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        {unitLabel.get(s.unidadBase) ?? s.unidadBase}
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{s.categoria ?? "—"}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        <form action={deleteSupply}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmSubmitButton
                            confirmMessage="¿Eliminar este insumo? Si está en recetas, puede fallar."
                            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-[var(--foreground)]/70">
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Nombre</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Categoría</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Precio</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Activo</th>
                    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {platos.map((d) => (
                    <tr key={d.id} className="text-[var(--foreground)]/90">
                      <td className="border-b border-[var(--border)] px-3 py-2">{d.nombre}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{d.categoria ?? "—"}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        {money.format(Number(d.precioVenta))}
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        {d.active ? (
                          <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                            Activo
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-[var(--foreground)]/70">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        <form action={deleteDish}>
                          <input type="hidden" name="id" value={d.id} />
                          <ConfirmSubmitButton
                            confirmMessage="¿Eliminar este plato? Si tiene receta, puede fallar."
                            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Eliminar
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <AddRecipeIngredientForm activeDishes={activeDishes} supplies={insumos} />
          </div>

          <div className="mt-6 space-y-4">
            {recetas.length === 0 ? (
              <p className="text-sm text-[var(--foreground)]/60">Aún no tienes recetas registradas</p>
            ) : (
              Array.from(recipesByDish.entries()).map(([dishId, group]) => (
                <div key={dishId} className="rounded-lg border border-[var(--border)] bg-white">
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <h4 className="text-sm font-semibold text-[var(--foreground)]">{group.dishName}</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
                      <thead>
                        <tr className="text-[var(--foreground)]/70">
                          <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Insumo</th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Cantidad</th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Unidad</th>
                          <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.ingredients.map((ri) => (
                          <tr key={ri.id} className="text-[var(--foreground)]/90">
                            <td className="border-b border-[var(--border)] px-3 py-2">{ri.insumo.nombre}</td>
                            <td className="border-b border-[var(--border)] px-3 py-2">{String(ri.cantidad)}</td>
                            <td className="border-b border-[var(--border)] px-3 py-2">
                              {unitLabel.get(ri.unidad) ?? ri.unidad}
                            </td>
                            <td className="border-b border-[var(--border)] px-3 py-2">
                              <form action={deleteRecipeIngredient}>
                                <input type="hidden" name="id" value={ri.id} />
                                <ConfirmSubmitButton
                                  confirmMessage="¿Eliminar este ingrediente de la receta?"
                                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                                >
                                  Eliminar
                                </ConfirmSubmitButton>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

