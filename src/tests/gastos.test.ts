import { describe, it, expect, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaTest } from "./setup";
import { limpiarBD, crearUsuarioPrueba } from "./helpers";

beforeEach(async () => {
  await limpiarBD();
});

// ─── HELPER LOCAL ─────────────────────────────────────────────────────────────

async function crearGastoPrueba(
  userId: string,
  overrides?: {
    fecha?: Date;
    categoria?: string;
    monto?: number | string;
    periodicidad?: string;
    metodoPago?: string;
    notas?: string;
  }
) {
  return prismaTest.gastoFijo.create({
    data: {
      userId,
      fecha: overrides?.fecha ?? new Date(),
      categoria: (overrides?.categoria ?? "ARRIENDO") as never,
      monto: new Prisma.Decimal(String(overrides?.monto ?? "500000")),
      periodicidad: (overrides?.periodicidad ?? "MENSUAL") as never,
      metodoPago: (overrides?.metodoPago ?? "EFECTIVO") as never,
      notas: overrides?.notas ?? null,
    },
  });
}

// ─── HAPPY PATH ───────────────────────────────────────────────────────────────

describe("GastoFijo — cobertura exhaustiva", () => {

  it("crea un gasto con todos los campos correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();

    const gasto = await crearGastoPrueba(userId, {
      categoria: "SERVICIOS_PUBLICOS",
      monto: "250000",
      periodicidad: "MENSUAL",
      metodoPago: "TRANSFERENCIA",
      notas: "Factura de agosto",
    });

    expect(gasto.id).toBeDefined();
    expect(gasto.categoria).toBe("SERVICIOS_PUBLICOS");
    expect(Number(gasto.monto)).toBe(250000);
    expect(gasto.periodicidad).toBe("MENSUAL");
    expect(gasto.metodoPago).toBe("TRANSFERENCIA");
    expect(gasto.notas).toBe("Factura de agosto");
    expect(gasto.userId).toBe(userId);
  });

  it("crea un gasto sin notas (campo opcional)", async () => {
    const { userId } = await crearUsuarioPrueba();

    const gasto = await crearGastoPrueba(userId);
    expect(gasto.notas).toBeNull();
  });

  it("permite múltiples gastos del mismo tipo en el mismo día — no hay unique constraint", async () => {
    // DIFERENCIA CRÍTICA con otros modelos: GastoFijo no tiene @@unique.
    // El mismo arriendo puede registrarse dos veces por accidente sin error.
    // La protección contra duplicados vive solo en la UX, no en la BD.
    const { userId } = await crearUsuarioPrueba();
    const hoy = new Date();

    const g1 = await crearGastoPrueba(userId, { fecha: hoy, categoria: "ARRIENDO", monto: "800000" });
    const g2 = await crearGastoPrueba(userId, { fecha: hoy, categoria: "ARRIENDO", monto: "800000" });

    expect(g1.id).not.toBe(g2.id);
    const count = await prismaTest.gastoFijo.count({ where: { userId } });
    expect(count).toBe(2);
  });

  // ─── DECIMAL PRECISION ────────────────────────────────────────────────────

  it("monto Decimal(12,2) preserva exactamente 2 decimales: 15000.50", async () => {
    const { userId } = await crearUsuarioPrueba();
    const gasto = await crearGastoPrueba(userId, { monto: "15000.50" });

    expect(Number(gasto.monto)).toBe(15000.5);
    // Verifica que no hay pérdida de precisión de coma flotante
    expect(gasto.monto.toString()).toMatch(/^15000\.5/);
  });

  it("monto grande con centavos: 99999999.99 exacto", async () => {
    const { userId } = await crearUsuarioPrueba();
    const gasto = await crearGastoPrueba(userId, { monto: "99999999.99" });

    expect(Number(gasto.monto)).toBeCloseTo(99999999.99, 2);
  });

  // ─── VALIDACIONES SOLO EN ACTION — BD ACEPTA SIN PROTECCIÓN ──────────────

  it("BD acepta monto $0 — la validación 'mayor a 0' es solo en la Action", async () => {
    const { userId } = await crearUsuarioPrueba();
    const gasto = await crearGastoPrueba(userId, { monto: "0" });

    expect(Number(gasto.monto)).toBe(0);
    // Si esta prueba algún día falla, el schema tiene CHECK (monto > 0). Celebrar.
  });

  it("BD acepta monto negativo — la validación es solo en la Action", async () => {
    // Un monto negativo hace que el balance del día sea incorrecto:
    // getMetricasDia suma todos los gastos del día incluyendo negativos.
    const { userId } = await crearUsuarioPrueba();
    const gasto = await crearGastoPrueba(userId, { monto: "-50000" });

    expect(Number(gasto.monto)).toBe(-50000);
  });

  it("BD acepta fecha muy antigua (hace 50 años) — el rango de 10 años es solo en la Action", async () => {
    const { userId } = await crearUsuarioPrueba();
    const hace50Anos = new Date();
    hace50Anos.setFullYear(hace50Anos.getFullYear() - 50);

    const gasto = await crearGastoPrueba(userId, { fecha: hace50Anos });
    expect(gasto.fecha).toBeDefined();
  });

  it("BD acepta fecha muy futura (en 2 años) — el límite de 30 días es solo en la Action", async () => {
    const { userId } = await crearUsuarioPrueba();
    const en2Anos = new Date();
    en2Anos.setFullYear(en2Anos.getFullYear() + 2);

    const gasto = await crearGastoPrueba(userId, { fecha: en2Anos });
    expect(gasto.fecha).toBeDefined();
  });

  // ─── ENUMS ────────────────────────────────────────────────────────────────

  it("categoría fuera del enum → Postgres rechaza", async () => {
    const { userId } = await crearUsuarioPrueba();

    await expect(
      crearGastoPrueba(userId, { categoria: "CATEGORIA_INVENTADA" })
    ).rejects.toThrow();
  });

  it("periodicidad fuera del enum → Postgres rechaza", async () => {
    const { userId } = await crearUsuarioPrueba();

    await expect(
      crearGastoPrueba(userId, { periodicidad: "CADA_100_ANOS" })
    ).rejects.toThrow();
  });

  it("metodoPago fuera del enum → Postgres rechaza", async () => {
    const { userId } = await crearUsuarioPrueba();

    await expect(
      crearGastoPrueba(userId, { metodoPago: "BITCOIN" })
    ).rejects.toThrow();
  });

  // ─── HARD DELETE — SIN SOFT DELETE ───────────────────────────────────────

  it("deleteMany elimina el gasto permanentemente — no existe soft delete en GastoFijo", async () => {
    // DIFERENCIA CRÍTICA: GastoFijo no tiene deletedAt.
    // A diferencia de Proveedor, Insumo o Plato, un gasto eliminado no puede recuperarse.
    const { userId } = await crearUsuarioPrueba();
    const gasto = await crearGastoPrueba(userId);

    await prismaTest.gastoFijo.deleteMany({ where: { id: gasto.id, userId } });

    const encontrado = await prismaTest.gastoFijo.findUnique({
      where: { id: gasto.id },
    });
    expect(encontrado).toBeNull();
  });

  it("deleteMany con userId incorrecto no elimina registros de otros usuarios", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const gasto = await crearGastoPrueba(u1);

    // u2 intenta borrar el gasto de u1 — no debe afectarlo
    const result = await prismaTest.gastoFijo.deleteMany({
      where: { id: gasto.id, userId: u2 },
    });
    expect(result.count).toBe(0);

    const intacto = await prismaTest.gastoFijo.findUnique({ where: { id: gasto.id } });
    expect(intacto).not.toBeNull();
  });

  it("updateMany con userId incorrecto no modifica registros de otros usuarios", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const gastoOriginal = await crearGastoPrueba(u1, { monto: "100000" });

    // u2 intenta modificar el gasto de u1
    const result = await prismaTest.gastoFijo.updateMany({
      where: { id: gastoOriginal.id, userId: u2 },
      data: { monto: new Prisma.Decimal("999999") },
    });
    expect(result.count).toBe(0);

    const gastoIntacto = await prismaTest.gastoFijo.findUnique({
      where: { id: gastoOriginal.id },
    });
    expect(Number(gastoIntacto!.monto)).toBe(100000);
  });

  // ─── CASCADE ──────────────────────────────────────────────────────────────

  it("eliminar usuario en cascada borra todos sus gastos", async () => {
    const { userId } = await crearUsuarioPrueba();
    await crearGastoPrueba(userId, { categoria: "ARRIENDO" });
    await crearGastoPrueba(userId, { categoria: "TECNOLOGIA" });
    await crearGastoPrueba(userId, { categoria: "TRANSPORTE" });

    await prismaTest.user.delete({ where: { id: userId } });

    const count = await prismaTest.gastoFijo.count({ where: { userId } });
    expect(count).toBe(0);
  });

  // ─── AISLAMIENTO MULTI-TENANT ─────────────────────────────────────────────

  it("usuario no puede ver gastos de otro usuario", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    await crearGastoPrueba(u1, { monto: "1000000" });
    await crearGastoPrueba(u1, { monto: "500000" });

    const gastosU2 = await prismaTest.gastoFijo.findMany({ where: { userId: u2 } });
    expect(gastosU2).toHaveLength(0);
  });

  // ─── CONCURRENCIA ─────────────────────────────────────────────────────────

  it("concurrencia — dos creates simultáneos del mismo gasto: ambos aceptados (sin unique constraint)", async () => {
    // A diferencia de Proveedor/Insumo, GastoFijo no tiene constraint único.
    // Dos requests simultáneas crean dos registros independientes — duplicados reales.
    const { userId } = await crearUsuarioPrueba();

    const resultados = await Promise.allSettled([
      crearGastoPrueba(userId, { categoria: "NOMINA", monto: "1800000" }),
      crearGastoPrueba(userId, { categoria: "NOMINA", monto: "1800000" }),
    ]);

    // Ambos deben tener éxito — no hay constraint que bloquee
    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);

    const count = await prismaTest.gastoFijo.count({
      where: { userId, categoria: "NOMINA" },
    });
    expect(count).toBe(2);
  });

  // ─── INTEGRIDAD ADICIONAL ─────────────────────────────────────────────────

  it("updatedAt se actualiza automáticamente en cada update", async () => {
    const { userId } = await crearUsuarioPrueba();
    const gasto = await crearGastoPrueba(userId);
    const originalUpdatedAt = gasto.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const actualizado = await prismaTest.gastoFijo.update({
      where: { id: gasto.id },
      data: { monto: new Prisma.Decimal("600000") },
    });

    expect(actualizado.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it("notas con caracteres SQL especiales no rompe la BD", async () => {
    const { userId } = await crearUsuarioPrueba();
    const notasMaliciosa = "'; DROP TABLE \"GastoFijo\";-- Nota legítima";

    const gasto = await crearGastoPrueba(userId, { notas: notasMaliciosa });
    expect(gasto.notas).toBe(notasMaliciosa);

    const count = await prismaTest.gastoFijo.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it("rollback transaccional: si falla el segundo gasto en un batch, el primero también revierte", async () => {
    const { userId } = await crearUsuarioPrueba();

    await expect(
      prismaTest.$transaction(async (tx) => {
        await tx.gastoFijo.create({
          data: {
            userId,
            fecha: new Date(),
            categoria: "ARRIENDO",
            monto: new Prisma.Decimal("800000"),
            periodicidad: "MENSUAL",
            metodoPago: "EFECTIVO",
          },
        });
        // Forzar error con categoría inválida
        await tx.gastoFijo.create({
          data: {
            userId,
            fecha: new Date(),
            // @ts-expect-error — probando rollback con enum inválido
            categoria: "CATEGORIA_INVALIDA",
            monto: new Prisma.Decimal("100000"),
            periodicidad: "MENSUAL",
            metodoPago: "EFECTIVO",
          },
        });
      })
    ).rejects.toThrow();

    const count = await prismaTest.gastoFijo.count({ where: { userId } });
    expect(count).toBe(0);
  });
});

// ─── ESCENARIOS DE ALTO RIESGO PARA EL NEGOCIO ────────────────────────────────

describe("GastoFijo — escenarios de estrés con impacto en reportes", () => {

  it("duplicados accidentales se suman dos veces en agregados — el bug llega al balance del día", async () => {
    // Caso real: el dueño registra el arriendo, no ve el toast de éxito,
    // y vuelve a registrarlo. Sin unique constraint, ambos registros existen
    // y getMetricasDia los suma. El balance del día queda mal.
    const { userId } = await crearUsuarioPrueba();
    const hoy = new Date();

    await crearGastoPrueba(userId, { fecha: hoy, categoria: "ARRIENDO", monto: "800000" });
    await crearGastoPrueba(userId, { fecha: hoy, categoria: "ARRIENDO", monto: "800000" });

    // Reproducir el agregado que hace getMetricasDia
    const gastosDelDia = await prismaTest.gastoFijo.findMany({
      where: {
        userId,
        fecha: {
          gte: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0),
          lte: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59),
        },
      },
    });

    const totalDelDia = gastosDelDia.reduce((sum, g) => sum + Number(g.monto), 0);

    // El total muestra el bug: $1.600.000 cuando debería ser $800.000
    expect(totalDelDia).toBe(1600000);
    // Documenta el riesgo: la única defensa es la UX (confirmación, debounce de doble-submit).
  });

  it("zona horaria: gasto a las 19:00 hora Colombia se almacena como día siguiente en UTC", async () => {
    // Postgres almacena DateTime en UTC. Colombia es UTC-5.
    // Si la app envía fecha local sin convertir, el agregado por día puede equivocarse.
    // Esta prueba documenta el comportamiento esperado para que cualquier query agregada
    // tenga en cuenta el offset de Colombia.
    const { userId } = await crearUsuarioPrueba();

    // 2026-01-15 19:00 hora Colombia = 2026-01-16 00:00 UTC
    const fechaColombia7pm = new Date("2026-01-16T00:00:00.000Z");
    const gasto = await crearGastoPrueba(userId, {
      fecha: fechaColombia7pm,
      monto: "100000",
    });

    // El gasto guardado representa el 16 de enero en UTC
    expect(gasto.fecha.getUTCDate()).toBe(16);
    expect(gasto.fecha.getUTCHours()).toBe(0);

    // Si filtraramos por "15 de enero hora Colombia" usando fecha UTC sin convertir,
    // este gasto NO aparecería — aunque para el dueño SÍ es un gasto del 15 de enero.
    // Esto es por qué metricas-dia.ts aplica CO_OFFSET_MS antes de calcular el rango del día.
  });

  it("Decimal(12,2) acepta montos hasta 9.999.999.999,99 — la Action limita a 99M, la BD a 10 mil millones", async () => {
    // El schema declara Decimal(12,2) = 10 dígitos enteros + 2 decimales.
    // Si alguien bypassa la Action (chat IA con monto inválido, o tool externa),
    // la BD acepta hasta 9999999999.99 ($9.999 millones), 100x más que el límite del Action.
    const { userId } = await crearUsuarioPrueba();

    const gastoExtremo = await crearGastoPrueba(userId, { monto: "9999999999.99" });
    expect(Number(gastoExtremo.monto)).toBeCloseTo(9999999999.99, 1);
  });

  it("Decimal(12,2) rechaza montos con más de 10 dígitos enteros (overflow)", async () => {
    // Aquí sí hay protección de Postgres: 11 dígitos enteros excede Decimal(12,2).
    const { userId } = await crearUsuarioPrueba();

    await expect(
      crearGastoPrueba(userId, { monto: "10000000000.00" })
    ).rejects.toThrow();
  });

  it("update directo de userId está permitido por la BD — el aislamiento depende de filtros en el WHERE", async () => {
    // ESCAPE TEÓRICO de aislamiento multi-tenant:
    // No hay constraint que prevenga reasignar un gasto a otro usuario.
    // La defensa vive en cada Action que filtra por userId en el where antes de actualizar.
    // Si un Server Action olvidara ese filtro, este escape sería real.
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const gasto = await crearGastoPrueba(u1, { monto: "500000" });

    // BD permite el cambio de propietario — protección solo en código de Actions
    await prismaTest.gastoFijo.update({
      where: { id: gasto.id },
      data: { userId: u2 },
    });

    const reasignado = await prismaTest.gastoFijo.findUnique({ where: { id: gasto.id } });
    expect(reasignado!.userId).toBe(u2);
    // Documenta: cada Action DEBE filtrar por userId en el where antes de update/delete.
  });

  it("update concurrente con delete — quien gana depende del orden de commit, sin error confuso", async () => {
    // Caso real: dueño edita gasto en una pestaña, lo elimina desde otra.
    // updateMany retorna count:0 si el registro ya no existe — no lanza excepción.
    const { userId } = await crearUsuarioPrueba();
    const gasto = await crearGastoPrueba(userId, { monto: "100000" });

    // Borrar primero, luego intentar actualizar
    await prismaTest.gastoFijo.deleteMany({ where: { id: gasto.id, userId } });
    const result = await prismaTest.gastoFijo.updateMany({
      where: { id: gasto.id, userId },
      data: { monto: new Prisma.Decimal("999999") },
    });

    expect(result.count).toBe(0);
    // No throw — la Action correctamente devuelve "Gasto no encontrado" en este caso.
  });

  it("BD acepta notas más largas que 500 caracteres — el límite es solo en la Action", async () => {
    // String? en Prisma → TEXT en Postgres → sin límite de longitud en BD.
    // La Action enforce MAX_NOTAS=500 pero el schema permite cualquier longitud.
    // Bypass posible vía chat IA si la tool no respeta el límite.
    const { userId } = await crearUsuarioPrueba();
    const notas10k = "a".repeat(10000);

    const gasto = await crearGastoPrueba(userId, { notas: notas10k });
    expect(gasto.notas).toHaveLength(10000);
    // Riesgo: notas gigantes consumen storage y pueden afectar performance de queries.
  });
});
