"use server";

import { revalidatePath } from "next/cache";
import { Prisma, Unidad } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getFamiliaUnidad, sonUnidadesCompatibles } from "@/lib/unidades.config";
import type { ActionState } from "@/app/(main)/configuracion/actions";
import { UNIT_OPTIONS } from "@/app/(main)/configuracion/units";

function compraUnidadIncompatibleMsg(nombreInsumo: string, unidadBase: string, unidadCompra: string): string {
  const fam = getFamiliaUnidad(unidadBase);
  const famTxt =
    fam === "PESO" ? "peso" : fam === "VOLUMEN" ? "volumen" : fam === "CONTEO" ? "conteo" : "—";
  const baseLabel = UNIT_OPTIONS.find((u) => u.value === (unidadBase as Unidad))?.label ?? unidadBase;
  const compraLabel = UNIT_OPTIONS.find((u) => u.value === (unidadCompra as Unidad))?.label ?? unidadCompra;
  return `El insumo '${nombreInsumo}' se compra en ${baseLabel} (${famTxt}). No puedes usar ${compraLabel} en la compra.`;
}

const MAX_NOTAS = 500;
const MAX_CANTIDAD = new Prisma.Decimal(9_999);
const MAX_PRECIO_UNITARIO = new Prisma.Decimal(9_999_999);

const notDeleted = { deletedAt: null } as const;

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

function toPositiveDecimal(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Prisma.Decimal(n);
}

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("No autenticado.");
  return userId;
}

/** Fecha civil YYYY-MM-DD → inicio del día UTC (mediodía evita cortes por DST al mostrar). */
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

export async function registrarCompra(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();

    const fechaRaw = requiredString(formData, "fecha");
    const proveedorId = requiredString(formData, "proveedorId");
    const insumoId = requiredString(formData, "insumoId");
    const cantidadRaw = requiredString(formData, "cantidad");
    const unidadRaw = requiredString(formData, "unidad");
    const precioRaw = requiredString(formData, "precioUnitario");
    const notas = optionalString(formData, "notas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
    }

    if (!proveedorId) return { ok: false, message: "Selecciona un proveedor.", field: "proveedorId" };
    if (!insumoId) return { ok: false, message: "Selecciona un insumo.", field: "insumoId" };
    if (!cantidadRaw) return { ok: false, message: "La cantidad es obligatoria.", field: "cantidad" };
    if (!unidadRaw) return { ok: false, message: "Selecciona una unidad.", field: "unidad" };
    if (!precioRaw) return { ok: false, message: "El precio unitario es obligatorio.", field: "precioUnitario" };

    if (notas) {
      const nl = maxLength(notas, MAX_NOTAS, "Las notas");
      if (nl) return { ...nl, field: "notas" };
    }

    const [proveedor, insumo] = await Promise.all([
      prisma.proveedor.findFirst({
        where: { id: proveedorId, userId, ...notDeleted },
        select: { id: true },
      }),
      prisma.insumo.findFirst({
        where: { id: insumoId, userId, ...notDeleted },
        select: { id: true, nombre: true, unidadBase: true },
      }),
    ]);

    if (!proveedor) return { ok: false, message: "Proveedor inválido o inactivo.", field: "proveedorId" };
    if (!insumo) return { ok: false, message: "Insumo inválido o inactivo.", field: "insumoId" };

    const cantidad = toPositiveDecimal(cantidadRaw);
    if (!cantidad) return { ok: false, message: "La cantidad debe ser mayor a 0.", field: "cantidad" };
    if (cantidad.gt(MAX_CANTIDAD)) {
      return { ok: false, message: "La cantidad no puede superar 9.999.", field: "cantidad" };
    }

    const unidad = (Unidad as Record<string, Unidad>)[unidadRaw];
    if (!unidad) return { ok: false, message: "Unidad inválida.", field: "unidad" };

    if (!sonUnidadesCompatibles(insumo.unidadBase as string, unidadRaw)) {
      return {
        ok: false,
        message: compraUnidadIncompatibleMsg(insumo.nombre, insumo.unidadBase as string, unidadRaw),
        field: "unidad",
      };
    }

    const precioUnitario = toPositiveDecimal(precioRaw);
    if (!precioUnitario) {
      return { ok: false, message: "El precio unitario debe ser mayor a 0.", field: "precioUnitario" };
    }
    if (precioUnitario.gt(MAX_PRECIO_UNITARIO)) {
      return {
        ok: false,
        message: "El precio unitario no puede superar $9.999.999.",
        field: "precioUnitario",
      };
    }

    const total = cantidad.mul(precioUnitario);

    await prisma.compra.create({
      data: {
        userId,
        fecha: fechaDb,
        proveedorId,
        insumoId,
        cantidad,
        unidad,
        precioUnitario,
        total,
        notas: notas ?? null,
      },
    });

    revalidatePath("/compras");
    return { ok: true, message: "Compra registrada." };
  } catch (e) {
    console.error("[registrarCompra]", e);
    return { ok: false, message: "No se pudo registrar la compra. Intenta de nuevo." };
  }
}
