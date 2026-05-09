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
import {
  calcularStockReferenciaPorInsumo,
  mapUltimoInventarioPorInsumo,
} from "../lib/inventario-stock-calculado";

beforeEach(async () => {
  await limpiarBD();
});

// ─── HELPER: replica getStockActual usando prismaTest ─────────────────────────

async function getStockParaUsuario(userId: string) {
  const insumos = await prismaTest.insumo.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, nombre: true, unidadBase: true },
  });
  if (insumos.length === 0) return new Map();

  const insumoIds = insumos.map((i) => i.id);

  const invRows = await prismaTest.inventario.findMany({
    where: { userId, insumoId: { in: insumoIds } },
    select: { insumoId: true, fecha: true, stockReal: true },
  });

  const ultimoPorInsumo = mapUltimoInventarioPorInsumo(invRows);

  let fechaMinima: Date | undefined;
  for (const v of Array.from(ultimoPorInsumo.values())) {
    if (!fechaMinima || v.fecha.getTime() < fechaMinima.getTime()) {
      fechaMinima = v.fecha;
    }
  }

  const [compraDetallesRaw, recetas, detalleVentasRaw] = await Promise.all([
    prismaTest.compraDetalle.findMany({
      where: {
        userId,
        insumoId: { in: insumoIds },
        ...(fechaMinima ? { compra: { fecha: { gte: fechaMinima } } } : {}),
      },
      select: {
        insumoId: true, cantidad: true, unidad: true,
        compra: { select: { fecha: true } },
      },
    }),
    prismaTest.receta.findMany({
      where: { userId, insumoId: { in: insumoIds } },
      select: { platoId: true, insumoId: true, cantidad: true, unidad: true },
    }),
    prismaTest.detalleVenta.findMany({
      where: {
        userId,
        ...(fechaMinima ? { venta: { fecha: { gte: fechaMinima } } } : {}),
      },
      select: {
        platoId: true, cantidad: true,
        venta: { select: { fecha: true } },
      },
    }),
  ]);

  const platoIdsVendidos = [...new Set(detalleVentasRaw.map((d) => d.platoId))];
  const comboItems = platoIdsVendidos.length
    ? await prismaTest.comboItem.findMany({
        where: { userId, comboId: { in: platoIdsVendidos } },
        select: { comboId: true, platoId: true, cantidad: true },
      })
    : [];

  const comboIdSet = new Set(comboItems.map((ci) => ci.comboId));

  const recetasPorPlato = new Map<string, typeof recetas>();
  for (const r of recetas) {
    if (!recetasPorPlato.has(r.platoId)) recetasPorPlato.set(r.platoId, []);
    recetasPorPlato.get(r.platoId)!.push(r);
  }

  const compraDetalles = compraDetallesRaw.map((d) => ({
    insumoId: d.insumoId,
    cantidad: d.cantidad,
    unidad: d.unidad,
    compraFecha: d.compra.fecha,
  }));

  const ventasConsumo: Parameters<typeof calcularStockReferenciaPorInsumo>[3] = [];

  for (const dv of detalleVentasRaw) {
    if (comboIdSet.has(dv.platoId)) {
      const items = comboItems.filter((ci) => ci.comboId === dv.platoId);
      for (const item of items) {
        const recetasComp = recetasPorPlato.get(item.platoId) ?? [];
        for (const r of recetasComp) {
          ventasConsumo.push({
            platoId: item.platoId,
            ventaFecha: dv.venta.fecha,
            detalleCantidad: dv.cantidad * item.cantidad,
            insumoId: r.insumoId,
            recetaCantidad: r.cantidad,
            recetaUnidad: r.unidad,
          });
        }
      }
    } else {
      const recetasPlato = recetasPorPlato.get(dv.platoId) ?? [];
      for (const r of recetasPlato) {
        ventasConsumo.push({
          platoId: dv.platoId,
          ventaFecha: dv.venta.fecha,
          detalleCantidad: dv.cantidad,
          insumoId: r.insumoId,
          recetaCantidad: r.cantidad,
          recetaUnidad: r.unidad,
        });
      }
    }
  }

  return calcularStockReferenciaPorInsumo(
    insumos,
    ultimoPorInsumo,
    compraDetalles,
    ventasConsumo,
  );
}

// ─── FECHAS ESTÁNDAR PARA PRUEBAS ─────────────────────────────────────────────
const FECHA_BASE = new Date("2026-01-15T12:00:00.000Z");
const FECHA_ANTES = new Date("2026-01-10T12:00:00.000Z");
const FECHA_DESPUES = new Date("2026-01-20T12:00:00.000Z");
const FECHA_BASE_EXACTA = new Date("2026-01-15T12:00:00.000Z"); // mismo timestamp que base

