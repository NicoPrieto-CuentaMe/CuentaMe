"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CanalDomicilio, MetodoPagoVenta, TipoVenta } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import {
  CANALES_DOMICILIO,
  METODOS_PAGO_VENTA,
} from "@/lib/ventas-constants";

const CANALES_SET = new Set<CanalDomicilio>(CANALES_DOMICILIO);
const METODOS_SET = new Set<MetodoPagoVenta>(METODOS_PAGO_VENTA);

const MIN_LINEAS = 1;
const MAX_LINEAS = 30;
const MIN_CANT = 1;
const MAX_CANT = 99;

const notDeleted = { deletedAt: null } as const;

function lineaMsg(lineNum1: number, msg: string): string {
  return `Línea ${lineNum1}: ${msg}`;
}

function requiredString(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("No autenticado.");
  return userId;
}

function fechaCivilToDb(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}

function esFechaFutura(isoDate: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return true;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const inputUtc = Date.UTC(y, mo - 1, d);
  const CO_OFFSET_MS = 5 * 60 * 60 * 1000;
  const ahoraCo = new Date(Date.now() - CO_OFFSET_MS);
  const todayCo = Date.UTC(
    ahoraCo.getUTCFullYear(),
    ahoraCo.getUTCMonth(),
    ahoraCo.getUTCDate(),
  );
  return inputUtc > todayCo;
}

function validarRangoFechaVenta(fecha: Date): { ok: false; message: string } | null {
  const hoy = new Date();
  const hace10Anos = new Date(hoy.getFullYear() - 10, 0, 1);
  if (fecha < hace10Anos) {
    return { ok: false, message: "La fecha es muy antigua (más de 10 años atrás)." };
  }
  return null;
}

/** HH:MM 24h */
function esHoraValida(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim());
}

const TIPOS_VENTA_VALIDOS = new Set<TipoVenta>(["MESA", "DOMICILIO", "PARA_LLEVAR"]);

function validarTipoVenta(raw: string): TipoVenta | null {
  if (TIPOS_VENTA_VALIDOS.has(raw as TipoVenta)) return raw as TipoVenta;
  return null;
}

function validarCanalDomicilio(raw: string): CanalDomicilio | null {
  if (CANALES_SET.has(raw as CanalDomicilio)) return raw as CanalDomicilio;
  return null;
}

function validarMetodoPago(raw: string): MetodoPagoVenta | null {
  if (METODOS_SET.has(raw as MetodoPagoVenta)) return raw as MetodoPagoVenta;
  return null;
}

type LineaJson = {
  platoId?: unknown;
  cantidad?: unknown;
};

export async function registrarVenta(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();

    const fechaRaw = requiredString(formData, "fecha");
    const horaRaw = requiredString(formData, "hora");
    const tipoRaw = requiredString(formData, "tipo");
    const canalRaw = requiredString(formData, "canal");
    const metodoPagoRaw = requiredString(formData, "metodoPago");
    const lineasRaw = requiredString(formData, "lineas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    const rangoCheck = validarRangoFechaVenta(fechaDb);
    if (rangoCheck) return { ...rangoCheck, field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
    }

    if (!horaRaw) return { ok: false, message: "La hora es obligatoria.", field: "hora" };
    if (!esHoraValida(horaRaw)) {
      return { ok: false, message: "Hora inválida (usa HH:MM).", field: "hora" };
    }

    const tipo = validarTipoVenta(tipoRaw);
    if (!tipo) return { ok: false, message: "Tipo de venta inválido.", field: "tipo" };

    let canal: CanalDomicilio | null = null;
    if (tipo === "DOMICILIO") {
      canal = validarCanalDomicilio(canalRaw);
      if (!canal) return { ok: false, message: "Canal de domicilio inválido.", field: "canal" };
    }

    const metodoPago = validarMetodoPago(metodoPagoRaw);
    if (!metodoPago) return { ok: false, message: "Método de pago inválido.", field: "metodoPago" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(lineasRaw || "[]");
    } catch {
      return { ok: false, message: "Formato de líneas inválido.", field: "lineas" };
    }

    if (!Array.isArray(parsed)) {
      return { ok: false, message: "Las líneas deben ser un arreglo.", field: "lineas" };
    }

    if (parsed.length < MIN_LINEAS) {
      return { ok: false, message: "Agrega al menos un plato a la venta.", field: "lineas" };
    }
    if (parsed.length > MAX_LINEAS) {
      return { ok: false, message: `No puedes vender más de ${MAX_LINEAS} platos distintos por venta.`, field: "lineas" };
    }

    const builtReg = await buildValidVentaLinesFromParsed(userId, parsed);
    if (!builtReg.ok) return builtReg.state;
    const validLines = builtReg.validLines;

    let totalGeneral = new Prisma.Decimal(0);
    for (const vl of validLines) {
      totalGeneral = totalGeneral.add(vl.subtotal);
    }

    let ventaId = "";
    await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.create({
        data: {
          userId,
          fecha: fechaDb,
          hora: horaRaw.trim(),
          tipo,
          canal,
          total: totalGeneral,
          metodoPago,
        },
      });
      await tx.detalleVenta.createMany({
        data: validLines.map((vl) => ({
          userId,
          ventaId: venta.id,
          platoId: vl.platoId,
          cantidad: vl.cantidad,
          precioUnitario: vl.precioUnitario,
        })),
      });
      ventaId = venta.id;
    });

    revalidatePath("/ventas");
    revalidateTag("metricas-dia");
    return { ok: true, message: "Venta registrada.", createdId: ventaId };
  } catch (e) {
    console.error("[registrarVenta]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        ok: false,
        message: "Error de base de datos al registrar la venta.",
        errorCode: "DB_ERROR",
      };
    }
    return {
      ok: false,
      message: "No se pudo registrar la venta. Intenta de nuevo.",
      errorCode: "UNKNOWN",
    };
  }
}

