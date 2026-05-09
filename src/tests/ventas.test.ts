import { describe, it, expect, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaTest } from "./setup";
import { limpiarBD, crearUsuarioPrueba, crearPlatoPrueba } from "./helpers";

beforeEach(async () => {
  await limpiarBD();
});

// ─── HELPERS LOCALES ─────────────────────────────────────────────────────────

async function crearVentaSimple(
  userId: string,
  overrides?: {
    fecha?: Date;
    hora?: string;
    tipo?: string;
    canal?: string | null;
    total?: string;
    metodoPago?: string;
  }
) {
  return prismaTest.venta.create({
    data: {
      userId,
      fecha: overrides?.fecha ?? new Date(),
      hora: overrides?.hora ?? "12:00",
      tipo: (overrides?.tipo ?? "MESA") as never,
      canal: (overrides?.canal ?? null) as never,
      total: new Prisma.Decimal(overrides?.total ?? "25000"),
      metodoPago: (overrides?.metodoPago ?? "EFECTIVO") as never,
    },
  });
}

async function crearVentaCompleta(
  userId: string,
  platos: Array<{ platoId: string; cantidad: number; precioUnitario: string }>
) {
  let total = new Prisma.Decimal(0);
  for (const p of platos) {
    total = total.add(new Prisma.Decimal(p.precioUnitario).mul(p.cantidad));
  }

  return prismaTest.$transaction(async (tx) => {
    const venta = await tx.venta.create({
      data: {
        userId,
        fecha: new Date(),
        hora: "12:00",
        tipo: "MESA",
        total,
        metodoPago: "EFECTIVO",
      },
    });
    await tx.detalleVenta.createMany({
      data: platos.map((p) => ({
        userId,
        ventaId: venta.id,
        platoId: p.platoId,
        cantidad: p.cantidad,
        precioUnitario: new Prisma.Decimal(p.precioUnitario),
      })),
    });
    return venta;
  });
}

// ─── HAPPY PATH ───────────────────────────────────────────────────────────────

