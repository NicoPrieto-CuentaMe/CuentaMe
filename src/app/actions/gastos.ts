"use server";

import { revalidatePath } from "next/cache";
import {
  CategoriaGasto,
  MetodoPagoGasto,
  PeriodicidadGasto,
  Prisma,
} from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/app/(main)/configuracion/actions";

export type GastoFijoSerialized = {
  id: string;
  userId: string;
  fecha: Date;
  categoria: CategoriaGasto;
  monto: number;
  periodicidad: PeriodicidadGasto;
  metodoPago: MetodoPagoGasto;
  notas: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_NOTAS = 300;
const MAX_MONTO = new Prisma.Decimal(99_999_999);

function maxLength(value: string, max: number, campo: string): { ok: false; message: string } | null {
  if (value.length > max) {
    return {
      ok: false,
      message: `${campo} no puede superar ${max} caracteres.`,
    };
  }
  return null;
}

function requiredString(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optionalString(formData: FormData, key: string) {
  const v = formData.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
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

/** Monto COP positivo desde dígitos o número en string (validación server-side). */
function parseMontoCOP(raw: string): Prisma.Decimal | null {
  const t = raw.replace(/[^\d]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Prisma.Decimal(t);
}

function parseCategoria(raw: string): CategoriaGasto | null {
  const v = (CategoriaGasto as Record<string, CategoriaGasto>)[raw];
  return v ?? null;
}

function parsePeriodicidad(raw: string): PeriodicidadGasto | null {
  const v = (PeriodicidadGasto as Record<string, PeriodicidadGasto>)[raw];
  return v ?? null;
}

function parseMetodoPago(raw: string): MetodoPagoGasto | null {
  const v = (MetodoPagoGasto as Record<string, MetodoPagoGasto>)[raw];
  return v ?? null;
}

function validarRangoFecha(fecha: Date): { ok: false; message: string } | null {
  const hoy = new Date();
  const hace10Anos = new Date(hoy.getFullYear() - 10, 0, 1);
  const en30Dias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (fecha < hace10Anos) {
    return { ok: false, message: "La fecha es muy antigua (más de 10 años atrás)." };
  }
  if (fecha > en30Dias) {
    return { ok: false, message: "La fecha es muy futura (más de 30 días adelante)." };
  }
  return null;
}

export async function addGastoFijo(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();

    const fechaRaw = requiredString(formData, "fecha");
    const categoriaRaw = requiredString(formData, "categoria");
    const montoRaw = requiredString(formData, "monto");
    const periodicidadRaw = requiredString(formData, "periodicidad");
    const metodoPagoRaw = requiredString(formData, "metodoPago");
    const notas = optionalString(formData, "notas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    const rangoCheck = validarRangoFecha(fechaDb);
    if (rangoCheck) return { ...rangoCheck, field: "fecha" };

    if (!categoriaRaw) return { ok: false, message: "Selecciona una categoría.", field: "categoria" };
    const categoria = parseCategoria(categoriaRaw);
    if (!categoria) return { ok: false, message: "Categoría inválida.", field: "categoria" };

    const monto = parseMontoCOP(montoRaw);
    if (!monto) return { ok: false, message: "El monto debe ser mayor a 0.", field: "monto" };
    if (monto.gt(MAX_MONTO)) {
      return { ok: false, message: "El monto no puede superar $99.999.999.", field: "monto" };
    }

    if (!periodicidadRaw) return { ok: false, message: "Selecciona la periodicidad.", field: "periodicidad" };
    const periodicidad = parsePeriodicidad(periodicidadRaw);
    if (!periodicidad) return { ok: false, message: "Periodicidad inválida.", field: "periodicidad" };

    if (!metodoPagoRaw) return { ok: false, message: "Selecciona el método de pago.", field: "metodoPago" };
    const metodoPago = parseMetodoPago(metodoPagoRaw);
    if (!metodoPago) return { ok: false, message: "Método de pago inválido.", field: "metodoPago" };

    if (notas) {
      const nl = maxLength(notas, MAX_NOTAS, "Las notas");
      if (nl) return { ...nl, field: "notas" };
    }

    await prisma.gastoFijo.create({
      data: {
        userId,
        fecha: fechaDb,
        categoria,
        monto,
        periodicidad,
        metodoPago,
        notas: notas ?? null,
      },
    });

    revalidatePath("/gastos");
    return { ok: true, message: "Gasto registrado." };
  } catch (e) {
    console.error("[addGastoFijo]", e);
    return { ok: false, message: "No se pudo registrar el gasto. Intenta de nuevo." };
  }
}

export async function updateGastoFijo(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Gasto inválido.", field: "id" };

    const fechaRaw = requiredString(formData, "fecha");
    const categoriaRaw = requiredString(formData, "categoria");
    const montoRaw = requiredString(formData, "monto");
    const periodicidadRaw = requiredString(formData, "periodicidad");
    const metodoPagoRaw = requiredString(formData, "metodoPago");
    const notas = optionalString(formData, "notas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    const rangoCheck = validarRangoFecha(fechaDb);
    if (rangoCheck) return { ...rangoCheck, field: "fecha" };

    if (!categoriaRaw) return { ok: false, message: "Selecciona una categoría.", field: "categoria" };
    const categoria = parseCategoria(categoriaRaw);
    if (!categoria) return { ok: false, message: "Categoría inválida.", field: "categoria" };

    const monto = parseMontoCOP(montoRaw);
    if (!monto) return { ok: false, message: "El monto debe ser mayor a 0.", field: "monto" };
    if (monto.gt(MAX_MONTO)) {
      return { ok: false, message: "El monto no puede superar $99.999.999.", field: "monto" };
    }

    if (!periodicidadRaw) return { ok: false, message: "Selecciona la periodicidad.", field: "periodicidad" };
    const periodicidad = parsePeriodicidad(periodicidadRaw);
    if (!periodicidad) return { ok: false, message: "Periodicidad inválida.", field: "periodicidad" };

    if (!metodoPagoRaw) return { ok: false, message: "Selecciona el método de pago.", field: "metodoPago" };
    const metodoPago = parseMetodoPago(metodoPagoRaw);
    if (!metodoPago) return { ok: false, message: "Método de pago inválido.", field: "metodoPago" };

    if (notas) {
      const nl = maxLength(notas, MAX_NOTAS, "Las notas");
      if (nl) return { ...nl, field: "notas" };
    }

    const res = await prisma.gastoFijo.updateMany({
      where: { id, userId },
      data: {
        fecha: fechaDb,
        categoria,
        monto,
        periodicidad,
        metodoPago,
        notas: notas ?? null,
      },
    });
    if (res.count === 0) return { ok: false, message: "Gasto no encontrado.", field: "id" };

    revalidatePath("/gastos");
    return { ok: true, message: "Gasto actualizado." };
  } catch (e) {
    console.error("[updateGastoFijo]", e);
    return { ok: false, message: "No se pudo actualizar el gasto. Intenta de nuevo." };
  }
}

export async function deleteGastoFijo(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Gasto inválido." };

    const res = await prisma.gastoFijo.deleteMany({
      where: { id, userId },
    });
    if (res.count === 0) return { ok: false, message: "Gasto no encontrado." };

    revalidatePath("/gastos");
    return { ok: true, message: "Gasto eliminado." };
  } catch (e) {
    console.error("[deleteGastoFijo]", e);
    return { ok: false, message: "No se pudo eliminar el gasto." };
  }
}

export async function getGastosFijos(): Promise<GastoFijoSerialized[]> {
  try {
    const userId = await requireUserId();
    const rows = await prisma.gastoFijo.findMany({
      where: { userId },
      orderBy: { fecha: "desc" },
    });
    return rows.map((r) => ({
      ...r,
      monto: Number(r.monto),
    }));
  } catch (e) {
    console.error("[getGastosFijos]", e);
    return [];
  }
}