/** Catálogo para edición en cliente (sin tocar page.tsx). */
export async function getPlatosCatalogoVenta() {
  try {
    const userId = await requireUserId();
    const platos = await prisma.plato.findMany({
      where: { userId, ...notDeleted, active: true },
      select: { id: true, nombre: true, precioVenta: true },
      orderBy: { nombre: "asc" },
    });
    return {
      ok: true as const,
      platos: platos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precioVenta: p.precioVenta.toString(),
      })),
    };
  } catch (e) {
    console.error("[getPlatosCatalogoVenta]", e);
    return { ok: false as const, platos: [] as { id: string; nombre: string; precioVenta: string }[] };
  }
}

async function buildValidVentaLinesFromParsed(
  userId: string,
  parsed: unknown,
): Promise<
  | { ok: true; validLines: { platoId: string; cantidad: number; precioUnitario: Prisma.Decimal; subtotal: Prisma.Decimal }[] }
  | { ok: false; state: ActionState }
> {
  if (!Array.isArray(parsed)) {
    return { ok: false, state: { ok: false, message: "Las líneas deben ser un arreglo.", field: "lineas" } };
  }
  if (parsed.length < MIN_LINEAS) {
    return { ok: false, state: { ok: false, message: "Agrega al menos un plato a la venta.", field: "lineas" } };
  }
  if (parsed.length > MAX_LINEAS) {
    return {
      ok: false,
      state: { ok: false, message: `No puedes vender más de ${MAX_LINEAS} platos distintos por venta.`, field: "lineas" },
    };
  }
  const platoIds: string[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i] as LineaJson;
    const platoId = typeof row.platoId === "string" ? row.platoId.trim() : "";
    if (!platoId) {
      return {
        ok: false,
        state: { ok: false, message: lineaMsg(i + 1, "falta el plato."), field: `linea-${i}` },
      };
    }
    platoIds.push(platoId);
  }
  const unique = new Set(platoIds);
  if (unique.size !== platoIds.length) {
    return {
      ok: false,
      state: { ok: false, message: "No puedes repetir el mismo plato en dos líneas.", field: "lineas" },
    };
  }
  const platosDb = await prisma.plato.findMany({
    where: { id: { in: platoIds }, userId, ...notDeleted, active: true },
    select: { id: true, nombre: true, precioVenta: true },
  });
  const platoMap = new Map(platosDb.map((x) => [x.id, x]));
  const validLines: {
    platoId: string;
    cantidad: number;
    precioUnitario: Prisma.Decimal;
    subtotal: Prisma.Decimal;
  }[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i] as LineaJson;
    const lineNum = i + 1;
    const platoId = String(row.platoId ?? "").trim();
    const plato = platoMap.get(platoId);
    if (!plato) {
      return {
        ok: false,
        state: { ok: false, message: lineaMsg(lineNum, "el plato no es válido o no está activo."), field: `linea-${i}` },
      };
    }
    const cantRaw = row.cantidad;
    const cant =
      typeof cantRaw === "number" && Number.isInteger(cantRaw)
        ? cantRaw
        : typeof cantRaw === "string"
          ? Number(cantRaw.trim())
          : NaN;
    if (!Number.isInteger(cant) || cant < MIN_CANT || cant > MAX_CANT) {
      return {
        ok: false,
        state: {
          ok: false,
          message: lineaMsg(lineNum, `la cantidad debe ser un entero entre ${MIN_CANT} y ${MAX_CANT}.`),
          field: `linea-${i}`,
        },
      };
    }
    const precioUnitario = new Prisma.Decimal(plato.precioVenta.toString());
    const subtotal = precioUnitario.mul(cant);
    validLines.push({ platoId, cantidad: cant, precioUnitario, subtotal });
  }
  return { ok: true, validLines };
}

