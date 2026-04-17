"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import {
  CANALES_DOMICILIO,
  DOMICILIO_PREFIX,
  METODOS_PAGO,
  TIPO_MESA,
} from "@/lib/ventas-constants";

const CANALES_SET = new Set<string>(CANALES_DOMICILIO);
const METODOS_SET = new Set<string>(METODOS_PAGO);

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
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return inputUtc > todayUtc;
}

/** HH:MM 24h */
function esHoraValida(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim());
}

function validarTipo(tipo: string): { ok: true; value: string } | { ok: false; message: string } {
  const t = tipo.trim();
  if (t === TIPO_MESA) return { ok: true, value: TIPO_MESA };
  if (!t.startsWith(DOMICILIO_PREFIX)) {
    return { ok: false, message: "Tipo de venta inválido." };
  }
  const canal = t.slice(DOMICILIO_PREFIX.length).trim();
  if (!canal || !CANALES_SET.has(canal)) {
    return { ok: false, message: "Canal de domicilio inválido." };
  }
  return { ok: true, value: `${DOMICILIO_PREFIX}${canal}` };
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
    const metodoPagoRaw = requiredString(formData, "metodoPago");
    const lineasRaw = requiredString(formData, "lineas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
    }

    if (!horaRaw) return { ok: false, message: "La hora es obligatoria.", field: "hora" };
    if (!esHoraValida(horaRaw)) {
      return { ok: false, message: "Hora inválida (usa HH:MM).", field: "hora" };
    }

    const tipoRes = validarTipo(tipoRaw);
    if (!tipoRes.ok) return { ...tipoRes, field: "tipo" };

    if (!metodoPagoRaw || !METODOS_SET.has(metodoPagoRaw)) {
      return { ok: false, message: "Método de pago inválido.", field: "metodoPago" };
    }

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

    await prisma.$transaction(async (tx) => {
      const venta = await tx.venta.create({
        data: {
          userId,
          fecha: fechaDb,
          hora: horaRaw.trim(),
          tipo: tipoRes.value,
          total: totalGeneral,
          metodoPago: metodoPagoRaw,
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
    });

    revalidatePath("/ventas");
    return { ok: true, message: "Venta registrada." };
  } catch (e) {
    console.error("[registrarVenta]", e);
    return { ok: false, message: "No se pudo registrar la venta. Intenta de nuevo." };
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
          ? parseInt(cantRaw.trim(), 10)
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

    const existente = await prisma.venta.findFirst({
      where: { id: ventaId, userId },
      select: { id: true },
    });
    if (!existente) return { ok: false, message: "Venta no encontrada.", field: "ventaId" };

    const fechaRaw = requiredString(formData, "fecha");
    const horaRaw = requiredString(formData, "hora");
    const tipoRaw = requiredString(formData, "tipo");
    const metodoPagoRaw = requiredString(formData, "metodoPago");
    const lineasRaw = requiredString(formData, "lineas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
    }
    if (!horaRaw) return { ok: false, message: "La hora es obligatoria.", field: "hora" };
    if (!esHoraValida(horaRaw)) {
      return { ok: false, message: "Hora inválida (usa HH:MM).", field: "hora" };
    }
    const tipoRes = validarTipo(tipoRaw);
    if (!tipoRes.ok) return { ...tipoRes, field: "tipo" };
    if (!metodoPagoRaw || !METODOS_SET.has(metodoPagoRaw)) {
      return { ok: false, message: "Método de pago inválido.", field: "metodoPago" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(lineasRaw || "[]");
    } catch {
      return { ok: false, message: "Formato de líneas inválido.", field: "lineas" };
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
        where: { id: ventaId },
        data: {
          fecha: fechaDb,
          hora: horaRaw.trim(),
          tipo: tipoRes.value,
          total: totalGeneral,
          metodoPago: metodoPagoRaw,
        },
      });
      await tx.detalleVenta.deleteMany({ where: { ventaId } });
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
    return { ok: true, message: "Venta actualizada." };
  } catch (e) {
    console.error("[editarVenta]", e);
    return { ok: false, message: "No se pudo actualizar la venta. Intenta de nuevo." };
  }
}

export async function eliminarVenta(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const ventaId = requiredString(formData, "ventaId");
    if (!ventaId) return { ok: false, message: "Venta inválida." };

    const existente = await prisma.venta.findFirst({
      where: { id: ventaId, userId },
      select: { id: true },
    });
    if (!existente) return { ok: false, message: "Venta no encontrada." };

    await prisma.$transaction(async (tx) => {
      await tx.detalleVenta.deleteMany({ where: { ventaId } });
      await tx.venta.delete({ where: { id: ventaId } });
    });

    revalidatePath("/ventas");
    return { ok: true, message: "Venta eliminada." };
  } catch (e) {
    console.error("[eliminarVenta]", e);
    return { ok: false, message: "No se pudo eliminar la venta." };
  }
}
