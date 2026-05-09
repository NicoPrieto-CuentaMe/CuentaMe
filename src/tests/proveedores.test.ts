import { describe, it, expect, beforeEach } from "vitest";
import { prismaTest } from "./setup";
import { limpiarBD, crearUsuarioPrueba, crearProveedorPrueba } from "./helpers";

beforeEach(async () => {
  await limpiarBD();
});

describe("Proveedores — cobertura exhaustiva", () => {

  // ─── HAPPY PATH ──────────────────────────────────────────────────────────

  it("crea un proveedor con todos los campos correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();

    const proveedor = await prismaTest.proveedor.create({
      data: {
        userId,
        nombre: "Distribuidora El Pollo",
        telefono: "3001234567",
        categorias: ["CARNES", "LACTEOS"],
      },
    });

    expect(proveedor.id).toBeDefined();
    expect(proveedor.nombre).toBe("Distribuidora El Pollo");
    expect(proveedor.telefono).toBe("3001234567");
    expect(proveedor.categorias).toEqual(["CARNES", "LACTEOS"]);
    expect(proveedor.deletedAt).toBeNull();
    expect(proveedor.userId).toBe(userId);
  });

  it("crea un proveedor sin teléfono ni categorías (campos opcionales)", async () => {
    const { userId } = await crearUsuarioPrueba();

    const proveedor = await prismaTest.proveedor.create({
      data: { userId, nombre: "Proveedor Mínimo", categorias: [] },
    });

    expect(proveedor.telefono).toBeNull();
    expect(proveedor.categorias).toEqual([]);
  });

  // ─── CONSTRAINTS ÚNICOS ───────────────────────────────────────────────────

  it("no permite dos proveedores activos con el mismo nombre para el mismo usuario", async () => {
    const { userId } = await crearUsuarioPrueba();

    await prismaTest.proveedor.create({
      data: { userId, nombre: "Proveedor Duplicado", categorias: [] },
    });

    await expect(
      prismaTest.proveedor.create({
        data: { userId, nombre: "Proveedor Duplicado", categorias: [] },
      })
    ).rejects.toThrow();
  });

  it("constraint de nombre es case-insensitive — 'pollo' y 'POLLO' colisionan para el mismo usuario", async () => {
    // El índice SQL es case-insensitive: lower(nombre) unique por userId
    const { userId } = await crearUsuarioPrueba();

    await prismaTest.proveedor.create({
      data: { userId, nombre: "Distribuidora Pollo", categorias: [] },
    });

    await expect(
      prismaTest.proveedor.create({
        data: { userId, nombre: "DISTRIBUIDORA POLLO", categorias: [] },
      })
    ).rejects.toThrow();
  });

  it("permite crear proveedor con el mismo nombre de uno soft-deleted (constraint es parcial)", async () => {
    // El índice único solo aplica a registros con deletedAt IS NULL.
    // Un restaurante puede "borrar" y volver a crear el mismo proveedor.
    const { userId } = await crearUsuarioPrueba();

    const original = await prismaTest.proveedor.create({
      data: { userId, nombre: "Proveedor Reutilizable", categorias: [] },
    });

    await prismaTest.proveedor.update({
      where: { id: original.id },
      data: { deletedAt: new Date() },
    });

    const nuevo = await prismaTest.proveedor.create({
      data: { userId, nombre: "Proveedor Reutilizable", categorias: [] },
    });

    expect(nuevo.id).not.toBe(original.id);
    expect(nuevo.deletedAt).toBeNull();
  });

  it("dos usuarios distintos pueden tener proveedores con el mismo nombre", async () => {
    const { userId: userId1 } = await crearUsuarioPrueba({ email: "user1@test.com" });
    const { userId: userId2 } = await crearUsuarioPrueba({ email: "user2@test.com" });

    const p1 = await prismaTest.proveedor.create({
      data: { userId: userId1, nombre: "La Mejor Carne", categorias: [] },
    });
    const p2 = await prismaTest.proveedor.create({
      data: { userId: userId2, nombre: "La Mejor Carne", categorias: [] },
    });

    expect(p1.id).not.toBe(p2.id);
  });

  it("renombrar proveedor al nombre de otro existente falla con constraint", async () => {
    const { userId } = await crearUsuarioPrueba();

    await prismaTest.proveedor.create({
      data: { userId, nombre: "Proveedor A", categorias: [] },
    });
    const b = await prismaTest.proveedor.create({
      data: { userId, nombre: "Proveedor B", categorias: [] },
    });

    await expect(
      prismaTest.proveedor.update({
        where: { id: b.id },
        data: { nombre: "Proveedor A" },
      })
    ).rejects.toThrow();
  });

  // ─── DATOS LÍMITE ─────────────────────────────────────────────────────────

  it("nombre exactamente en el límite de 100 caracteres se guarda correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const nombreLimite = "A".repeat(100);

    const proveedor = await prismaTest.proveedor.create({
      data: { userId, nombre: nombreLimite, categorias: [] },
    });

    expect(proveedor.nombre).toHaveLength(100);
  });

  it("nombre con caracteres especiales y unicode se guarda correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const nombreUnicode = "🍗 Carnes & Más — José Ñoño";

    const proveedor = await prismaTest.proveedor.create({
      data: { userId, nombre: nombreUnicode, categorias: [] },
    });

    expect(proveedor.nombre).toBe(nombreUnicode);
  });

  it("nombre con caracteres SQL especiales no rompe la BD (Prisma sanitiza)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const nombreMalicioso = "'; DROP TABLE \"Proveedor\";--";

    const proveedor = await prismaTest.proveedor.create({
      data: { userId, nombre: nombreMalicioso, categorias: [] },
    });

    // Si llegamos aquí, Prisma sanitizó correctamente y no hubo inyección
    expect(proveedor.nombre).toBe(nombreMalicioso);

    // Verificar que la tabla sigue intacta
    const count = await prismaTest.proveedor.count({ where: { userId } });
    expect(count).toBe(1);
  });

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  it("proveedor eliminado no aparece en queries que filtran por deletedAt: null", async () => {
    const { userId } = await crearUsuarioPrueba();

    const proveedor = await crearProveedorPrueba(userId, { nombre: "A Eliminar" });

    await prismaTest.proveedor.update({
      where: { id: proveedor.id },
      data: { deletedAt: new Date() },
    });

    const activos = await prismaTest.proveedor.findMany({
      where: { userId, deletedAt: null },
    });

    expect(activos.find((p) => p.id === proveedor.id)).toBeUndefined();
  });

  it("proveedor soft-deleted sigue existiendo en BD con deletedAt seteado", async () => {
    const { userId } = await crearUsuarioPrueba();
    const proveedor = await crearProveedorPrueba(userId);

    const ahora = new Date();
    await prismaTest.proveedor.update({
      where: { id: proveedor.id },
      data: { deletedAt: ahora },
    });

    const encontrado = await prismaTest.proveedor.findUnique({
      where: { id: proveedor.id },
    });

    expect(encontrado).not.toBeNull();
    expect(encontrado!.deletedAt).not.toBeNull();
  });

  it("proveedor soft-deleted puede restaurarse poniendo deletedAt a null", async () => {
    const { userId } = await crearUsuarioPrueba();
    const proveedor = await crearProveedorPrueba(userId);

    await prismaTest.proveedor.update({
      where: { id: proveedor.id },
      data: { deletedAt: new Date() },
    });

    await prismaTest.proveedor.update({
      where: { id: proveedor.id },
      data: { deletedAt: null },
    });

    const restaurado = await prismaTest.proveedor.findFirst({
      where: { id: proveedor.id, deletedAt: null },
    });

    expect(restaurado).not.toBeNull();
  });

  // ─── INTEGRIDAD REFERENCIAL ───────────────────────────────────────────────

  it("eliminar usuario en cascada borra sus proveedores", async () => {
    const { userId } = await crearUsuarioPrueba();

    await crearProveedorPrueba(userId, { nombre: "Proveedor 1" });
    await crearProveedorPrueba(userId, { nombre: "Proveedor 2" });

    const antesCount = await prismaTest.proveedor.count({ where: { userId } });
    expect(antesCount).toBe(2);

    await prismaTest.user.delete({ where: { id: userId } });

    const despuesCount = await prismaTest.proveedor.count({ where: { userId } });
    expect(despuesCount).toBe(0);
  });

  it("soft-delete de proveedor con compras asociadas no rompe las compras existentes", async () => {
    const { userId } = await crearUsuarioPrueba();
    const proveedor = await crearProveedorPrueba(userId);

    // Crear una compra mínima asociada al proveedor
    await prismaTest.compra.create({
      data: {
        userId,
        proveedorId: proveedor.id,
        fecha: new Date(),
        total: 50000,
      },
    });

    // Soft-delete del proveedor
    await prismaTest.proveedor.update({
      where: { id: proveedor.id },
      data: { deletedAt: new Date() },
    });

    // La compra debe seguir existiendo
    const compras = await prismaTest.compra.findMany({
      where: { userId, proveedorId: proveedor.id },
    });
    expect(compras).toHaveLength(1);
  });

  // ─── AISLAMIENTO MULTI-TENANT ─────────────────────────────────────────────

  it("usuario no puede ver proveedores de otro usuario", async () => {
    const { userId: userId1 } = await crearUsuarioPrueba({ email: "restaurante1@test.com" });
    const { userId: userId2 } = await crearUsuarioPrueba({ email: "restaurante2@test.com" });

    await crearProveedorPrueba(userId1, { nombre: "Mi Proveedor Secreto" });

    const proveedoresUser2 = await prismaTest.proveedor.findMany({
      where: { userId: userId2 },
    });

    expect(proveedoresUser2).toHaveLength(0);
  });

  it("concurrencia — dos creates simultáneos con el mismo nombre: uno gana, el otro falla", async () => {
    // Simula dos requests llegando en paralelo para crear el mismo proveedor.
    // El constraint único de Postgres garantiza atomicidad — solo uno puede ganar.
    const { userId } = await crearUsuarioPrueba();

    const resultados = await Promise.allSettled([
      prismaTest.proveedor.create({
        data: { userId, nombre: "Proveedor Concurrente", categorias: [] },
      }),
      prismaTest.proveedor.create({
        data: { userId, nombre: "Proveedor Concurrente", categorias: [] },
      }),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const fallidos = resultados.filter((r) => r.status === "rejected");

    // Exactamente uno debe haber ganado
    expect(exitosos).toHaveLength(1);
    expect(fallidos).toHaveLength(1);

    // Solo un registro en BD
    const count = await prismaTest.proveedor.count({
      where: { userId, nombre: "Proveedor Concurrente" },
    });
    expect(count).toBe(1);
  });
});
