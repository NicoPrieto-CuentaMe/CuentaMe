"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/app/(main)/configuracion/actions";

const MAX_NOTAS_LINEA = 500;
const MAX_STOCK_REAL = new Prisma.Decimal(9_999);
const MIN_LINEAS = 1;
const MAX_LINEAS = 50;

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

/** stockReal >= 0, máximo 9.999, hasta 4 decimales razonables */
function parseStockReal(raw: string): Prisma.Decimal | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(t);
}

type LineaJson = {
  insumoId?: unknown;
  stockReal?: unknown;
  notas?: unknown;
};

export async function registrarInventario(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();

    const fechaRaw = requiredString(formData, "fecha");
    const lineasRaw = requiredString(formData, "lineas");

    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
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
      return {
        ok: false,
        message: "Ingresa el stock de al menos un insumo.",
        field: "lineas",
      };
    }
    if (parsed.length > MAX_LINEAS) {
      return { ok: false, message: `No puedes registrar más de ${MAX_LINEAS} insumos por conteo.`, field: "lineas" };
    }

    const insumoIds: string[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i] as LineaJson;
      const insumoId = typeof row.insumoId === "string" ? row.insumoId.trim() : "";
      if (!insumoId) {
        return {
          ok: false,
          message: lineaMsg(i + 1, "falta el insumo."),
          field: `linea-${i}`,
        };
      }
      insumoIds.push(insumoId);
    }

    const unique = new Set(insumoIds);
    if (unique.size !== insumoIds.length) {
      return {
        ok: false,
        message: "No puedes repetir el mismo insumo en el conteo.",
        field: "lineas",
      };
    }

    const insumosDb = await prisma.insumo.findMany({
      where: { id: { in: insumoIds }, userId, ...notDeleted },
      select: { id: true },
    });
    const insumoSet = new Set(insumosDb.map((x) => x.id));

    type ValidLine = {
      insumoId: string;
      stockReal: Prisma.Decimal;
      notas: string | null;
    };

    const validLines: ValidLine[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i] as LineaJson;
      const lineNum = i + 1;
      const insumoId = String(row.insumoId ?? "").trim();

      if (!insumoSet.has(insumoId)) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "el insumo no es válido o no pertenece a tu cuenta."),
          field: `linea-${i}`,
        };
      }

      const stockRaw =
        typeof row.stockReal === "string" || typeof row.stockReal === "number"
          ? String(row.stockReal)
          : "";
      const stockReal = parseStockReal(stockRaw);
      if (stockReal === null) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "el stock debe ser un número mayor o igual a 0."),
          field: `linea-${i}`,
        };
      }
      if (stockReal.gt(MAX_STOCK_REAL)) {
        return {
          ok: false,
          message: lineaMsg(lineNum, "el stock no puede superar 9.999."),
          field: `linea-${i}`,
        };
      }

      let notas: string | null = null;
      if (row.notas !== undefined && row.notas !== null) {
        const ns = typeof row.notas === "string" ? row.notas.trim() : "";
        if (ns) {
          const nl = maxLength(ns, MAX_NOTAS_LINEA, "Las notas");
          if (nl) return { ...nl, field: `linea-${i}` };
          notas = ns;
        }
      }

      validLines.push({ insumoId, stockReal, notas });
    }

    await prisma.$transaction(async (tx) => {
      for (const line of validLines) {
        const existing = await tx.inventario.findMany({
          where: { userId, insumoId: line.insumoId, fecha: fechaDb },
          orderBy: { createdAt: "asc" },
        });

        if (existing.length > 0) {
          const keep = existing[0]!;
          await tx.inventario.update({
            where: { id: keep.id },
            data: { stockReal: line.stockReal, notas: line.notas },
          });
          if (existing.length > 1) {
            await tx.inventario.deleteMany({
              where: { id: { in: existing.slice(1).map((e) => e.id) } },
            });
          }
        } else {
          await tx.inventario.create({
            data: {
              userId,
              insumoId: line.insumoId,
              fecha: fechaDb,
              stockReal: line.stockReal,
              notas: line.notas,
            },
          });
        }
      }
    });

    revalidatePath("/inventario");
    const n = validLines.length;
    return {
      ok: true,
      message: `Conteo registrado para ${n} insumos`,
    };
  } catch (e) {
    console.error("[registrarInventario]", e);
    return { ok: false, message: "No se pudo registrar el conteo. Intenta de nuevo." };
  }
}

export async function editarInventario(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const registroId = requiredString(formData, "registroId");
    const stockRaw = requiredString(formData, "stockReal");
    const notasRaw = typeof formData.get("notas") === "string" ? (formData.get("notas") as string).trim() : "";
    const fechaRaw = requiredString(formData, "fecha");

    if (!registroId) return { ok: false, message: "Registro inválido.", field: "registroId" };
    if (!fechaRaw) return { ok: false, message: "La fecha es obligatoria.", field: "fecha" };
    const fechaDb = fechaCivilToDb(fechaRaw);
    if (!fechaDb) return { ok: false, message: "Fecha inválida.", field: "fecha" };
    if (esFechaFutura(fechaRaw)) {
      return { ok: false, message: "La fecha no puede ser futura.", field: "fecha" };
    }

    const stockReal = parseStockReal(stockRaw);
    if (stockReal === null) {
      return { ok: false, message: "El stock debe ser un número mayor o igual a 0.", field: "stockReal" };
    }
    if (stockReal.gt(MAX_STOCK_REAL)) {
      return { ok: false, message: "El stock no puede superar 9.999.", field: "stockReal" };
    }

    let notas: string | null = null;
    if (notasRaw) {
      const nl = maxLength(notasRaw, MAX_NOTAS_LINEA, "Las notas");
      if (nl) return { ...nl, field: "notas" };
      notas = notasRaw;
    }

    const res = await prisma.inventario.updateMany({
      where: { id: registroId, userId },
      data: { stockReal, notas, fecha: fechaDb },
    });
    if (res.count === 0) {
      return { ok: false, message: "Registro no encontrado.", field: "registroId" };
    }

    revalidatePath("/inventario");
    return { ok: true, message: "Conteo actualizado." };
  } catch (e) {
    console.error("[editarInventario]", e);
    return { ok: false, message: "No se pudo actualizar el registro." };
  }
}

export async function eliminarInventario(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const registroId = requiredString(formData, "registroId");
    if (!registroId) return { ok: false, message: "Registro inválido." };

    const res = await prisma.inventario.deleteMany({
      where: { id: registroId, userId },
    });
    if (res.count === 0) {
      return { ok: false, message: "Registro no encontrado." };
    }

    revalidatePath("/inventario");
    return { ok: true, message: "Registro eliminado." };
  } catch (e) {
    console.error("[eliminarInventario]", e);
    return { ok: false, message: "No se pudo eliminar el registro." };
  }
}