// ─── mapUltimoInventarioPorInsumo ─────────────────────────────────────────────

describe("mapUltimoInventarioPorInsumo — base de stock", () => {

  it("un solo inventario por insumo → lo devuelve como base", () => {
    const rows = [
      { insumoId: "ins-1", fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5.5") },
    ];
    const map = mapUltimoInventarioPorInsumo(rows);
    expect(map.size).toBe(1);
    expect(Number(map.get("ins-1")!.stockReal)).toBe(5.5);
  });

  it("múltiples inventarios mismo insumo → devuelve el más reciente", () => {
    const rows = [
      { insumoId: "ins-1", fecha: FECHA_ANTES, stockReal: new Prisma.Decimal("3") },
      { insumoId: "ins-1", fecha: FECHA_DESPUES, stockReal: new Prisma.Decimal("10") },
      { insumoId: "ins-1", fecha: FECHA_BASE, stockReal: new Prisma.Decimal("7") },
    ];
    const map = mapUltimoInventarioPorInsumo(rows);
    // FECHA_DESPUES es la más reciente → stockReal = 10
    expect(Number(map.get("ins-1")!.stockReal)).toBe(10);
  });

  it("múltiples insumos → cada uno obtiene su propio último inventario", () => {
    const rows = [
      { insumoId: "ins-1", fecha: FECHA_ANTES, stockReal: new Prisma.Decimal("2") },
      { insumoId: "ins-1", fecha: FECHA_DESPUES, stockReal: new Prisma.Decimal("8") },
      { insumoId: "ins-2", fecha: FECHA_BASE, stockReal: new Prisma.Decimal("15") },
    ];
    const map = mapUltimoInventarioPorInsumo(rows);
    expect(Number(map.get("ins-1")!.stockReal)).toBe(8);
    expect(Number(map.get("ins-2")!.stockReal)).toBe(15);
  });

  it("array vacío → mapa vacío", () => {
    const map = mapUltimoInventarioPorInsumo([]);
    expect(map.size).toBe(0);
  });
});

// ─── calcularStockReferenciaPorInsumo — datos sintéticos ─────────────────────

describe("calcularStockReferenciaPorInsumo — lógica de cálculo pura", () => {

  const insumoKg = { id: "ins-kg", unidadBase: "KILOGRAMO" as const };
  const insumoMl = { id: "ins-ml", unidadBase: "MILILITRO" as const };

  it("insumo sin inventario base → status: sin-base", () => {
    const result = calcularStockReferenciaPorInsumo(
      [insumoKg],
      new Map(), // sin inventario
      [],
      [],
    );
    expect(result.get("ins-kg")).toEqual({ status: "sin-base" });
  });

  it("solo base, sin compras ni ventas → valor = stockBase exacto", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5.500") }],
    ]);
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, [], []);
    const info = result.get("ins-kg");
    expect(info?.status).toBe("ok");
    if (info?.status === "ok") expect(info.valor).toBe(5.5);
  });

  it("base + compra posterior misma unidad → stock = base + compra", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("2") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-kg",
      cantidad: new Prisma.Decimal("3"),
      unidad: "KILOGRAMO" as const,
      compraFecha: FECHA_DESPUES,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-kg");
    if (info?.status === "ok") expect(info.valor).toBe(5); // 2 + 3
  });

  it("compra ANTES de la base → ignorada completamente", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("2") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-kg",
      cantidad: new Prisma.Decimal("100"),
      unidad: "KILOGRAMO" as const,
      compraFecha: FECHA_ANTES, // antes de la base
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-kg");
    if (info?.status === "ok") expect(info.valor).toBe(2); // solo la base, compra ignorada
  });

  it("compra exactamente en la fecha base → se incluye (operador < no <=)", () => {
    // BORDE CRÍTICO: el código usa < fechaBase.getTime(), no <=
    // Eventos exactamente en la fecha base SÍ se procesan.
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("2") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-kg",
      cantidad: new Prisma.Decimal("1"),
      unidad: "KILOGRAMO" as const,
      compraFecha: FECHA_BASE_EXACTA, // mismo timestamp que base
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-kg");
    if (info?.status === "ok") expect(info.valor).toBe(3); // 2 + 1 (incluida)
  });

  it("base + venta posterior → descuenta correctamente", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") }],
    ]);
    const ventasConsumo = [{
      platoId: "plato-1",
      ventaFecha: FECHA_DESPUES,
      detalleCantidad: 2, // 2 porciones vendidas
      insumoId: "ins-kg",
      recetaCantidad: new Prisma.Decimal("0.3"), // 0.3 kg por porción
      recetaUnidad: "KILOGRAMO" as const,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, [], ventasConsumo);
    const info = result.get("ins-kg");
    // 5 - (2 * 0.3) = 5 - 0.6 = 4.4
    if (info?.status === "ok") expect(info.valor).toBe(4.4);
  });

  it("venta ANTES de la base → ignorada", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") }],
    ]);
    const ventasConsumo = [{
      platoId: "plato-1",
      ventaFecha: FECHA_ANTES,
      detalleCantidad: 100,
      insumoId: "ins-kg",
      recetaCantidad: new Prisma.Decimal("1"),
      recetaUnidad: "KILOGRAMO" as const,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, [], ventasConsumo);
    const info = result.get("ins-kg");
    if (info?.status === "ok") expect(info.valor).toBe(5); // venta ignorada
  });

  it("stock negativo → valor < 0 y valorNegativo = true", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("1") }],
    ]);
    const ventasConsumo = [{
      platoId: "plato-1",
      ventaFecha: FECHA_DESPUES,
      detalleCantidad: 10,
      insumoId: "ins-kg",
      recetaCantidad: new Prisma.Decimal("0.5"),
      recetaUnidad: "KILOGRAMO" as const,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, [], ventasConsumo);
    const info = result.get("ins-kg");
    // 1 - (10 * 0.5) = 1 - 5 = -4
    if (info?.status === "ok") {
      expect(info.valor).toBe(-4);
      expect(info.valorNegativo).toBe(true);
    }
  });

  it("redondeo a 3 decimales absorbe errores de coma flotante (0.1 + 0.2 - 0.3)", () => {
    // En JavaScript: 0.1 + 0.2 - 0.3 = 5.551115123125783e-17 (no exactamente 0)
    // El redondeo a 3 decimales debe dar 0.000
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0.1") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-kg",
      cantidad: new Prisma.Decimal("0.2"),
      unidad: "KILOGRAMO" as const,
      compraFecha: FECHA_DESPUES,
    }];
    const ventasConsumo = [{
      platoId: "plato-1",
      ventaFecha: FECHA_DESPUES,
      detalleCantidad: 1,
      insumoId: "ins-kg",
      recetaCantidad: new Prisma.Decimal("0.3"),
      recetaUnidad: "KILOGRAMO" as const,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles, ventasConsumo);
    const info = result.get("ins-kg");
    // 0.1 + 0.2 - 0.3 debería ser 0 (redondeado a 3 decimales)
    if (info?.status === "ok") expect(info.valor).toBe(0);
  });
});

