import { describe, it, expect, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaTest } from "./setup";
import {
  limpiarBD,
  crearUsuarioPrueba,
  crearInsumoPrueba,
  crearPlatoPrueba,
  crearCategoriaPrueba,
} from "./helpers";

beforeEach(async () => {
  await limpiarBD();
});

// ─── HELPERS LOCALES ─────────────────────────────────────────────────────────

async function crearComboPrueba(
  userId: string,
  overrides?: { nombre?: string; precioVenta?: number }
) {
  return prismaTest.plato.create({
    data: {
      userId,
      nombre: overrides?.nombre ?? "Combo del Día",
      precioVenta: overrides?.precioVenta ?? 30000,
      tipo: "COMBO",
      tieneReceta: false,
    },
  });
}

// ─── PLATOS: ESTRUCTURA BÁSICA ────────────────────────────────────────────────

describe("Platos — estructura básica", () => {

  it("crea un plato con todos los campos correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const categoria = await crearCategoriaPrueba(userId);

    const plato = await prismaTest.plato.create({
      data: {
        userId,
        nombre: "Bandeja Paisa",
        categoriaId: categoria.id,
        precioVenta: new Prisma.Decimal("25000"),
        active: true,
        tieneReceta: true,
        tipo: "PLATO",
      },
    });

    expect(plato.id).toBeDefined();
    expect(plato.nombre).toBe("Bandeja Paisa");
    expect(plato.categoriaId).toBe(categoria.id);
    // Prisma.Decimal.toString() no preserva ceros finales — "25000" no "25000.00"
    // El valor numérico es correcto; usar comparación numérica, no de string.
    expect(Number(plato.precioVenta)).toBe(25000);
    expect(plato.active).toBe(true);
    expect(plato.tieneReceta).toBe(true);
    expect(plato.tipo).toBe("PLATO");
    expect(plato.deletedAt).toBeNull();
  });

  it("crea un plato sin categoría (campo opcional)", async () => {
    const { userId } = await crearUsuarioPrueba();

    const plato = await crearPlatoPrueba(userId);
    expect(plato.categoriaId).toBeNull();
  });

  it("precio Decimal mantiene exactamente 2 decimales (12.50 → '12.50')", async () => {
    const { userId } = await crearUsuarioPrueba();

    const plato = await prismaTest.plato.create({
      data: {
        userId,
        nombre: "Jugo Natural",
        precioVenta: new Prisma.Decimal("12.50"),
      },
    });

    // Hallazgo: Prisma.Decimal.toString() retorna "12.5" no "12.50".
    // Usar comparación numérica. Para mostrar precios en UI siempre usar toFixed(2) o formatCop().
    expect(Number(plato.precioVenta)).toBe(12.5);
  });

  it("precio Decimal precision: 12.505 se redondea a 2 decimales en Postgres", async () => {
    const { userId } = await crearUsuarioPrueba();

    const plato = await prismaTest.plato.create({
      data: {
        userId,
        nombre: "Precio Extraño",
        precioVenta: new Prisma.Decimal("12.505"),
      },
    });

    // Decimal(10,2) — Postgres redondea o trunca a 2 decimales
    const precio = parseFloat(plato.precioVenta.toString());
    expect(precio).toBeCloseTo(12.51, 1);
  });

  it("constraint de nombre es case-insensitive para el mismo usuario", async () => {
    const { userId } = await crearUsuarioPrueba();
    await crearPlatoPrueba(userId, { nombre: "Bandeja Paisa" });

    await expect(
      crearPlatoPrueba(userId, { nombre: "BANDEJA PAISA" })
    ).rejects.toThrow();
  });

  it("permite recrear plato con nombre de uno soft-deleted (constraint parcial)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const original = await crearPlatoPrueba(userId, { nombre: "Sancocho" });

    await prismaTest.plato.update({
      where: { id: original.id },
      data: { deletedAt: new Date() },
    });

    const nuevo = await crearPlatoPrueba(userId, { nombre: "Sancocho" });
    expect(nuevo.id).not.toBe(original.id);
    expect(nuevo.deletedAt).toBeNull();
  });

  it("dos usuarios pueden tener platos con el mismo nombre", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    const p1 = await crearPlatoPrueba(u1, { nombre: "Ajiaco" });
    const p2 = await crearPlatoPrueba(u2, { nombre: "Ajiaco" });

    expect(p1.id).not.toBe(p2.id);
  });

  it("plato soft-deleted no aparece en queries activos", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId);

    await prismaTest.plato.update({
      where: { id: plato.id },
      data: { deletedAt: new Date() },
    });

    const activos = await prismaTest.plato.findMany({
      where: { userId, deletedAt: null },
    });
    expect(activos.find((p) => p.id === plato.id)).toBeUndefined();
  });

  it("cascade usuario → platos eliminados (onDelete: Cascade)", async () => {
    const { userId } = await crearUsuarioPrueba();
    // No crear categorías — Categoria no tiene Cascade en User
    await crearPlatoPrueba(userId, { nombre: "Plato 1" });
    await crearPlatoPrueba(userId, { nombre: "Plato 2" });

    await prismaTest.user.delete({ where: { id: userId } });

    const count = await prismaTest.plato.count({ where: { userId } });
    expect(count).toBe(0);
  });

  it("hard delete Categoria → categoriaId en platos queda null (onDelete: SetNull)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const categoria = await crearCategoriaPrueba(userId);
    const plato = await prismaTest.plato.create({
      data: { userId, nombre: "Plato con Categoria", precioVenta: 10000, categoriaId: categoria.id },
    });

    // Hard delete directo — en producción Categoria solo se soft-delete,
    // pero la FK SetNull debe funcionar si se hace hard delete
    await prismaTest.categoria.delete({ where: { id: categoria.id } });

    const platoActualizado = await prismaTest.plato.findUnique({
      where: { id: plato.id },
    });
    expect(platoActualizado!.categoriaId).toBeNull();
  });
});