describe("Ventas — cobertura exhaustiva", () => {

  it("crea una venta MESA con detalle correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });

    const venta = await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 2, precioUnitario: "25000" },
    ]);

    expect(venta.id).toBeDefined();
    expect(venta.tipo).toBe("MESA");
    expect(Number(venta.total)).toBe(50000);
    expect(venta.canal).toBeNull();

    const detalles = await prismaTest.detalleVenta.findMany({
      where: { ventaId: venta.id },
    });
    expect(detalles).toHaveLength(1);
    expect(detalles[0].cantidad).toBe(2);
    expect(Number(detalles[0].precioUnitario)).toBe(25000);
  });

  it("crea una venta DOMICILIO con canal RAPPI correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();

    const venta = await prismaTest.venta.create({
      data: {
        userId,
        fecha: new Date(),
        hora: "19:30",
        tipo: "DOMICILIO",
        canal: "RAPPI",
        total: new Prisma.Decimal("35000"),
        metodoPago: "NEQUI",
      },
    });

    expect(venta.tipo).toBe("DOMICILIO");
    expect(venta.canal).toBe("RAPPI");
    expect(venta.metodoPago).toBe("NEQUI");
  });

  it("crea una venta PARA_LLEVAR sin canal correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const venta = await crearVentaSimple(userId, { tipo: "PARA_LLEVAR" });

    expect(venta.tipo).toBe("PARA_LLEVAR");
    expect(venta.canal).toBeNull();
  });

  it("venta con múltiples platos calcula total correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato1 = await crearPlatoPrueba(userId, { nombre: "Bandeja Paisa", precioVenta: 25000 });
    const plato2 = await crearPlatoPrueba(userId, { nombre: "Jugo", precioVenta: 5000 });

    const venta = await crearVentaCompleta(userId, [
      { platoId: plato1.id, cantidad: 2, precioUnitario: "25000" },
      { platoId: plato2.id, cantidad: 3, precioUnitario: "5000" },
    ]);

    // 2*25000 + 3*5000 = 50000 + 15000 = 65000
    expect(Number(venta.total)).toBe(65000);

    const detalles = await prismaTest.detalleVenta.findMany({
      where: { ventaId: venta.id },
    });
    expect(detalles).toHaveLength(2);
  });

  // ─── PRECIOUNITARIO CONGELADO ─────────────────────────────────────────────

  it("precioUnitario en DetalleVenta se congela al momento de la venta — cambio de precio del plato no afecta historial", async () => {
    // CRÍTICO: el historial de ventas debe mostrar el precio EN EL MOMENTO de la venta,
    // no el precio actual del plato. Esta es la garantía más importante del módulo.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });

    const venta = await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    // Cambiar el precio del plato después de la venta
    await prismaTest.plato.update({
      where: { id: plato.id },
      data: { precioVenta: new Prisma.Decimal("40000") },
    });

    // El detalle histórico debe mantener el precio original
    const detalle = await prismaTest.detalleVenta.findFirst({
      where: { ventaId: venta.id },
    });
    expect(Number(detalle!.precioUnitario)).toBe(25000);
    expect(Number(detalle!.precioUnitario)).not.toBe(40000);
  });

  // ─── VALIDACIONES SOLO EN ACTION — BD ACEPTA SIN PROTECCIÓN ──────────────

  it("BD acepta total desincronizado de la suma de detalles — no hay constraint de integridad", async () => {
    // RIESGO: si la Action tiene un bug en el cálculo del total, la BD lo acepta.
    // El total puede ser $0 aunque los detalles sumen $100.000.
    // El único guardián es el cálculo correcto en buildValidVentaLinesFromParsed.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });

    const venta = await prismaTest.venta.create({
      data: {
        userId, fecha: new Date(), hora: "12:00", tipo: "MESA",
        total: new Prisma.Decimal("0"), // total = $0 aunque el detalle sea $25.000
        metodoPago: "EFECTIVO",
      },
    });
    await prismaTest.detalleVenta.create({
      data: {
        userId, ventaId: venta.id, platoId: plato.id,
        cantidad: 1, precioUnitario: new Prisma.Decimal("25000"),
      },
    });

    const ventaGuardada = await prismaTest.venta.findUnique({ where: { id: venta.id } });
    expect(Number(ventaGuardada!.total)).toBe(0); // BD acepta la inconsistencia
  });

  it("BD acepta canal en venta MESA — la validación 'canal solo para DOMICILIO' es solo en la Action", async () => {
    const { userId } = await crearUsuarioPrueba();

    const venta = await crearVentaSimple(userId, {
      tipo: "MESA",
      canal: "RAPPI", // Canal en una venta de mesa — inválido de negocio pero la BD acepta
    });

    expect(venta.tipo).toBe("MESA");
    expect(venta.canal).toBe("RAPPI");
  });

  it("BD acepta DOMICILIO sin canal — la obligatoriedad del canal es solo en la Action", async () => {
    const { userId } = await crearUsuarioPrueba();

    const venta = await crearVentaSimple(userId, {
      tipo: "DOMICILIO",
      canal: null, // DOMICILIO sin canal — inválido de negocio, BD acepta
    });

    expect(venta.tipo).toBe("DOMICILIO");
    expect(venta.canal).toBeNull();
  });

  it("BD acepta cantidad 0 en DetalleVenta — la validación MIN_CANT=1 es solo en la Action", async () => {
    // cantidad = 0 implica que la venta contribuye $0 al total aunque el plato cueste $25.000.
    // Riesgo: stock calculado multiplica receta * cantidad vendida = 0 → no descuenta stock.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId);
    const venta = await crearVentaSimple(userId);

    const detalle = await prismaTest.detalleVenta.create({
      data: {
        userId, ventaId: venta.id, platoId: plato.id,
        cantidad: 0, precioUnitario: new Prisma.Decimal("25000"),
      },
    });

    expect(detalle.cantidad).toBe(0);
  });

  it("BD acepta cantidad negativa en DetalleVenta — stock calculado quedaría incorrecto", async () => {
    // cantidad negativa → el stock calculado AUMENTA en lugar de descontar.
    // Resultado: inventario fantasma que no existe en realidad.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId);
    const venta = await crearVentaSimple(userId);

    const detalle = await prismaTest.detalleVenta.create({
      data: {
        userId, ventaId: venta.id, platoId: plato.id,
        cantidad: -5, precioUnitario: new Prisma.Decimal("25000"),
      },
    });

    expect(detalle.cantidad).toBe(-5);
  });

  it("BD acepta venta sin detalles — MIN_LINEAS=1 es solo en la Action", async () => {
    // Una venta sin detalles tiene total pero no hay evidencia de qué se vendió.
    // El stock calculado no descuenta nada. Solo la Action previene esto.
    const { userId } = await crearUsuarioPrueba();
    const venta = await crearVentaSimple(userId, { total: "50000" });

    const detalles = await prismaTest.detalleVenta.findMany({
      where: { ventaId: venta.id },
    });
    expect(detalles).toHaveLength(0);

    const ventaGuardada = await prismaTest.venta.findUnique({ where: { id: venta.id } });
    expect(Number(ventaGuardada!.total)).toBe(50000);
  });

  it("hora es campo texto libre en BD — cualquier string es aceptado", async () => {
    // La Action valida HH:MM 24h, pero la BD almacena cualquier string.
    // Bypass posible via chat IA si el tool pasa hora inválida.
    const { userId } = await crearUsuarioPrueba();

    const venta = await crearVentaSimple(userId, { hora: "hora-invalida" });
    expect(venta.hora).toBe("hora-invalida");
  });

  it("BD acepta plato de otro usuario en DetalleVenta — escape de aislamiento a nivel schema", async () => {
    // No hay FK que valide userId del plato == userId del DetalleVenta.
    // Si la Action omitiera el filtro userId en buildValidVentaLinesFromParsed,
    // un usuario podría ver platos de otro en sus ventas.
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    const platoDeU2 = await crearPlatoPrueba(u2, { nombre: "Plato de U2" });
    const ventaDeU1 = await crearVentaSimple(u1);

    // U1 crea un detalle con un plato que pertenece a U2
    const detalle = await prismaTest.detalleVenta.create({
      data: {
        userId: u1,
        ventaId: ventaDeU1.id,
        platoId: platoDeU2.id,
        cantidad: 1,
        precioUnitario: new Prisma.Decimal("25000"),
      },
    });

    expect(detalle.platoId).toBe(platoDeU2.id);
    // La BD acepta este estado — la defensa está en el filtro userId en la Action.
  });

  // ─── DECIMAL PRECISION ────────────────────────────────────────────────────

  it("Decimal(10,2) en total preserva exactamente 2 decimales", async () => {
    const { userId } = await crearUsuarioPrueba();
    const venta = await crearVentaSimple(userId, { total: "15750.50" });

    expect(Number(venta.total)).toBe(15750.5);
  });

  it("Decimal(10,2) overflow: total con más de 10 dígitos enteros → Postgres rechaza", async () => {
    const { userId } = await crearUsuarioPrueba();

    await expect(
      crearVentaSimple(userId, { total: "99999999999.00" })
    ).rejects.toThrow();
  });

  // ─── TRANSACCIONES E INTEGRIDAD ───────────────────────────────────────────

  it("rollback transaccional: si createMany de detalles falla, la venta tampoco se crea", async () => {
    const { userId } = await crearUsuarioPrueba();

    await expect(
      prismaTest.$transaction(async (tx) => {
        await tx.venta.create({
          data: {
            userId, fecha: new Date(), hora: "12:00", tipo: "MESA",
            total: new Prisma.Decimal("25000"), metodoPago: "EFECTIVO",
          },
        });
        // Forzar fallo con platoId inexistente — FK violation
        await tx.detalleVenta.createMany({
          data: [{
            userId, ventaId: "venta-id-aqui",
            platoId: "plato-que-no-existe",
            cantidad: 1,
            precioUnitario: new Prisma.Decimal("25000"),
          }],
        });
      })
    ).rejects.toThrow();

    const ventas = await prismaTest.venta.findMany({ where: { userId } });
    expect(ventas).toHaveLength(0);
  });

  it("patrón editarVenta: update + deleteMany detalles + createMany nuevos detalles en transacción", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato1 = await crearPlatoPrueba(userId, { nombre: "Plato Original", precioVenta: 25000 });
    const plato2 = await crearPlatoPrueba(userId, { nombre: "Plato Nuevo", precioVenta: 30000 });

    const venta = await crearVentaCompleta(userId, [
      { platoId: plato1.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    // Editar: reemplazar plato1 por plato2
    await prismaTest.$transaction(async (tx) => {
      await tx.venta.update({
        where: { id: venta.id, userId },
        data: { total: new Prisma.Decimal("30000"), metodoPago: "NEQUI" },
      });
      await tx.detalleVenta.deleteMany({ where: { ventaId: venta.id, userId } });
      await tx.detalleVenta.createMany({
        data: [{
          userId, ventaId: venta.id, platoId: plato2.id,
          cantidad: 1, precioUnitario: new Prisma.Decimal("30000"),
        }],
      });
    });

    const detalles = await prismaTest.detalleVenta.findMany({ where: { ventaId: venta.id } });
    expect(detalles).toHaveLength(1);
    expect(detalles[0].platoId).toBe(plato2.id);
    expect(Number(detalles[0].precioUnitario)).toBe(30000);
  });

  it("rollback en editarVenta: si createMany falla, el update de venta también revierte", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });
    const venta = await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);
    const totalOriginal = Number(venta.total);

    await expect(
      prismaTest.$transaction(async (tx) => {
        await tx.venta.update({
          where: { id: venta.id, userId },
          data: { total: new Prisma.Decimal("99999") },
        });
        await tx.detalleVenta.deleteMany({ where: { ventaId: venta.id } });
        await tx.detalleVenta.createMany({
          data: [{
            userId, ventaId: venta.id, platoId: "plato-inexistente",
            cantidad: 1, precioUnitario: new Prisma.Decimal("99999"),
          }],
        });
      })
    ).rejects.toThrow();

    const ventaIntacta = await prismaTest.venta.findUnique({ where: { id: venta.id } });
    expect(Number(ventaIntacta!.total)).toBe(totalOriginal);
  });

  // ─── CASCADE Y FK ─────────────────────────────────────────────────────────

  it("delete venta → DetalleVenta se borra en cascada (onDelete: Cascade)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });
    const venta = await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    await prismaTest.venta.delete({ where: { id: venta.id } });

    const detalles = await prismaTest.detalleVenta.findMany({ where: { ventaId: venta.id } });
    expect(detalles).toHaveLength(0);
  });

  it("cascade usuario → ventas y detalles eliminados", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });
    await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 2, precioUnitario: "25000" },
    ]);
    await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    await prismaTest.user.delete({ where: { id: userId } });

    const ventas = await prismaTest.venta.findMany({ where: { userId } });
    const detalles = await prismaTest.detalleVenta.findMany({ where: { userId } });
    expect(ventas).toHaveLength(0);
    expect(detalles).toHaveLength(0);
  });

  it("hard delete plato con ventas → RESTRICT bloquea (DetalleVenta.platoId sin onDelete)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });
    await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    await expect(
      prismaTest.plato.delete({ where: { id: plato.id } })
    ).rejects.toThrow();
  });

  it("soft delete plato con ventas → historial intacto, plato sigue referenciable", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });
    const venta = await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    await prismaTest.plato.update({
      where: { id: plato.id },
      data: { deletedAt: new Date() },
    });

    const detalle = await prismaTest.detalleVenta.findFirst({ where: { ventaId: venta.id } });
    expect(detalle).not.toBeNull();
    expect(detalle!.platoId).toBe(plato.id);
  });

  // ─── AISLAMIENTO MULTI-TENANT ─────────────────────────────────────────────

  it("usuario no puede ver ventas de otro usuario", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const plato = await crearPlatoPrueba(u1, { precioVenta: 25000 });

    await crearVentaCompleta(u1, [{ platoId: plato.id, cantidad: 1, precioUnitario: "25000" }]);

    const ventasU2 = await prismaTest.venta.findMany({ where: { userId: u2 } });
    expect(ventasU2).toHaveLength(0);
  });

  it("deleteMany con userId incorrecto no elimina ventas de otros", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const plato = await crearPlatoPrueba(u1, { precioVenta: 25000 });
    const venta = await crearVentaCompleta(u1, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    const result = await prismaTest.venta.deleteMany({
      where: { id: venta.id, userId: u2 },
    });
    expect(result.count).toBe(0);

    const intacta = await prismaTest.venta.findUnique({ where: { id: venta.id } });
    expect(intacta).not.toBeNull();
  });

  // ─── CONCURRENCIA ─────────────────────────────────────────────────────────

  it("concurrencia — dos ventas simultáneas del mismo plato: ambas aceptadas (sin unique constraint)", async () => {
    // Correcto para el negocio: dos mesas pueden pedir el mismo plato.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });

    const resultados = await Promise.allSettled([
      crearVentaCompleta(userId, [{ platoId: plato.id, cantidad: 1, precioUnitario: "25000" }]),
      crearVentaCompleta(userId, [{ platoId: plato.id, cantidad: 1, precioUnitario: "25000" }]),
    ]);

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
    const ventas = await prismaTest.venta.findMany({ where: { userId } });
    expect(ventas).toHaveLength(2);
  });

  it("update+delete concurrente de la misma venta — updateMany retorna count:0 si ya fue eliminada", async () => {
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });
    const venta = await crearVentaCompleta(userId, [
      { platoId: plato.id, cantidad: 1, precioUnitario: "25000" },
    ]);

    // Eliminar primero
    await prismaTest.detalleVenta.deleteMany({ where: { ventaId: venta.id } });
    await prismaTest.venta.deleteMany({ where: { id: venta.id } });

    // Intentar actualizar después de eliminar
    const result = await prismaTest.venta.updateMany({
      where: { id: venta.id, userId },
      data: { metodoPago: "NEQUI" },
    });

    expect(result.count).toBe(0);
    // No lanza excepción — la Action correctamente devuelve "Venta no encontrada".
  });
});