// ─── CONVERSIONES DE UNIDADES ─────────────────────────────────────────────────

describe("calcularStockReferenciaPorInsumo — conversiones de unidades", () => {

  const insumoKg = { id: "ins-kg", unidadBase: "KILOGRAMO" as const };
  const insumoG = { id: "ins-g", unidadBase: "GRAMO" as const };
  const insumoMl = { id: "ins-ml", unidadBase: "MILILITRO" as const };

  it("compra en GRAMO, insumo en KILOGRAMO → 1000g = 1kg (conversión exacta)", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-kg",
      cantidad: new Prisma.Decimal("500"), // 500 gramos
      unidad: "GRAMO" as const,
      compraFecha: FECHA_DESPUES,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-kg");
    // 500g → 0.5kg
    if (info?.status === "ok") {
      expect(info.valor).toBe(0.5);
      expect(info.unidadesMixtas).toBe(true); // unidad de compra ≠ unidadBase
    }
  });

  it("compra en KILOGRAMO, insumo en GRAMO → 1kg = 1000g", () => {
    const ultimoPorInsumo = new Map([
      ["ins-g", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-g",
      cantidad: new Prisma.Decimal("2"), // 2 kilogramos
      unidad: "KILOGRAMO" as const,
      compraFecha: FECHA_DESPUES,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoG], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-g");
    // 2kg → 2000g
    if (info?.status === "ok") expect(info.valor).toBe(2000);
  });

  it("compra en LIBRA, insumo en GRAMO → 1lb = 453.592g (exacto)", () => {
    const ultimoPorInsumo = new Map([
      ["ins-g", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-g",
      cantidad: new Prisma.Decimal("1"), // 1 libra
      unidad: "LIBRA" as const,
      compraFecha: FECHA_DESPUES,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoG], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-g");
    // 1lb = 453.592g → redondeado a 3 decimales = 453.592
    if (info?.status === "ok") expect(info.valor).toBe(453.592);
  });

  it("compra en LITRO, insumo en MILILITRO → 1L = 1000ml", () => {
    const ultimoPorInsumo = new Map([
      ["ins-ml", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-ml",
      cantidad: new Prisma.Decimal("2.5"), // 2.5 litros
      unidad: "LITRO" as const,
      compraFecha: FECHA_DESPUES,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoMl], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-ml");
    // 2.5L → 2500ml
    if (info?.status === "ok") expect(info.valor).toBe(2500);
  });

  it("compra en KILOGRAMO, insumo en MILILITRO → incompatible → unidadesMixtas=true, compra ignorada", () => {
    // Masa vs volumen — no hay conversión posible. El stock no cambia pero se marca unidadesMixtas.
    const ultimoPorInsumo = new Map([
      ["ins-ml", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("500") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-ml",
      cantidad: new Prisma.Decimal("5"), // 5 kg → incompatible con ml
      unidad: "KILOGRAMO" as const,
      compraFecha: FECHA_DESPUES,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoMl], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-ml");
    if (info?.status === "ok") {
      expect(info.valor).toBe(500); // compra ignorada, base intacta
      expect(info.unidadesMixtas).toBe(true);
    }
  });

  it("receta en GRAMO, insumo en KILOGRAMO → descuento convertido correctamente", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("1") }],
    ]);
    const ventasConsumo = [{
      platoId: "plato-1",
      ventaFecha: FECHA_DESPUES,
      detalleCantidad: 1,
      insumoId: "ins-kg",
      recetaCantidad: new Prisma.Decimal("200"), // 200 gramos por porción
      recetaUnidad: "GRAMO" as const,
    }];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, [], ventasConsumo);
    const info = result.get("ins-kg");
    // 1kg - 200g = 1kg - 0.2kg = 0.8kg
    if (info?.status === "ok") expect(info.valor).toBe(0.8);
  });

  it("múltiples compras y ventas con distintas unidades → suma correcta", () => {
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [
      { insumoId: "ins-kg", cantidad: new Prisma.Decimal("1"), unidad: "KILOGRAMO" as const, compraFecha: FECHA_DESPUES },
      { insumoId: "ins-kg", cantidad: new Prisma.Decimal("500"), unidad: "GRAMO" as const, compraFecha: FECHA_DESPUES },
    ];
    const ventasConsumo = [
      { platoId: "p1", ventaFecha: FECHA_DESPUES, detalleCantidad: 2, insumoId: "ins-kg", recetaCantidad: new Prisma.Decimal("0.1"), recetaUnidad: "KILOGRAMO" as const },
    ];
    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles, ventasConsumo);
    const info = result.get("ins-kg");
    // 0 + 1kg + 0.5kg - (2 * 0.1kg) = 1.5 - 0.2 = 1.3kg
    if (info?.status === "ok") expect(info.valor).toBe(1.3);
  });
});

