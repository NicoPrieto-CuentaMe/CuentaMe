"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  TIPO_VENTA_LABELS,
  CANAL_DOMICILIO_LABELS,
  METODO_PAGO_VENTA_LABELS,
} from "@/lib/ventas-constants";
import {
  CATEGORIA_LABELS,
  PERIODICIDAD_LABELS,
  METODO_PAGO_LABELS,
} from "@/lib/gastos-constants";
import type {
  CanalDomicilio,
  CategoriaGasto,
  MetodoPagoGasto,
  MetodoPagoVenta,
  PeriodicidadGasto,
  TipoVenta,
} from "@prisma/client";

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("No autenticado.");
  return userId;
}

function fechaCivilToRangoDb(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0));
}

// ─── VENTAS ──────────────────────────────────────────────────────────────────

export type VentasRangoFiltros = {
  fechaDesde: string; // "YYYY-MM-DD"
  fechaHasta: string; // "YYYY-MM-DD"
  tipo?: TipoVenta;
  canal?: CanalDomicilio;
  metodoPago?: MetodoPagoVenta;
};

export type VentasRangoResult = {
  ok: true;
  resumen: {
    totalCOP: number;
    numTransacciones: number;
    totalPlatos: number;
    porTipo: Record<string, number>;
    porMetodo: Record<string, number>;
    porCanal: Record<string, number>;
    topPlatos: { nombre: string; cantidad: number; totalCOP: number }[];
  };
  ventas: {
    id: string;
    fecha: string;
    hora: string;
    tipo: string;
    canal: string | null;
    metodoPago: string;
    total: number;
    platos: { nombre: string; cantidad: number; precioUnitario: number }[];
  }[];
} | { ok: false; message: string; errorCode: string };

export async function getVentasRango(
  filtros: VentasRangoFiltros,
): Promise<VentasRangoResult> {
  try {
    const userId = await requireUserId();

    const desde = fechaCivilToRangoDb(filtros.fechaDesde);
    const hasta = fechaCivilToRangoDb(filtros.fechaHasta);
    if (!desde || !hasta) {
      return { ok: false, message: "Fechas inválidas.", errorCode: "VALIDATION" };
    }

    // Ajustar hasta al final del día civil
    const hastaFin = new Date(hasta);
    hastaFin.setUTCHours(23, 59, 59, 999);

    const ventas = await prisma.venta.findMany({
      where: {
        userId,
        fecha: { gte: desde, lte: hastaFin },
        ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
        ...(filtros.canal ? { canal: filtros.canal } : {}),
        ...(filtros.metodoPago ? { metodoPago: filtros.metodoPago } : {}),
      },
      include: {
        detalles: {
          include: { plato: { select: { nombre: true } } },
        },
      },
      orderBy: { fecha: "desc" },
    });

    // Resumen agregado
    let totalCOP = 0;
    let totalPlatos = 0;
    const porTipo: Record<string, number> = {};
    const porMetodo: Record<string, number> = {};
    const porCanal: Record<string, number> = {};
    const platoMap = new Map<string, { cantidad: number; totalCOP: number }>();

    for (const v of ventas) {
      const monto = Number(v.total);
      totalCOP += monto;

      const tipoLabel = TIPO_VENTA_LABELS[v.tipo as TipoVenta] ?? v.tipo;
      porTipo[tipoLabel] = (porTipo[tipoLabel] ?? 0) + monto;

      const metodoLabel =
        METODO_PAGO_VENTA_LABELS[v.metodoPago as MetodoPagoVenta] ?? v.metodoPago;
      porMetodo[metodoLabel] = (porMetodo[metodoLabel] ?? 0) + monto;

      if (v.canal) {
        const canalLabel =
          CANAL_DOMICILIO_LABELS[v.canal as CanalDomicilio] ?? v.canal;
        porCanal[canalLabel] = (porCanal[canalLabel] ?? 0) + monto;
      }

      for (const d of v.detalles) {
        totalPlatos += d.cantidad;
        const nombre = d.plato.nombre;
        const entry = platoMap.get(nombre) ?? { cantidad: 0, totalCOP: 0 };
        entry.cantidad += d.cantidad;
        entry.totalCOP += d.cantidad * Number(d.precioUnitario);
        platoMap.set(nombre, entry);
      }
    }

    const topPlatos = Array.from(platoMap.entries())
      .map(([nombre, data]) => ({ nombre, ...data }))
      .sort((a, b) => b.totalCOP - a.totalCOP)
      .slice(0, 10);

    const ventasSerializadas = ventas.map((v) => ({
      id: v.id,
      fecha: v.fecha.toISOString().slice(0, 10),
      hora: v.hora,
      tipo: TIPO_VENTA_LABELS[v.tipo as TipoVenta] ?? v.tipo,
      canal: v.canal
        ? (CANAL_DOMICILIO_LABELS[v.canal as CanalDomicilio] ?? v.canal)
        : null,
      metodoPago:
        METODO_PAGO_VENTA_LABELS[v.metodoPago as MetodoPagoVenta] ?? v.metodoPago,
      total: Number(v.total),
      platos: v.detalles.map((d) => ({
        nombre: d.plato.nombre,
        cantidad: d.cantidad,
        precioUnitario: Number(d.precioUnitario),
      })),
    }));

    return {
      ok: true,
      resumen: {
        totalCOP,
        numTransacciones: ventas.length,
        totalPlatos,
        porTipo,
        porMetodo,
        porCanal,
        topPlatos,
      },
      ventas: ventasSerializadas,
    };
  } catch (e) {
    console.error("[getVentasRango]", e);
    return {
      ok: false,
      message: "No se pudieron obtener las ventas.",
      errorCode: "DB_ERROR",
    };
  }
}