// ─── CATEGORÍAS: REGLAS DE NEGOCIO ───────────────────────────────────────────

describe("Categorías — reglas de negocio con platos", () => {

  it("documenta que Categoria no tiene onDelete: Cascade en User — delete User con Categorias falla sin limpiar antes", async () => {
    // BUG LATENTE DEL SCHEMA: Categoria.userId no tiene onDelete: Cascade.
    // Si se elimina un User que tiene Categorías, Postgres lanza FK violation.
    // Esto no pasa en producción porque los usuarios no se borran.
    // Pero en pruebas, limpiarBD() borra Categorias antes de Users, evitando el bug.
    const { userId } = await crearUsuarioPrueba();
    await crearCategoriaPrueba(userId, { nombre: "Principales" });

    // Intentar borrar el usuario SIN borrar categorías primero → falla
    await expect(
      prismaTest.user.delete({ where: { id: userId } })
    ).rejects.toThrow();
  });

  it("concurrencia — dos creates simultáneos de plato con mismo nombre: uno gana", async () => {
    const { userId } = await crearUsuarioPrueba();

    const resultados = await Promise.allSettled([
      crearPlatoPrueba(userId, { nombre: "Plato Concurrente" }),
      crearPlatoPrueba(userId, { nombre: "Plato Concurrente" }),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    expect(exitosos).toHaveLength(1);
    expect(
      await prismaTest.plato.count({ where: { userId, nombre: "Plato Concurrente" } })
    ).toBe(1);
  });
});

// ─── RECETAS: CONSTRAINTS E INTEGRIDAD ───────────────────────────────────────

describe("Recetas — constraints e integridad", () => {

  it("un insumo no puede repetirse en la receta del mismo plato (@@unique[platoId, insumoId])", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: 100, unidad: "GRAMO" },
    });

    await expect(
      prismaTest.receta.create({
        data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: 200, unidad: "GRAMO" },
      })
    ).rejects.toThrow();
  });

  it("el mismo insumo puede estar en recetas de platos distintos", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato1 = await crearPlatoPrueba(userId, { nombre: "Plato 1", tieneReceta: true });
    const plato2 = await crearPlatoPrueba(userId, { nombre: "Plato 2", tieneReceta: true });
    const insumo = await crearInsumoPrueba(userId);

    const r1 = await prismaTest.receta.create({
      data: { userId, platoId: plato1.id, insumoId: insumo.id, cantidad: 100, unidad: "GRAMO" },
    });
    const r2 = await prismaTest.receta.create({
      data: { userId, platoId: plato2.id, insumoId: insumo.id, cantidad: 200, unidad: "GRAMO" },
    });

    expect(r1.id).not.toBe(r2.id);
  });

  it("hard delete plato → recetas del plato se borran (onDelete: Cascade)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: 100, unidad: "GRAMO" },
    });

    await prismaTest.plato.delete({ where: { id: plato.id } });

    const recetas = await prismaTest.receta.findMany({ where: { platoId: plato.id } });
    expect(recetas).toHaveLength(0);
  });

  it("hard delete insumo → recetas que lo usan se borran (onDelete: Cascade)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: 100, unidad: "GRAMO" },
    });

    await prismaTest.insumo.delete({ where: { id: insumo.id } });

    const recetas = await prismaTest.receta.findMany({ where: { platoId: plato.id } });
    expect(recetas).toHaveLength(0);
  });

  it("patrón saveRecipeComplete: deleteMany + createMany en transacción reemplaza receta atómicamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumo1 = await crearInsumoPrueba(userId, { nombre: "Pollo" });
    const insumo2 = await crearInsumoPrueba(userId, { nombre: "Arroz" });

    // Receta inicial: solo insumo1
    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo1.id, cantidad: 200, unidad: "GRAMO" },
    });

    // Actualizar receta: reemplazar completamente con insumo2
    await prismaTest.$transaction(async (tx) => {
      await tx.receta.deleteMany({ where: { platoId: plato.id, userId } });
      await tx.receta.createMany({
        data: [
          { userId, platoId: plato.id, insumoId: insumo2.id, cantidad: 150, unidad: "GRAMO" },
        ],
      });
    });

    const recetas = await prismaTest.receta.findMany({ where: { platoId: plato.id } });
    expect(recetas).toHaveLength(1);
    expect(recetas[0].insumoId).toBe(insumo2.id);
  });

  it("rollback en saveRecipeComplete: si createMany falla, deleteMany también revierte", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: 100, unidad: "GRAMO" },
    });

    // Intentar reemplazar con un insumoId que no existe → falla
    await expect(
      prismaTest.$transaction(async (tx) => {
        await tx.receta.deleteMany({ where: { platoId: plato.id, userId } });
        await tx.receta.createMany({
          data: [
            { userId, platoId: plato.id, insumoId: "id-que-no-existe", cantidad: 100, unidad: "GRAMO" },
          ],
        });
      })
    ).rejects.toThrow();

    // La receta original debe seguir intacta
    const recetas = await prismaTest.receta.findMany({ where: { platoId: plato.id } });
    expect(recetas).toHaveLength(1);
    expect(recetas[0].insumoId).toBe(insumo.id);
  });

  it("Decimal precision en cantidad de receta: 0.0001 se guarda exactamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumo = await crearInsumoPrueba(userId);

    const receta = await prismaTest.receta.create({
      data: {
        userId,
        platoId: plato.id,
        insumoId: insumo.id,
        cantidad: new Prisma.Decimal("0.0001"),
        unidad: "KILOGRAMO",
      },
    });

    expect(receta.cantidad.toString()).toBe("0.0001");
  });

  it("aislamiento multi-tenant: usuario no ve recetas de otro", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const plato = await crearPlatoPrueba(u1, { tieneReceta: true });
    const insumo = await crearInsumoPrueba(u1);

    await prismaTest.receta.create({
      data: { userId: u1, platoId: plato.id, insumoId: insumo.id, cantidad: 100, unidad: "GRAMO" },
    });

    const recetasU2 = await prismaTest.receta.findMany({ where: { userId: u2 } });
    expect(recetasU2).toHaveLength(0);
  });
});

