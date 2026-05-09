import { describe, it, expect, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaTest } from "./setup";
import {
  limpiarBD,
  crearUsuarioPrueba,
  crearInsumoPrueba,
  crearPlatoPrueba,
  crearProveedorPrueba,
} from "./helpers";

beforeEach(async () => {
  await limpiarBD();
});

describe("Insumos — cobertura exhaustiva", () => {

  // ─── HAPPY PATH ──────────────────────────────────────────────────────────

  it("crea un insumo con todos los campos correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();

    const insumo = await prismaTest.insumo.create({
      data: {
        userId,
        nombre: "Pechuga de pollo",
        unidadBase: "KILOGRAMO",
        categoria: "CARNES",
      },
    });

    expect(insumo.id).toBeDefined();
    expect(insumo.nombre).toBe("Pechuga de pollo");
    expect(insumo.unidadBase).toBe("KILOGRAMO");
    expect(insumo.categoria).toBe("CARNES");
    expect(insumo.deletedAt).toBeNull();
  });

  it("crea un insumo sin categoría (campo opcional)", async () => {
    const { userId } = await crearUsuarioPrueba();

    const insumo = await prismaTest.insumo.create({
      data: { userId, nombre: "Sal", unidadBase: "GRAMO" },
    });

    expect(insumo.categoria).toBeNull();
  });

  // ─── CONSTRAINTS ÚNICOS ──────────────────────────────────────────────────

  it("no permite dos insumos activos con el mismo nombre para el mismo usuario", async () => {
    const { userId } = await crearUsuarioPrueba();
    await crearInsumoPrueba(userId, { nombre: "Tomate" });

    await expect(
      crearInsumoPrueba(userId, { nombre: "Tomate" })
    ).rejects.toThrow();
  });

  it("constraint de nombre es case-insensitive — 'pollo' y 'POLLO' colisionan", async () => {
    const { userId } = await crearUsuarioPrueba();
    await crearInsumoPrueba(userId, { nombre: "Pollo" });

    await expect(
      crearInsumoPrueba(userId, { nombre: "POLLO" })
    ).rejects.toThrow();
  });

  it("permite recrear insumo con nombre de uno soft-deleted (constraint parcial)", async () => {
    const { userId } = await crearUsuarioPrueba();

    const original = await crearInsumoPrueba(userId, { nombre: "Cebolla" });
    await prismaTest.insumo.update({
      where: { id: original.id },
      data: { deletedAt: new Date() },
    });

    const nuevo = await crearInsumoPrueba(userId, { nombre: "Cebolla" });
    expect(nuevo.id).not.toBe(original.id);
    expect(nuevo.deletedAt).toBeNull();
  });

  it("dos usuarios distintos pueden tener insumos con el mismo nombre", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "user1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "user2@test.com" });

    const i1 = await crearInsumoPrueba(u1, { nombre: "Arroz" });
    const i2 = await crearInsumoPrueba(u2, { nombre: "Arroz" });

    expect(i1.id).not.toBe(i2.id);
  });

  it("renombrar insumo al nombre de otro existente falla con constraint", async () => {
    const { userId } = await crearUsuarioPrueba();
    await crearInsumoPrueba(userId, { nombre: "Insumo A" });
    const b = await crearInsumoPrueba(userId, { nombre: "Insumo B" });

    await expect(
      prismaTest.insumo.update({
        where: { id: b.id },
        data: { nombre: "Insumo A" },
      })
    ).rejects.toThrow();
  });

  it("createMany rechaza el batch completo si hay un nombre duplicado (sin skipDuplicates)", async () => {
    // Patrón usado por el chat IA cuando registra múltiples ítems en una transacción
    const { userId } = await crearUsuarioPrueba();
    await crearInsumoPrueba(userId, { nombre: "Pollo" });

    await expect(
      prismaTest.insumo.createMany({
        data: [
          { userId, nombre: "Carne", unidadBase: "KILOGRAMO" },
          { userId, nombre: "Pollo", unidadBase: "KILOGRAMO" }, // duplicado
        ],
      })
    ).rejects.toThrow();

    // El batch falla atómicamente — "Carne" tampoco se creó
    const insumos = await prismaTest.insumo.findMany({
      where: { userId, nombre: { in: ["Carne", "Pollo"] } },
    });
    expect(insumos).toHaveLength(1);
    expect(insumos[0].nombre).toBe("Pollo");
  });

  // ─── DATOS LÍMITE ────────────────────────────────────────────────────────

  it("nombre exactamente en el límite de 100 caracteres se guarda correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const nombreLimite = "A".repeat(100);

    const insumo = await crearInsumoPrueba(userId, { nombre: nombreLimite });
    expect(insumo.nombre).toHaveLength(100);
  });

  it("nombre con caracteres especiales y unicode se guarda correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const nombreUnicode = "🥩 Pollo del Campo — Ñoño";

    const insumo = await crearInsumoPrueba(userId, { nombre: nombreUnicode });
    expect(insumo.nombre).toBe(nombreUnicode);
  });

  it("nombre con caracteres SQL especiales no rompe la BD", async () => {
    const { userId } = await crearUsuarioPrueba();
    const nombreMalicioso = "'; DROP TABLE \"Insumo\";--";

    const insumo = await crearInsumoPrueba(userId, { nombre: nombreMalicioso });
    expect(insumo.nombre).toBe(nombreMalicioso);

    const count = await prismaTest.insumo.count({ where: { userId } });
    expect(count).toBe(1);
  });

  // ─── ENUM DE UNIDAD ──────────────────────────────────────────────────────

  it("rechaza unidadBase fuera del enum (Postgres bloquea)", async () => {
    const { userId } = await crearUsuarioPrueba();

    await expect(
      prismaTest.insumo.create({
        data: {
          userId,
          nombre: "Insumo Inválido",
          // @ts-expect-error — verificando que Postgres rechace valores inválidos
          unidadBase: "UNIDAD_INVENTADA",
        },
      })
    ).rejects.toThrow();
  });

  // ─── SOFT DELETE ─────────────────────────────────────────────────────────

  it("insumo eliminado no aparece en queries que filtran por deletedAt: null", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.insumo.update({
      where: { id: insumo.id },
      data: { deletedAt: new Date() },
    });

    const activos = await prismaTest.insumo.findMany({
      where: { userId, deletedAt: null },
    });
    expect(activos.find((i) => i.id === insumo.id)).toBeUndefined();
  });

  it("insumo soft-deleted sigue existiendo en BD con deletedAt seteado", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.insumo.update({
      where: { id: insumo.id },
      data: { deletedAt: new Date() },
    });

    const encontrado = await prismaTest.insumo.findUnique({
      where: { id: insumo.id },
    });
    expect(encontrado).not.toBeNull();
    expect(encontrado!.deletedAt).not.toBeNull();
  });

  it("insumo soft-deleted puede restaurarse poniendo deletedAt a null", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.insumo.update({
      where: { id: insumo.id },
      data: { deletedAt: new Date() },
    });
    await prismaTest.insumo.update({
      where: { id: insumo.id },
      data: { deletedAt: null },
    });

    const restaurado = await prismaTest.insumo.findFirst({
      where: { id: insumo.id, deletedAt: null },
    });
    expect(restaurado).not.toBeNull();
  });

  it("updatedAt se actualiza automáticamente en cada update", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId);
    const originalUpdatedAt = insumo.updatedAt;

    // Esperar 10ms para garantizar que el timestamp cambie
    await new Promise((resolve) => setTimeout(resolve, 10));

    const actualizado = await prismaTest.insumo.update({
      where: { id: insumo.id },
      data: { nombre: "Nuevo Nombre" },
    });

    expect(actualizado.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  // ─── INTEGRIDAD CON RECETAS ──────────────────────────────────────────────

  it("eliminar insumo en transacción borra sus recetas asociadas (patrón de deleteInsumo)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { nombre: "Pollo" });
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });

    await prismaTest.receta.create({
      data: {
        userId,
        platoId: plato.id,
        insumoId: insumo.id,
        cantidad: 200,
        unidad: "GRAMO",
      },
    });

    await prismaTest.$transaction(async (tx) => {
      await tx.receta.deleteMany({ where: { insumoId: insumo.id, userId } });
      await tx.insumo.update({
        where: { id: insumo.id },
        data: { deletedAt: new Date() },
      });
    });

    const recetasRestantes = await prismaTest.receta.count({
      where: { insumoId: insumo.id },
    });
    expect(recetasRestantes).toBe(0);

    const insumoBD = await prismaTest.insumo.findUnique({
      where: { id: insumo.id },
    });
    expect(insumoBD!.deletedAt).not.toBeNull();
  });

  it("eliminar insumo no afecta recetas de otros insumos del mismo plato", async () => {
    const { userId } = await crearUsuarioPrueba();
    const pollo = await crearInsumoPrueba(userId, { nombre: "Pollo" });
    const arroz = await crearInsumoPrueba(userId, { nombre: "Arroz" });
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });

    await prismaTest.receta.createMany({
      data: [
        { userId, platoId: plato.id, insumoId: pollo.id, cantidad: 200, unidad: "GRAMO" },
        { userId, platoId: plato.id, insumoId: arroz.id, cantidad: 100, unidad: "GRAMO" },
      ],
    });

    await prismaTest.$transaction(async (tx) => {
      await tx.receta.deleteMany({ where: { insumoId: pollo.id, userId } });
      await tx.insumo.update({
        where: { id: pollo.id },
        data: { deletedAt: new Date() },
      });
    });

    const recetasArroz = await prismaTest.receta.findMany({
      where: { insumoId: arroz.id },
    });
    expect(recetasArroz).toHaveLength(1);
  });

  it("Decimal precision: receta con cantidad 0.001 KG se guarda exactamente, sin pérdida flotante", async () => {
    // Crítico: Prisma.Decimal debe preservar precisión exacta.
    // Bug histórico — usar new Prisma.Decimal(string) en lugar de Number().
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { unidadBase: "KILOGRAMO" });
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });

    await prismaTest.receta.create({
      data: {
        userId,
        platoId: plato.id,
        insumoId: insumo.id,
        cantidad: new Prisma.Decimal("0.001"),
        unidad: "KILOGRAMO",
      },
    });

    const receta = await prismaTest.receta.findFirst({
      where: { platoId: plato.id, insumoId: insumo.id },
    });

    expect(receta!.cantidad.toString()).toBe("0.001");
  });

  it("BD acepta cantidad <= 0 en receta (la validación vive en la Server Action, no en el schema)", async () => {
    // Documenta explícitamente que la BD NO protege contra cantidades inválidas.
    // toPositiveDecimal() en saveRecipeComplete es la única defensa — esta prueba
    // verifica que esa defensa NO debe removerse, porque atrás no hay nada.
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId);
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });

    const recetaConCero = await prismaTest.receta.create({
      data: {
        userId,
        platoId: plato.id,
        insumoId: insumo.id,
        cantidad: new Prisma.Decimal("0"),
        unidad: "GRAMO",
      },
    });

    expect(recetaConCero.cantidad.toString()).toBe("0");
    // Si esta prueba algún día falla porque la BD rechaza el 0, se agregó un check
    // a nivel de schema. En ese caso, eliminar este test y celebrar.
  });

  it("rollback transaccional: si falla el segundo paso, el insumo del primer paso no se crea", async () => {
    // Verifica integridad atómica de las transacciones.
    const { userId } = await crearUsuarioPrueba();

    await expect(
      prismaTest.$transaction(async (tx) => {
        await tx.insumo.create({
          data: { userId, nombre: "Insumo en Transacción", unidadBase: "GRAMO" },
        });
        // Forzar error: violación de FK
        await tx.receta.create({
          data: {
            userId,
            platoId: "id-inexistente",
            insumoId: "id-inexistente",
            cantidad: 1,
            unidad: "GRAMO",
          },
        });
      })
    ).rejects.toThrow();

    const insumo = await prismaTest.insumo.findFirst({
      where: { userId, nombre: "Insumo en Transacción" },
    });
    expect(insumo).toBeNull();
  });

  // ─── INTEGRIDAD CON COMPRAS ──────────────────────────────────────────────

  it("soft-delete de insumo con compras asociadas no rompe las compras existentes", async () => {
    const { userId } = await crearUsuarioPrueba();
    const proveedor = await crearProveedorPrueba(userId);
    const insumo = await crearInsumoPrueba(userId);

    const compra = await prismaTest.compra.create({
      data: {
        userId,
        proveedorId: proveedor.id,
        fecha: new Date(),
        total: 50000,
      },
    });
    await prismaTest.compraDetalle.create({
      data: {
        userId,
        compraId: compra.id,
        insumoId: insumo.id,
        cantidad: 10,
        unidad: "KILOGRAMO",
        precioUnitario: 5000,
        total: 50000,
      },
    });

    await prismaTest.insumo.update({
      where: { id: insumo.id },
      data: { deletedAt: new Date() },
    });

    const detalles = await prismaTest.compraDetalle.findMany({
      where: { insumoId: insumo.id },
    });
    expect(detalles).toHaveLength(1);

    const compraEncontrada = await prismaTest.compra.findUnique({
      where: { id: compra.id },
    });
    expect(compraEncontrada).not.toBeNull();
  });

  // ─── CASCADA DE USUARIO ──────────────────────────────────────────────────

  it("eliminar usuario en cascada borra sus insumos", async () => {
    const { userId } = await crearUsuarioPrueba();
    await crearInsumoPrueba(userId, { nombre: "Insumo 1" });
    await crearInsumoPrueba(userId, { nombre: "Insumo 2" });

    await prismaTest.user.delete({ where: { id: userId } });

    const count = await prismaTest.insumo.count({ where: { userId } });
    expect(count).toBe(0);
  });

  // ─── AISLAMIENTO MULTI-TENANT ────────────────────────────────────────────

  it("usuario no puede ver insumos de otro usuario", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    await crearInsumoPrueba(u1, { nombre: "Insumo Privado" });

    const insumosU2 = await prismaTest.insumo.findMany({ where: { userId: u2 } });
    expect(insumosU2).toHaveLength(0);
  });

  // ─── CONCURRENCIA ────────────────────────────────────────────────────────

  it("concurrencia — dos creates simultáneos con mismo nombre: uno gana, el otro falla", async () => {
    const { userId } = await crearUsuarioPrueba();

    const resultados = await Promise.allSettled([
      crearInsumoPrueba(userId, { nombre: "Insumo Concurrente" }),
      crearInsumoPrueba(userId, { nombre: "Insumo Concurrente" }),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const fallidos = resultados.filter((r) => r.status === "rejected");

    expect(exitosos).toHaveLength(1);
    expect(fallidos).toHaveLength(1);

    const count = await prismaTest.insumo.count({
      where: { userId, nombre: "Insumo Concurrente" },
    });
    expect(count).toBe(1);
  });

  it("race condition: crear receta mientras se soft-deletea el insumo asociado", async () => {
    // El usuario en una pestaña crea una receta usando el insumo.
    // En otra pestaña, se soft-deletea ese mismo insumo simultáneamente.
    // Caso real cuando hay agentes concurrentes (humano + chat IA).
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId);
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });

    const [recetaResult, deleteResult] = await Promise.allSettled([
      prismaTest.receta.create({
        data: {
          userId,
          platoId: plato.id,
          insumoId: insumo.id,
          cantidad: 200,
          unidad: "GRAMO",
        },
      }),
      prismaTest.insumo.update({
        where: { id: insumo.id },
        data: { deletedAt: new Date() },
      }),
    ]);

    // Ambas pueden tener éxito (no hay constraint atómico que las bloquee).
    // Esto documenta una limitación real: la receta puede quedar apuntando a un
    // insumo soft-deleted. La defensa correcta vive en la Server Action.
    expect(recetaResult.status).toBe("fulfilled");
    expect(deleteResult.status).toBe("fulfilled");

    const recetaHuerfana = await prismaTest.receta.findFirst({
      where: { platoId: plato.id, insumoId: insumo.id },
      include: { insumo: true },
    });

    expect(recetaHuerfana).not.toBeNull();
    expect(recetaHuerfana!.insumo.deletedAt).not.toBeNull();
    // Documentación: el sistema permite recetas huérfanas a nivel de BD.
    // El cálculo de stock (get-stock-actual.ts) debe filtrar insumos soft-deleted.
  });
});