// ─── INTEGRACIÓN CON BD REAL ──────────────────────────────────────────────────

describe("Stock calculado — integración con BD real", () => {

  it("insumo sin inventario base → status sin-base en el resultado real", async () => {
    const { userId } = await crearUsuarioPrueba();
    await crearInsumoPrueba(userId, { nombre: "Pollo", unidadBase: "KILOGRAMO" });

    const stockMap = await getStockParaUsuario(userId);
    const valores = Array.from(stockMap.values());
    expect(valores).toHaveLength(1);
    expect(valores[0].status).toBe("sin-base");
  });

  it("flujo completo: inventario + compra + venta con receta → stock correcto", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { nombre: "Pollo", unidadBase: "KILOGRAMO" });
    const plato = await crearPlatoPrueba(userId, { nombre: "Bandeja Paisa", tieneReceta: true });
    const proveedor = await crearProveedorPrueba(userId);

    // Inventario base: 5 kg el 15 de enero
    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") },
    });

    // Receta: 0.3 kg de pollo por porción
    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: new Prisma.Decimal("0.3"), unidad: "KILOGRAMO" },
    });

    // Compra: 2 kg después de la base
    const compra = await prismaTest.compra.create({
      data: { userId, proveedorId: proveedor.id, fecha: FECHA_DESPUES, total: new Prisma.Decimal("20000") },
    });
    await prismaTest.compraDetalle.create({
      data: { userId, compraId: compra.id, insumoId: insumo.id, cantidad: new Prisma.Decimal("2"), unidad: "KILOGRAMO", precioUnitario: new Prisma.Decimal("10000"), total: new Prisma.Decimal("20000") },
    });

    // Venta: 4 porciones después de la base
    const venta = await prismaTest.venta.create({
      data: { userId, fecha: FECHA_DESPUES, hora: "12:00", tipo: "MESA", total: new Prisma.Decimal("100000"), metodoPago: "EFECTIVO" },
    });
    await prismaTest.detalleVenta.create({
      data: { userId, ventaId: venta.id, platoId: plato.id, cantidad: 4, precioUnitario: new Prisma.Decimal("25000") },
    });

    const stockMap = await getStockParaUsuario(userId);
    const info = stockMap.get(insumo.id);

    // 5 + 2 - (4 * 0.3) = 7 - 1.2 = 5.8 kg
    expect(info?.status).toBe("ok");
    if (info?.status === "ok") expect(info.valor).toBe(5.8);
  });

  it("compra antes de la base en BD real → ignorada en el cálculo", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { unidadBase: "KILOGRAMO" });
    const proveedor = await crearProveedorPrueba(userId);

    // Inventario base: 1 kg el 15 de enero
    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("1") },
    });

    // Compra ANTES de la base: 100 kg — debe ignorarse
    const compraAntes = await prismaTest.compra.create({
      data: { userId, proveedorId: proveedor.id, fecha: FECHA_ANTES, total: new Prisma.Decimal("100000") },
    });
    await prismaTest.compraDetalle.create({
      data: { userId, compraId: compraAntes.id, insumoId: insumo.id, cantidad: new Prisma.Decimal("100"), unidad: "KILOGRAMO", precioUnitario: new Prisma.Decimal("1000"), total: new Prisma.Decimal("100000") },
    });

    const stockMap = await getStockParaUsuario(userId);
    const info = stockMap.get(insumo.id);

    // Solo la base: 1 kg
    if (info?.status === "ok") expect(info.valor).toBe(1);
  });

  it("dos inventarios mismo insumo → usa el más reciente como base", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { unidadBase: "KILOGRAMO" });

    // Primer conteo: 10 kg el 10 de enero
    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_ANTES, stockReal: new Prisma.Decimal("10") },
    });
    // Segundo conteo: 3 kg el 15 de enero (más reciente)
    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("3") },
    });

    const stockMap = await getStockParaUsuario(userId);
    const info = stockMap.get(insumo.id);

    // Base = 3 (el más reciente), no 10
    if (info?.status === "ok") expect(info.valor).toBe(3);
  });

  it("venta de COMBO → stock descontado a través de comboItems y recetas de componentes", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { nombre: "Arroz", unidadBase: "KILOGRAMO" });
    const componente = await crearPlatoPrueba(userId, { nombre: "Porción Arroz", tieneReceta: true });
    const combo = await prismaTest.plato.create({
      data: { userId, nombre: "Combo Ejecutivo", precioVenta: new Prisma.Decimal("30000"), tipo: "COMBO", tieneReceta: false },
    });

    // Inventario base: 5 kg
    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") },
    });

    // Receta del componente: 0.2 kg de arroz
    await prismaTest.receta.create({
      data: { userId, platoId: componente.id, insumoId: insumo.id, cantidad: new Prisma.Decimal("0.2"), unidad: "KILOGRAMO" },
    });

    // ComboItem: combo tiene 2 porciones del componente
    await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: componente.id, cantidad: 2 },
    });

    // Venta: 3 combos
    const venta = await prismaTest.venta.create({
      data: { userId, fecha: FECHA_DESPUES, hora: "12:00", tipo: "MESA", total: new Prisma.Decimal("90000"), metodoPago: "EFECTIVO" },
    });
    await prismaTest.detalleVenta.create({
      data: { userId, ventaId: venta.id, platoId: combo.id, cantidad: 3, precioUnitario: new Prisma.Decimal("30000") },
    });

    const stockMap = await getStockParaUsuario(userId);
    const info = stockMap.get(insumo.id);

    // 5 - (3 combos * 2 porciones * 0.2 kg) = 5 - 1.2 = 3.8 kg
    expect(info?.status).toBe("ok");
    if (info?.status === "ok") expect(info.valor).toBe(3.8);
  });

  it("receta con cantidad 0 → no descuenta stock aunque haya ventas", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { unidadBase: "KILOGRAMO" });
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });

    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("10") },
    });
    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: new Prisma.Decimal("0"), unidad: "KILOGRAMO" },
    });

    const venta = await prismaTest.venta.create({
      data: { userId, fecha: FECHA_DESPUES, hora: "12:00", tipo: "MESA", total: new Prisma.Decimal("25000"), metodoPago: "EFECTIVO" },
    });
    await prismaTest.detalleVenta.create({
      data: { userId, ventaId: venta.id, platoId: plato.id, cantidad: 50, precioUnitario: new Prisma.Decimal("500") },
    });

    const stockMap = await getStockParaUsuario(userId);
    const info = stockMap.get(insumo.id);

    // 10 - (50 * 0) = 10 kg intactos
    if (info?.status === "ok") expect(info.valor).toBe(10);
  });

  it("insumo soft-deleted no aparece en el cálculo de stock", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId);

    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") },
    });

    // Soft-delete del insumo
    await prismaTest.insumo.update({
      where: { id: insumo.id },
      data: { deletedAt: new Date() },
    });

    const stockMap = await getStockParaUsuario(userId);
    // El insumo soft-deleted no debe aparecer en el resultado
    expect(stockMap.size).toBe(0);
  });

  it("stock negativo en BD real → valorNegativo=true (más ventas que stock base)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { unidadBase: "KILOGRAMO" });
    const plato = await crearPlatoPrueba(userId, { tieneReceta: true });

    // Base: solo 1 kg
    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("1") },
    });
    // Receta: 0.5 kg por porción
    await prismaTest.receta.create({
      data: { userId, platoId: plato.id, insumoId: insumo.id, cantidad: new Prisma.Decimal("0.5"), unidad: "KILOGRAMO" },
    });
    // Venta: 10 porciones (= 5 kg consumidos, pero solo hay 1 kg de base)
    const venta = await prismaTest.venta.create({
      data: { userId, fecha: FECHA_DESPUES, hora: "12:00", tipo: "MESA", total: new Prisma.Decimal("250000"), metodoPago: "EFECTIVO" },
    });
    await prismaTest.detalleVenta.create({
      data: { userId, ventaId: venta.id, platoId: plato.id, cantidad: 10, precioUnitario: new Prisma.Decimal("25000") },
    });

    const stockMap = await getStockParaUsuario(userId);
    const info = stockMap.get(insumo.id);

    // 1 - (10 * 0.5) = 1 - 5 = -4
    if (info?.status === "ok") {
      expect(info.valor).toBe(-4);
      expect(info.valorNegativo).toBe(true);
    }
  });
});