// ─── ESCENARIOS MORTALES PARA LA ESTABILIDAD ─────────────────────────────────

describe("Ventas — escenarios de alto riesgo para CuentaMe", () => {

  it("sin @@unique en DetalleVenta: mismo plato puede aparecer dos veces en la misma venta — stock se descuenta doble", async () => {
    // RIESGO CRÍTICO: el chat IA puede reintentar un registro por timeout y crear
    // dos DetalleVenta para el mismo plato en la misma venta. El stock calculado
    // multiplica receta * cantidad * 2 = descuento doble de inventario.
    // La única defensa es la validación de platoIds únicos en la Action y la
    // idempotencia con IdempotencyRecord.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });
    const venta = await crearVentaSimple(userId, { total: "50000" });

    // BD acepta dos detalles con el mismo platoId en la misma venta
    await prismaTest.detalleVenta.createMany({
      data: [
        { userId, ventaId: venta.id, platoId: plato.id, cantidad: 1, precioUnitario: new Prisma.Decimal("25000") },
        { userId, ventaId: venta.id, platoId: plato.id, cantidad: 1, precioUnitario: new Prisma.Decimal("25000") },
      ],
    });

    const detalles = await prismaTest.detalleVenta.findMany({
      where: { ventaId: venta.id, platoId: plato.id },
    });
    expect(detalles).toHaveLength(2); // BD lo acepta — stock se descontaría doble
    // Si esta prueba algún día falla con P2002, se agregó @@unique([ventaId, platoId]).
    // En ese caso eliminar este test y celebrar — el schema creció en protección.
  });

  it("DetalleVenta.userId puede diferir del Venta.userId — no hay constraint que lo prevenga", async () => {
    // RIESGO: bug de refactor en la Action podría pasar userId incorrecto al createMany.
    // Los reportes del dueño quedarían incompletos y los de otro usuario inflados.
    // Esta prueba documenta que el schema no tiene protección — solo el código la tiene.
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const plato = await crearPlatoPrueba(u1, { precioVenta: 25000 });
    const ventaDeU1 = await crearVentaSimple(u1, { total: "25000" });

    // Crear un DetalleVenta con userId de u2 dentro de una venta de u1
    const detalle = await prismaTest.detalleVenta.create({
      data: {
        userId: u2, // userId diferente al de la venta
        ventaId: ventaDeU1.id,
        platoId: plato.id,
        cantidad: 1,
        precioUnitario: new Prisma.Decimal("25000"),
      },
    });

    expect(detalle.userId).toBe(u2);
    expect(detalle.ventaId).toBe(ventaDeU1.id);
    // La BD acepta esta inconsistencia. Si u2 filtra por su userId,
    // verá un detalle que pertenece a la venta de u1.
  });

  it("race condition: plato soft-deleted entre validación y transacción — venta se crea con plato inactivo", async () => {
    // Reproduce el escenario: Action valida platos en findMany, luego crea la venta.
    // Entre esos dos pasos, el plato se soft-deletea. La BD acepta la venta
    // porque DetalleVenta.platoId no filtra por deletedAt.
    // El stock calculado luego puede no encontrar la receta del plato y reportar mal.
    const { userId } = await crearUsuarioPrueba();
    const plato = await crearPlatoPrueba(userId, { precioVenta: 25000 });

    // Simular: paso 1 — validación (plato activo)
    const platoValidado = await prismaTest.plato.findFirst({
      where: { id: plato.id, userId, deletedAt: null },
    });
    expect(platoValidado).not.toBeNull();

    // Simular: entre validación y transacción, alguien soft-deletea el plato
    await prismaTest.plato.update({
      where: { id: plato.id },
      data: { deletedAt: new Date() },
    });

    // Simular: paso 2 — transacción crea la venta con el platoId ya inactivo
    const venta = await prismaTest.$transaction(async (tx) => {
      const v = await tx.venta.create({
        data: {
          userId, fecha: new Date(), hora: "12:00", tipo: "MESA",
          total: new Prisma.Decimal("25000"), metodoPago: "EFECTIVO",
        },
      });
      await tx.detalleVenta.create({
        data: {
          userId, ventaId: v.id, platoId: plato.id, // plato ya soft-deleted
          cantidad: 1, precioUnitario: new Prisma.Decimal("25000"),
        },
      });
      return v;
    });

    // La venta existe con el plato soft-deleted referenciado
    const detalles = await prismaTest.detalleVenta.findMany({ where: { ventaId: venta.id } });
    expect(detalles).toHaveLength(1);
    expect(detalles[0].platoId).toBe(plato.id);

    // El plato referenciado está soft-deleted — stock calculado puede fallar silenciosamente
    const platoEnBD = await prismaTest.plato.findUnique({ where: { id: plato.id } });
    expect(platoEnBD!.deletedAt).not.toBeNull();
  });

  it("plato con precioVenta $0 — venta registrada con total $0 aunque se sirvieron platos reales", async () => {
    // RIESGO DE NEGOCIO: dueño configura mal el precio ($0) y registra ventas.
    // getMetricasDia reporta $0 ese día. El dueño cree que no tuvo ingresos.
    // No hay validación de precio mínimo en la Action — usa lo que tenga el plato.
    const { userId } = await crearUsuarioPrueba();
    const platoGratis = await crearPlatoPrueba(userId, { precioVenta: 0 });

    const venta = await crearVentaCompleta(userId, [
      { platoId: platoGratis.id, cantidad: 5, precioUnitario: "0" },
    ]);

    expect(Number(venta.total)).toBe(0);

    // El agregado del día reflejaría $0 aunque se sirvieron 5 platos
    const totalDelDia = await prismaTest.venta.aggregate({
      where: { userId },
      _sum: { total: true },
    });
    expect(Number(totalDelDia._sum.total)).toBe(0);
  });

  it("venta de un plato tipo COMBO — BD acepta, pero el stock depende de que toda la cadena combo→item→receta esté íntegra", async () => {
    // El stock calculado hace: venta → plato COMBO → comboItems → receta → insumo.
    // Si un combo no tiene items, o los items no tienen receta, el stock no se descuenta.
    // Esta prueba verifica que la BD acepta la venta y documenta la fragilidad de la cadena.
    const { userId } = await crearUsuarioPrueba();

    // Crear un COMBO sin items (combo vacío)
    const combo = await prismaTest.plato.create({
      data: {
        userId,
        nombre: "Combo Sin Items",
        precioVenta: new Prisma.Decimal("30000"),
        tipo: "COMBO",
        tieneReceta: false,
      },
    });

    // La BD acepta la venta del combo vacío sin problema
    const venta = await crearVentaCompleta(userId, [
      { platoId: combo.id, cantidad: 1, precioUnitario: "30000" },
    ]);

    expect(Number(venta.total)).toBe(30000);

    const detalles = await prismaTest.detalleVenta.findMany({ where: { ventaId: venta.id } });
    expect(detalles).toHaveLength(1);
    expect(detalles[0].platoId).toBe(combo.id);

    // El combo existe en la venta pero no tiene items — get-stock-actual.ts
    // no descontaría ningún insumo para esta venta. Stock queda inflado silenciosamente.
    const comboItems = await prismaTest.comboItem.findMany({ where: { comboId: combo.id } });
    expect(comboItems).toHaveLength(0);
  });
});