export async function editarVenta(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const ventaId = requiredString(formData, "ventaId");
    if (!ventaId) return { ok: false, message: "Venta inválida.", field: "ventaId" };

    const fechaRaw = requiredString(formData, "fecha");
    const horaRaw = requiredString(formData, "hora");
    const tipoRaw = requiredString(formData, "tipo");
    const canalRaw = requiredString(formData, "canal");
    const metodoPagoRaw = requiredString(formData, "metodoPago");
    const lineasRaw = requiredString(formData, "lineas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    const rangoCheck = validarRangoFechaVenta(fechaDb);
    if (rangoCheck) return { ...rangoCheck, field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
    }
    if (!horaRaw) return { ok: false, message: "La hora es obligatoria.", field: "hora" };
    if (!esHoraValida(horaRaw)) {
      return { ok: false, message: "Hora inválida (usa HH:MM).", field: "hora" };
    }
    const tipo = validarTipoVenta(tipoRaw);
    if (!tipo) return { ok: false, message: "Tipo de venta inválido.", field: "tipo" };

    let canal: CanalDomicilio | null = null;
    if (tipo === "DOMICILIO") {
      canal = validarCanalDomicilio(canalRaw);
      if (!canal) return { ok: false, message: "Canal de domicilio inválido.", field: "canal" };
    }

    const metodoPago = validarMetodoPago(metodoPagoRaw);
    if (!metodoPago) return { ok: false, message: "Método de pago inválido.", field: "metodoPago" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(lineasRaw || "[]");
    } catch {
      return { ok: false, message: "Formato de líneas inválido.", field: "lineas" };
    }

    if (!Array.isArray(parsed)) {
      return { ok: false, message: "Las líneas deben ser un arreglo.", field: "lineas" };
    }

    const platoIds = (parsed as LineaJson[]).map((row) =>
      typeof row.platoId === "string" ? row.platoId.trim() : "",
    );
    const uniqueIds = new Set(platoIds);
    if (uniqueIds.size !== platoIds.length) {
      return {
        ok: false,
        message: "No puedes registrar el mismo plato dos veces en la misma venta.",
        field: "lineas",
      };
    }

    const built = await buildValidVentaLinesFromParsed(userId, parsed);
    if (!built.ok) return built.state;
    const { validLines } = built;

    let totalGeneral = new Prisma.Decimal(0);
    for (const vl of validLines) {
      totalGeneral = totalGeneral.add(vl.subtotal);
    }

    await prisma.$transaction(async (tx) => {
      await tx.venta.update({
        where: { id: ventaId, userId },
        data: {
          fecha: fechaDb,
          hora: horaRaw.trim(),
          tipo,
          canal,
          total: totalGeneral,
          metodoPago,
        },
      });
      await tx.detalleVenta.deleteMany({ where: { ventaId, userId } });
      await tx.detalleVenta.createMany({
        data: validLines.map((vl) => ({
          userId,
          ventaId,
          platoId: vl.platoId,
          cantidad: vl.cantidad,
          precioUnitario: vl.precioUnitario,
        })),
      });
    });

    revalidatePath("/ventas");
    revalidateTag("metricas-dia");
    return { ok: true, message: "Venta actualizada." };
  } catch (e) {
    console.error("[editarVenta]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        ok: false,
        message: "Error de base de datos al actualizar la venta.",
        errorCode: "DB_ERROR",
      };
    }
    return {
      ok: false,
      message: "No se pudo actualizar la venta. Intenta de nuevo.",
      errorCode: "UNKNOWN",
    };
  }
}

export async function eliminarVenta(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const ventaId = requiredString(formData, "ventaId");
    if (!ventaId) return { ok: false, message: "Venta inválida." };

    const result = await prisma.$transaction(async (tx) => {
      await tx.detalleVenta.deleteMany({ where: { ventaId, userId } });
      return tx.venta.deleteMany({ where: { id: ventaId, userId } });
    });
    if (result.count === 0) return { ok: false, message: "Venta no encontrada." };

    revalidatePath("/ventas");
    revalidateTag("metricas-dia");
    return { ok: true, message: "Venta eliminada." };
  } catch (e) {
    console.error("[eliminarVenta]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        ok: false,
        message: "Error de base de datos al eliminar la venta.",
        errorCode: "DB_ERROR",
      };
    }
    return {
      ok: false,
      message: "No se pudo eliminar la venta.",
      errorCode: "UNKNOWN",
    };
  }
}

/**
 * Catálogo completo de platos para el chat IA.
 * A diferencia de getPlatosCatalogoVenta (que filtra active:true),
 * este endpoint incluye platos inactivos para que la IA pueda
 * responder preguntas sobre historial y distinguir entre
 * "el plato no existe" y "el plato está pausado".
 */
export async function getPlatosCatalogoCompleto() {
  try {
    const userId = await requireUserId();
    const platos = await prisma.plato.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        nombre: true,
        precioVenta: true,
        active: true,
        tipo: true,
        categoria: { select: { id: true, nombre: true } },
      },
      orderBy: { nombre: "asc" },
    });
    return {
      ok: true as const,
      platos: platos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precioVenta: Number(p.precioVenta.toString()),
        active: p.active,
        tipo: p.tipo,
        categoria: p.categoria ?? null,
      })),
    };
  } catch (e) {
    console.error("[getPlatosCatalogoCompleto]", e);
    return {
      ok: false as const,
      platos: [] as {
        id: string;
        nombre: string;
        precioVenta: number;
        active: boolean;
        tipo: import("@prisma/client").TipoPlato;
        categoria: { id: string; nombre: string } | null;
      }[],
    };
  }
}