// ─── ESCENARIOS DE ALTO RIESGO PARA CUENTAME ─────────────────────────────────

describe("Stock calculado — escenarios mortales para la estabilidad", () => {

  const insumoKg = { id: "ins-kg", unidadBase: "KILOGRAMO" as const };

  it("compra en unidad no dimensional (CAJA) con insumo en KILOGRAMO → ignorada silenciosamente, unidadesMixtas=true", () => {
    // ESCENARIO REAL MÁS PROBABLE: restaurantes compran por caja pero miden por kilo.
    // CAJA no está en factorMasa ni factorVolumen → convertirAUnidad devuelve null.
    // La compra se ignora. El stock queda subestimado sin avisar al dueño.
    // La única señal es unidadesMixtas=true en la UI.
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-kg",
      cantidad: new Prisma.Decimal("5"), // 5 CAJAS de pollo
      unidad: "CAJA" as never, // unidad no dimensional
      compraFecha: FECHA_DESPUES,
    }];

    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles as never, []);
    const info = result.get("ins-kg");

    if (info?.status === "ok") {
      expect(info.valor).toBe(0); // compra ignorada, stock sin cambio
      expect(info.unidadesMixtas).toBe(true); // señal de alerta activada
    }
  });

  it("compra en PORCION, insumo en GRAMO → ignorada, unidadesMixtas=true", () => {
    // PORCION es otra unidad no dimensional frecuente en restaurantes.
    const insumoG = { id: "ins-g", unidadBase: "GRAMO" as const };
    const ultimoPorInsumo = new Map([
      ["ins-g", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("500") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-g",
      cantidad: new Prisma.Decimal("10"),
      unidad: "PORCION" as never,
      compraFecha: FECHA_DESPUES,
    }];

    const result = calcularStockReferenciaPorInsumo([insumoG], ultimoPorInsumo, compraDetalles as never, []);
    const info = result.get("ins-g");

    if (info?.status === "ok") {
      expect(info.valor).toBe(500); // base intacta
      expect(info.unidadesMixtas).toBe(true);
    }
  });

  it("mismo insumo en recetas de múltiples platos → consumo acumulado correctamente", () => {
    // Pollo aparece en Bandeja Paisa (0.3 kg) y en Arroz con Pollo (0.2 kg).
    // 2 bandejas + 3 arroces = 2*0.3 + 3*0.2 = 0.6 + 0.6 = 1.2 kg consumidos.
    // Un bug de acumulación podría contabilizar solo el primer plato.
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") }],
    ]);
    const ventasConsumo = [
      {
        platoId: "bandeja",
        ventaFecha: FECHA_DESPUES,
        detalleCantidad: 2,
        insumoId: "ins-kg",
        recetaCantidad: new Prisma.Decimal("0.3"),
        recetaUnidad: "KILOGRAMO" as const,
      },
      {
        platoId: "arroz-pollo",
        ventaFecha: FECHA_DESPUES,
        detalleCantidad: 3,
        insumoId: "ins-kg",
        recetaCantidad: new Prisma.Decimal("0.2"),
        recetaUnidad: "KILOGRAMO" as const,
      },
    ];

    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, [], ventasConsumo);
    const info = result.get("ins-kg");

    // 5 - 0.6 - 0.6 = 3.8 kg
    if (info?.status === "ok") expect(info.valor).toBe(3.8);
  });

  it("fechaMinima con múltiples insumos — compra de insumo-1 antes de SU base pero después de la base de insumo-2 → ignorada para insumo-1", () => {
    // getStockActual usa la fecha más antigua entre todos los inventarios como fechaMinima
    // para filtrar la query. Pero calcularStockReferenciaPorInsumo filtra
    // individualmente por la base de cada insumo.
    // Este test verifica que la función pura maneja correctamente este caso.
    const insumoKg2 = { id: "ins-kg2", unidadBase: "KILOGRAMO" as const };

    // insumo-1 base: 15 enero. insumo-2 base: 1 enero (más antigua → fechaMinima global)
    const fechaBaseInsumo2 = new Date("2026-01-01T12:00:00.000Z");
    const fechaEntre = new Date("2026-01-08T12:00:00.000Z"); // después del 1ene, antes del 15ene

    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") }], // base: 15 ene
      ["ins-kg2", { fecha: fechaBaseInsumo2, stockReal: new Prisma.Decimal("10") }], // base: 1 ene
    ]);

    // Compra de insumo-1 el 8 de enero: después de fechaMinima(1ene) pero ANTES de su base(15ene)
    // → debe ser IGNORADA para insumo-1
    const compraDetalles = [
      {
        insumoId: "ins-kg",
        cantidad: new Prisma.Decimal("100"), // 100 kg — si se incluye, el bug sería obvio
        unidad: "KILOGRAMO" as const,
        compraFecha: fechaEntre, // 8 enero: antes de la base del 15 enero
      },
      {
        insumoId: "ins-kg2",
        cantidad: new Prisma.Decimal("2"),
        unidad: "KILOGRAMO" as const,
        compraFecha: fechaEntre, // 8 enero: después de la base del 1 enero → SÍ se incluye
      },
    ];

    const result = calcularStockReferenciaPorInsumo(
      [insumoKg, insumoKg2],
      ultimoPorInsumo,
      compraDetalles,
      [],
    );

    const info1 = result.get("ins-kg");
    const info2 = result.get("ins-kg2");

    // insumo-1: base 5, compra del 8ene ignorada → sigue en 5
    if (info1?.status === "ok") expect(info1.valor).toBe(5);
    // insumo-2: base 10, compra del 8ene incluida → 10 + 2 = 12
    if (info2?.status === "ok") expect(info2.valor).toBe(12);
  });

  it("stockReal = 0 en inventario → base válida, no confundida con 'sin base'", () => {
    // Un conteo físico que da 0 es completamente válido: el restaurante se quedó sin stock.
    // El cálculo debe usar 0 como base, no retornar sin-base.
    // Si hubiera un bug que tratara 0 como falsy, el stock quedaría sin base.
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-kg",
      cantidad: new Prisma.Decimal("3"),
      unidad: "KILOGRAMO" as const,
      compraFecha: FECHA_DESPUES,
    }];

    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-kg");

    // status debe ser "ok", no "sin-base"
    expect(info?.status).toBe("ok");
    // 0 + 3 = 3 kg
    if (info?.status === "ok") expect(info.valor).toBe(3);
  });

  it("LIBRA en contexto real: 3 LIBRAS de pollo → 1360.776 GRAMOS exactos (precisión de conversión)", () => {
    // 3 * 453.592 = 1360.776. En floating point puro: 1360.7759999999999.
    // El redondeo a 3 decimales debe absorber el error y dar 1360.776.
    const insumoG = { id: "ins-g", unidadBase: "GRAMO" as const };
    const ultimoPorInsumo = new Map([
      ["ins-g", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("0") }],
    ]);
    const compraDetalles = [{
      insumoId: "ins-g",
      cantidad: new Prisma.Decimal("3"),
      unidad: "LIBRA" as const,
      compraFecha: FECHA_DESPUES,
    }];

    const result = calcularStockReferenciaPorInsumo([insumoG], ultimoPorInsumo, compraDetalles, []);
    const info = result.get("ins-g");

    if (info?.status === "ok") expect(info.valor).toBe(1360.776);
  });

  it("ComboItem cantidad > 1 con ventas grandes: multiplicación de enteros seguida de Decimal es exacta", () => {
    // Combo con 3 porciones del componente. Se venden 99 combos (MAX_CANT).
    // detalleCantidad=99 * item.cantidad=3 = 297 porciones → 297 * 0.1kg = 29.7kg consumidos.
    // La multiplicación de enteros (JS number) seguida de Decimal no debe perder precisión.
    const ultimoPorInsumo = new Map([
      ["ins-kg", { fecha: FECHA_BASE, stockReal: new Prisma.Decimal("50") }],
    ]);
    const ventasConsumo = [{
      platoId: "componente-1",
      ventaFecha: FECHA_DESPUES,
      detalleCantidad: 99 * 3, // 297: detalleCantidad(99 combos) * item.cantidad(3)
      insumoId: "ins-kg",
      recetaCantidad: new Prisma.Decimal("0.1"),
      recetaUnidad: "KILOGRAMO" as const,
    }];

    const result = calcularStockReferenciaPorInsumo([insumoKg], ultimoPorInsumo, [], ventasConsumo);
    const info = result.get("ins-kg");

    // 50 - (297 * 0.1) = 50 - 29.7 = 20.3 kg
    if (info?.status === "ok") expect(info.valor).toBe(20.3);
  });

  it("combo con componente sin receta → no crash, stock no se descuenta (cadena rota silenciosa)", async () => {
    // Escenario real: dueño crea combo antes de configurar las recetas del componente.
    // El cálculo hace recetasPorPlato.get(item.platoId) ?? [] → array vacío → sin consumo.
    // El stock queda inflado pero sin error. La app sobrevive.
    const { userId } = await crearUsuarioPrueba();
    const insumo = await crearInsumoPrueba(userId, { unidadBase: "KILOGRAMO" });

    // Componente SIN receta
    const componente = await crearPlatoPrueba(userId, { nombre: "Componente Sin Receta", tieneReceta: false });
    const combo = await prismaTest.plato.create({
      data: {
        userId, nombre: "Combo Sin Receta",
        precioVenta: new Prisma.Decimal("25000"),
        tipo: "COMBO", tieneReceta: false,
      },
    });

    await prismaTest.inventario.create({
      data: { userId, insumoId: insumo.id, fecha: FECHA_BASE, stockReal: new Prisma.Decimal("5") },
    });

    // ComboItem apunta al componente que no tiene receta
    await prismaTest.comboItem.create({
      data: { userId, comboId: combo.id, platoId: componente.id, cantidad: 2 },
    });

    // Venta del combo
    const venta = await prismaTest.venta.create({
      data: { userId, fecha: FECHA_DESPUES, hora: "12:00", tipo: "MESA", total: new Prisma.Decimal("25000"), metodoPago: "EFECTIVO" },
    });
    await prismaTest.detalleVenta.create({
      data: { userId, ventaId: venta.id, platoId: combo.id, cantidad: 5, precioUnitario: new Prisma.Decimal("5000") },
    });

    // El stock debe calcularse sin crash
    const stockMap = await getStockParaUsuario(userId);
    const info = stockMap.get(insumo.id);

    // Stock intacto: el combo no descuenta nada porque el componente no tiene receta
    expect(info?.status).toBe("ok");
    if (info?.status === "ok") {
      expect(info.valor).toBe(5); // sin cambio
    }
    // Este test documenta: combo sin receta = stock inflado silenciosamente.
    // La solución correcta es obligar a configurar recetas antes de activar el combo.
  });
});
