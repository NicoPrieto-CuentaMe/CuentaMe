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
const MIN_LINEAS = 1;
const MAX_LINEAS = 20;

const notDeleted = { deletedAt: null } as const;

function lineaMsg(lineNum1: number, msg: string): string {
  return `Línea ${lineNum1}: ${msg}`;
}

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

type LineaJson = {
  insumoId?: unknown;
  cantidad?: unknown;
  unidad?: unknown;
  precioUnitario?: unknown;
};

export async function registrarCompra(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();

    const fechaRaw = requiredString(formData, "fecha");
    const proveedorId = requiredString(formData, "proveedorId");
    const notas = optionalString(formData, "notas");
    const lineasRaw = requiredString(formData, "lineas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
    }

    if (!proveedorId) return { ok: false, message: "Selecciona un proveedor.", field: "proveedorId" };

    if (notas) {
      const nl = maxLength(notas, MAX_NOTAS, "Las notas");
      if (nl) return { ...nl, field: "notas" };
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
      return { ok: false, message: "Debe haber al menos una línea de insumo.", field: "lineas" };
    }
    if (parsed.length > MAX_LINEAS) {
      return { ok: false, message: `No puedes agregar más de ${MAX_LINEAS} líneas.`, field: "lineas" };
    }

    const proveedor = await prisma.proveedor.findFirst({
      where: { id: proveedorId, userId, ...notDeleted },
      select: { id: true },
    });
    if (!proveedor) return { ok: false, message: "Proveedor inválido o inactivo.", field: "proveedorId" };

    const insumoIds: string[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i] as LineaJson;
      const insumoId = typeof row.insumoId === "string" ? row.insumoId.trim() : "";
      if (!insumoId) {
        return {
          ok: false,
          message: lineaMsg(i + 1, "selecciona un insumo."),
          field: `linea-${i}`,
        };
      }
      insumoIds.push(insumoId);
    }

    const unique = new Set(insumoIds);
    if (unique.size !== insumoIds.length) {
      return {
        ok: false,
        message: "No puedes repetir el mismo insumo en dos líneas.",
        field: "lineas",
      };
    }

    const insumosDb = await prisma.insumo.findMany({
      where: { id: { in: insumoIds }, userId, ...notDeleted },
      select: { id: true, nombre: true, unidadBase: true },
    });
    const insumoMap = new Map(insumosDb.map((x) => [x.id, x]));

    type ValidLine = {
      insumoId: string;
      cantidad: Prisma.Decimal;
      unidad: Unidad;
      precioUnitario: Prisma.Decimal;
      total: Prisma.Decimal;
    };

    const validLines: ValidLine[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i] as LineaJson;
      const lineNum = i + 1;
      const insumoId = String(row.insumoId ?? "").trim();

      const insumo = insumoMap.get(insumoId);
      if (!insumo) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "el insumo no es válido."),
          field: `linea-${i}`,
        };
      }

      const cantidadRaw = typeof row.cantidad === "string" || typeof row.cantidad === "number" ? String(row.cantidad) : "";
      const cantidad = toPositiveDecimal(cantidadRaw.trim());
      if (!cantidad) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "la cantidad debe ser mayor a 0."),
          field: `linea-${i}`,
        };
      }
      if (cantidad.gt(MAX_CANTIDAD)) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "la cantidad no puede superar 9.999."),
          field: `linea-${i}`,
        };
      }

      const unidadRaw = typeof row.unidad === "string" ? row.unidad.trim() : "";
      const unidad = (Unidad as Record<string, Unidad>)[unidadRaw];
      if (!unidad) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "unidad inválida."),
          field: `linea-${i}`,
        };
      }

      if (!sonUnidadesCompatibles(insumo.unidadBase as string, unidadRaw)) {
        return {
          ok: false,
          message: lineaMsg(
            lineNum,
            compraUnidadIncompatibleMsg(insumo.nombre, insumo.unidadBase as string, unidadRaw),
          ),
          field: `linea-${i}`,
        };
      }

      const precioStr =
        typeof row.precioUnitario === "string"
          ? row.precioUnitario.replace(/[^\d]/g, "")
          : typeof row.precioUnitario === "number"
            ? String(Math.round(row.precioUnitario))
            : "";
      const precioUnitario = toPositiveDecimal(precioStr);
      if (!precioUnitario) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "el precio unitario debe ser mayor a 0."),
          field: `linea-${i}`,
        };
      }
      if (precioUnitario.gt(MAX_PRECIO_UNITARIO)) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "el precio unitario no puede superar $9.999.999."),
          field: `linea-${i}`,
        };
      }

      const total = cantidad.mul(precioUnitario);
      validLines.push({ insumoId, cantidad, unidad, precioUnitario, total });
    }

    let totalGeneral = new Prisma.Decimal(0);
    for (const vl of validLines) {
      totalGeneral = totalGeneral.add(vl.total);
    }

    await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.create({
        data: {
          userId,
          fecha: fechaDb,
          proveedorId,
          total: totalGeneral,
          notas: notas ?? null,
        },
      });
      await tx.compraDetalle.createMany({
        data: validLines.map((vl) => ({
          userId,
          compraId: compra.id,
          insumoId: vl.insumoId,
          cantidad: vl.cantidad,
          unidad: vl.unidad,
          precioUnitario: vl.precioUnitario,
          total: vl.total,
        })),
      });
    });

    revalidatePath("/compras");
    return { ok: true, message: "Compra registrada." };
  } catch (e) {
    console.error("[registrarCompra]", e);
    return { ok: false, message: "No se pudo registrar la compra. Intenta de nuevo." };
  }
}