// ─── GASTOS ──────────────────────────────────────────────────────────────────

export type GastosRangoFiltros = {
  fechaDesde: string;
  fechaHasta: string;
  categoria?: CategoriaGasto;
};

export type GastosRangoResult =
  | {
      ok: true;
      resumen: {
        totalCOP: number;
        numRegistros: number;
        porCategoria: Record<string, number>;
        porPeriodicidad: Record<string, number>;
        porMetodo: Record<string, number>;
      };
      gastos: {
        id: string;
        fecha: string;
        categoria: string;
        monto: number;
        periodicidad: string;
        metodoPago: string;
        notas: string | null;
      }[];
    }
  | { ok: false; message: string; errorCode: string };

export async function getGastosRango(
  filtros: GastosRangoFiltros,
): Promise<GastosRangoResult> {
  try {
    const userId = await requireUserId();

    const desde = fechaCivilToRangoDb(filtros.fechaDesde);
    const hasta = fechaCivilToRangoDb(filtros.fechaHasta);
    if (!desde || !hasta) {
      return { ok: false, message: "Fechas inválidas.", errorCode: "VALIDATION" };
    }

    const hastaFin = new Date(hasta);
    hastaFin.setUTCHours(23, 59, 59, 999);

    const gastos = await prisma.gastoFijo.findMany({
      where: {
        userId,
        fecha: { gte: desde, lte: hastaFin },
        ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
      },
      orderBy: { fecha: "desc" },
    });

    let totalCOP = 0;
    const porCategoria: Record<string, number> = {};
    const porPeriodicidad: Record<string, number> = {};
    const porMetodo: Record<string, number> = {};

    for (const g of gastos) {
      const monto = Number(g.monto);
      totalCOP += monto;

      const catLabel =
        CATEGORIA_LABELS[g.categoria as CategoriaGasto] ?? g.categoria;
      porCategoria[catLabel] = (porCategoria[catLabel] ?? 0) + monto;

      const perLabel =
        PERIODICIDAD_LABELS[g.periodicidad as PeriodicidadGasto] ?? g.periodicidad;
      porPeriodicidad[perLabel] = (porPeriodicidad[perLabel] ?? 0) + monto;

      const metLabel =
        METODO_PAGO_LABELS[g.metodoPago as MetodoPagoGasto] ?? g.metodoPago;
      porMetodo[metLabel] = (porMetodo[metLabel] ?? 0) + monto;
    }

    return {
      ok: true,
      resumen: {
        totalCOP,
        numRegistros: gastos.length,
        porCategoria,
        porPeriodicidad,
        porMetodo,
      },
      gastos: gastos.map((g) => ({
        id: g.id,
        fecha: g.fecha.toISOString().slice(0, 10),
        categoria: CATEGORIA_LABELS[g.categoria as CategoriaGasto] ?? g.categoria,
        monto: Number(g.monto),
        periodicidad:
          PERIODICIDAD_LABELS[g.periodicidad as PeriodicidadGasto] ?? g.periodicidad,
        metodoPago:
          METODO_PAGO_LABELS[g.metodoPago as MetodoPagoGasto] ?? g.metodoPago,
        notas: g.notas,
      })),
    };
  } catch (e) {
    console.error("[getGastosRango]", e);
    return {
      ok: false,
      message: "No se pudieron obtener los gastos.",
      errorCode: "DB_ERROR",
    };
  }
}