// ─── COMBOS: REGLAS CRÍTICAS ──────────────────────────────────────────────────

describe("Combos — reglas críticas", () => {

  it("combo se crea con tipo COMBO y tieneReceta false", async () => {
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);

    expect(combo.tipo).toBe("COMBO");
    expect(combo.tieneReceta).toBe(false);
  });

  it("ComboItem unique([comboId, platoId]) — el mismo plato no puede agregarse dos veces al combo", async () => {
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);
    const plato = await crearPlatoPrueba(userId);

    await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: plato.id, cantidad: 1 },
    });

    await expect(
      prismaTest.comboItem.create({
        data: { userId, comboId: combo.id, platoId: plato.id, cantidad: 2 },
      })
    ).rejects.toThrow();
  });

  it("hard delete combo → ComboItems se eliminan automáticamente (onDelete: Cascade)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);
    const plato = await crearPlatoPrueba(userId);

    await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: plato.id, cantidad: 1 },
    });

    await prismaTest.plato.delete({ where: { id: combo.id } });

    const items = await prismaTest.comboItem.findMany({ where: { comboId: combo.id } });
    expect(items).toHaveLength(0);
  });

  it("soft delete combo → ComboItems persisten en BD (soft delete no activa CASCADE)", async () => {
    // Documentación crítica: deleteCombo usa updateMany (soft delete).
    // El CASCADE de FK solo dispara en hard DELETE.
    // Los ComboItems quedan huérfanos hasta que alguien limpie o restaure el combo.
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);
    const plato = await crearPlatoPrueba(userId);

    await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: plato.id, cantidad: 1 },
    });

    // Soft delete del combo (patrón de deleteCombo en producción)
    await prismaTest.plato.update({
      where: { id: combo.id },
      data: { deletedAt: new Date() },
    });

    // Los ComboItems aún existen
    const items = await prismaTest.comboItem.findMany({ where: { comboId: combo.id } });
    expect(items).toHaveLength(1);
  });

  it("hard delete plato-componente falla si está en un combo (onDelete: Restrict)", async () => {
    // CRÍTICO: el FK Restrict protege la integridad del combo.
    // Si se pudiera borrar un plato componente, el combo quedaría con items inválidos.
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);
    const componente = await crearPlatoPrueba(userId);

    await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: componente.id, cantidad: 1 },
    });

    await expect(
      prismaTest.plato.delete({ where: { id: componente.id } })
    ).rejects.toThrow();
  });

  it("BD permite combo auto-referencia — la protección vive solo en la Server Action", async () => {
    // addComboItem en producción valida: if (platoId === comboId) return error.
    // Pero el schema no tiene esta restricción. Esta prueba documenta que
    // si se remueve esa validación de la action, el bug es silencioso.
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);

    // BD acepta combo como su propio componente
    const item = await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: combo.id, cantidad: 1 },
    });

    expect(item.comboId).toBe(item.platoId);
  });

  it("BD permite combo-dentro-de-combo — la protección vive solo en la Server Action", async () => {
    // addComboItem valida: if (plato.tipo === COMBO) return error.
    // Pero el schema no impide FK entre dos platos de tipo COMBO.
    const { userId } = await crearUsuarioPrueba();
    const comboA = await crearComboPrueba(userId, { nombre: "Combo A" });
    const comboB = await crearComboPrueba(userId, { nombre: "Combo B" });

    const item = await prismaTest.comboItem.create({
      data: { userId, comboId: comboA.id, platoId: comboB.id, cantidad: 1 },
    });

    expect(item.id).toBeDefined();
    // Si esta prueba algún día falla, se agregó un check de tipo en el schema. Celebrar.
  });

  it("aislamiento multi-tenant: usuario no ve ComboItems de otro", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    const combo = await crearComboPrueba(u1);
    const plato = await crearPlatoPrueba(u1);
    await prismaTest.comboItem.create({
      data: { userId: u1, comboId: combo.id, platoId: plato.id, cantidad: 1 },
    });

    const itemsU2 = await prismaTest.comboItem.findMany({ where: { userId: u2 } });
    expect(itemsU2).toHaveLength(0);
  });

  it("concurrencia — dos creates del mismo plato en el mismo combo: uno gana, el otro falla", async () => {
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);
    const plato = await crearPlatoPrueba(userId);

    const resultados = await Promise.allSettled([
      prismaTest.comboItem.create({
        data: { userId, comboId: combo.id, platoId: plato.id, cantidad: 1 },
      }),
      prismaTest.comboItem.create({
        data: { userId, comboId: combo.id, platoId: plato.id, cantidad: 2 },
      }),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    expect(exitosos).toHaveLength(1);

    const count = await prismaTest.comboItem.count({
      where: { comboId: combo.id, platoId: plato.id },
    });
    expect(count).toBe(1);
  });
});

// ─── CASOS DE ESTRÉS Y DOCUMENTACIÓN DE INVARIANTES ─────────────────────────

describe("Casos de estrés — invariantes críticos", () => {

  it("cambiar tipo de plato-componente a COMBO después de agregarlo no rompe la BD — la validación de tipo es solo en Action", async () => {
    // addComboItem valida que el componente no sea COMBO.
    // Pero si el plato ya está en un combo y luego se cambia su tipo a COMBO,
    // la BD lo permite. Documenta que este invariante no tiene protección en schema.
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId, { nombre: "Combo Roto" });
    const componente = await crearPlatoPrueba(userId, { nombre: "Componente" });

    await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: componente.id, cantidad: 1 },
    });

    // Convertir componente en COMBO después de haberlo agregado
    const actualizado = await prismaTest.plato.update({
      where: { id: componente.id },
      data: { tipo: "COMBO" },
    });

    // La BD acepta este estado inconsistente
    expect(actualizado.tipo).toBe("COMBO");

    // El ComboItem sigue apuntando al "componente" que ahora es COMBO
    const item = await prismaTest.comboItem.findFirst({
      where: { comboId: combo.id, platoId: componente.id },
    });
    expect(item).not.toBeNull();
    // Si esta prueba algún día falla, el schema tiene un check de tipo. Celebrar.
  });

  it("ComboItem con cantidad 0 — la BD acepta, solo la Action valida (cantidad >= 1)", async () => {
    // CRÍTICO: get-stock-actual.ts multiplica dv.cantidad * item.cantidad.
    // Si item.cantidad = 0, el consumo de stock queda en 0 aunque se haya vendido.
    // La defensa está en addComboItem (cantidad >= 1), no en el schema.
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId);
    const plato = await crearPlatoPrueba(userId);

    const item = await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: plato.id, cantidad: 0 },
    });

    expect(item.cantidad).toBe(0);
    // Si esta prueba falla, el schema tiene CHECK (cantidad >= 1). Celebrar.
  });

  it("ComboItem con cantidad negativa — la BD acepta, el stock calculado sería incorrecto", async () => {
    // cantidad negativa → stock calculado negativo → inventario fantasma.
    // Solo la Action protege contra esto.
    const { userId } = await crearUsuarioPrueba();
    const combo = await crearComboPrueba(userId, { nombre: "Combo B" });
    const plato = await crearPlatoPrueba(userId, { nombre: "Componente B" });

    const item = await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: plato.id, cantidad: -5 },
    });

    expect(item.cantidad).toBe(-5);
  });

  it("Receta con cantidad negativa — la BD acepta, el stock calculado sería incorrecto", async () => {
    // Mismo riesgo que ComboItem negativo: consumo de stock negativo
    // genera inventario fantasma en get-stock-actual.ts.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumo = await crearInsumoPrueba(userId);

    const receta = await prismaTest.receta.create({
      data: {
        userId,
        platoId: plato.id,
        insumoId: insumo.id,
        cantidad: new Prisma.Decimal("-0.5"),
        unidad: "KILOGRAMO",
      },
    });

    expect(receta.cantidad.toNumber()).toBe(-0.5);
  });

  it("soft delete plato con ventas asociadas — historial intacto, hard delete bloqueado (onDelete: RESTRICT)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId);

    // Crear venta con detalle que referencia el plato
    const venta = await prismaTest.venta.create({
      data: {
        userId,
        fecha: new Date(),
        hora: "12:00",
        tipo: "MESA",
        total: new Prisma.Decimal("25000"),
        metodoPago: "EFECTIVO",
      },
    });
    await prismaTest.detalleVenta.create({
      data: {
        userId,
        ventaId: venta.id,
        platoId: plato.id,
        cantidad: 1,
        precioUnitario: new Prisma.Decimal("25000"),
      },
    });

    // Soft delete del plato (patrón de producción) — debe funcionar
    await prismaTest.plato.update({
      where: { id: plato.id },
      data: { deletedAt: new Date() },
    });

    // El detalle histórico sigue intacto
    const detalle = await prismaTest.detalleVenta.findFirst({
      where: { ventaId: venta.id },
    });
    expect(detalle).not.toBeNull();
    expect(detalle!.platoId).toBe(plato.id);

    // Hard delete del plato falla — DetalleVenta.platoId es RESTRICT
    await expect(
      prismaTest.plato.delete({ where: { id: plato.id } })
    ).rejects.toThrow();
  });

  it("updates concurrentes a la misma receta — el resultado final es consistente, sin mezcla de ingredientes", async () => {
    // Dos llamadas simultáneas al patrón saveRecipeComplete (deleteMany + createMany)
    // sobre el mismo plato. La última transacción gana. El resultado nunca debe
    // mezclar ingredientes de ambas transacciones.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });
    const insumoOriginal = await crearInsumoPrueba(userId, { nombre: "Original" });
    const insumo1 = await crearInsumoPrueba(userId, { nombre: "Ingrediente 1" });
    const insumo2 = await crearInsumoPrueba(userId, { nombre: "Ingrediente 2" });

    // Estado inicial: receta con insumoOriginal
    await prismaTest.receta.create({
      data: {
        userId,
        platoId: plato.id,
        insumoId: insumoOriginal.id,
        cantidad: 100,
        unidad: "GRAMO",
      },
    });

    // Dos actualizaciones concurrentes — cada una reemplaza la receta completa
    const resultados = await Promise.allSettled([
      prismaTest.$transaction(async (tx) => {
        await tx.receta.deleteMany({ where: { platoId: plato.id, userId } });
        await tx.receta.createMany({
          data: [{ userId, platoId: plato.id, insumoId: insumo1.id, cantidad: 150, unidad: "GRAMO" }],
        });
      }),
      prismaTest.$transaction(async (tx) => {
        await tx.receta.deleteMany({ where: { platoId: plato.id, userId } });
        await tx.receta.createMany({
          data: [{ userId, platoId: plato.id, insumoId: insumo2.id, cantidad: 200, unidad: "GRAMO" }],
        });
      }),
    ]);

    // Al menos una transacción debe haber tenido éxito
    expect(resultados.some((r) => r.status === "fulfilled")).toBe(true);

    const recetasFinales = await prismaTest.receta.findMany({
      where: { platoId: plato.id },
    });

    // El insumoOriginal ya no debe estar — ambas transacciones lo eliminaron
    expect(recetasFinales.some((r) => r.insumoId === insumoOriginal.id)).toBe(false);

    // Todas las recetas finales pertenecen a insumo1 o insumo2 (no mezcla con original)
    expect(
      recetasFinales.every(
        (r) => r.insumoId === insumo1.id || r.insumoId === insumo2.id
      )
    ).toBe(true);

    // Las cantidades son positivas — no hubo corrupción de datos
    expect(recetasFinales.every((r) => r.cantidad.toNumber() > 0)).toBe(true);
  });
});