// ─── COMPRAS ─────────────────────────────────────────────────────────────────

export type ComprasRangoFiltros = {
  fechaDesde: string;
  fechaHasta: string;
  proveedorId?: string;
};

export type ComprasRangoResult =
  | {
      ok: true;
      resumen: {
        totalCOP: number;
        numCompras: number;
        porProveedor: Record<string, number>;
        topInsumos: { nombre: string; cantidad: number; unidad: string; totalCOP: number }[];
      };
      compras: {
        id: string;
        fecha: string;
        proveedor: string;
        total: number;
        notas: string | null;
        detalles: {
          insumo: string;
          cantidad: number;
          unidad: string;
          precioUnitario: number;
          total: number;
        }[];
      }[];
    }
  | { ok: false; message: string; errorCode: string };

export async function getComprasRango(
  filtros: ComprasRangoFiltros,
): Promise<ComprasRangoResult> {
  try {
    const userId = await requireUserId();

    const desde = fechaCivilToRangoDb(filtros.fechaDesde);
    const hasta = fechaCivilToRangoDb(filtros.fechaHasta);
    if (!desde || !hasta) {
      return { ok: false, message: "Fechas inválidas.", errorCode: "VALIDATION" };
    }

    const hastaFin = new Date(hasta);
    hastaFin.setUTCHours(23, 59, 59, 999);

    const compras = await prisma.compra.findMany({
      where: {
        userId,
        fecha: { gte: desde, lte: hastaFin },
        ...(filtros.proveedorId ? { proveedorId: filtros.proveedorId } : {}),
      },
      include: {
        proveedor: { select: { nombre: true } },
        detalles: {
          include: { insumo: { select: { nombre: true } } },
        },
      },
      orderBy: { fecha: "desc" },
    });

    let totalCOP = 0;
    const porProveedor: Record<string, number> = {};
    const insumoMap = new Map<
      string,
      { cantidad: number; unidad: string; totalCOP: number }
    >();

    for (const c of compras) {
      const monto = Number(c.total);
      totalCOP += monto;

      const prov = c.proveedor.nombre;
      porProveedor[prov] = (porProveedor[prov] ?? 0) + monto;

      for (const d of c.detalles) {
        const nombre = d.insumo.nombre;
        const entry = insumoMap.get(nombre) ?? {
          cantidad: 0,
          unidad: d.unidad,
          totalCOP: 0,
        };
        entry.cantidad += Number(d.cantidad);
        entry.totalCOP += Number(d.total);
        insumoMap.set(nombre, entry);
      }
    }

    const topInsumos = Array.from(insumoMap.entries())
      .map(([nombre, data]) => ({ nombre, ...data }))
      .sort((a, b) => b.totalCOP - a.totalCOP)
      .slice(0, 10);

    return {
      ok: true,
      resumen: {
        totalCOP,
        numCompras: compras.length,
        porProveedor,
        topInsumos,
      },
      compras: compras.map((c) => ({
        id: c.id,
        fecha: c.fecha.toISOString().slice(0, 10),
        proveedor: c.proveedor.nombre,
        total: Number(c.total),
        notas: c.notas,
        detalles: c.detalles.map((d) => ({
          insumo: d.insumo.nombre,
          cantidad: Number(d.cantidad),
          unidad: d.unidad,
          precioUnitario: Number(d.precioUnitario),
          total: Number(d.total),
        })),
      })),
    };
  } catch (e) {
    console.error("[getComprasRango]", e);
    return {
      ok: false,
      message: "No se pudieron obtener las compras.",
      errorCode: "DB_ERROR",
    };
  }
}
