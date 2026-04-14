"use server";

import { revalidatePath } from "next/cache";
import { CategoriaProveedor, Prisma, Unidad } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getFamiliaUnidad, sonUnidadesCompatibles } from "@/lib/unidades.config";
import { UNIT_OPTIONS } from "./units";

function recetaUnidadIncompatibleMsg(nombreInsumo: string, unidadBase: string, unidadReceta: string): string {
  const fam = getFamiliaUnidad(unidadBase);
  const famTxt =
    fam === "PESO" ? "peso" : fam === "VOLUMEN" ? "volumen" : fam === "CONTEO" ? "conteo" : "—";
  const baseLabel = UNIT_OPTIONS.find((u) => u.value === (unidadBase as Unidad))?.label ?? unidadBase;
  const recLabel = UNIT_OPTIONS.find((u) => u.value === (unidadReceta as Unidad))?.label ?? unidadReceta;
  return `El insumo '${nombreInsumo}' se compra en ${baseLabel} (${famTxt}). No puedes usar ${recLabel} en la receta.`;
}

const CATEGORIA_PROVEEDOR_SET = new Set<string>(Object.values(CategoriaProveedor));

function parseCategoriasProveedorForm(
  formData: FormData,
  key: string,
): { ok: true; value: CategoriaProveedor[] } | { ok: false; message: string } {
  const raw = formData.getAll(key);
  const out: CategoriaProveedor[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    if (!CATEGORIA_PROVEEDOR_SET.has(t)) {
      return { ok: false, message: "Categoría inválida." };
    }
    const v = t as CategoriaProveedor;
    if (!out.includes(v)) out.push(v);
  }
  return { ok: true, value: out };
}

function parseOptionalCategoriaProveedorSingle(
  raw: string | undefined,
): { ok: true; value: CategoriaProveedor | null } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: null };
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!CATEGORIA_PROVEEDOR_SET.has(t)) return { ok: false, message: "Categoría inválida." };
  return { ok: true, value: t as CategoriaProveedor };
}

export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; message: string; field?: string };

const MAX_NOMBRE = 100;
const MAX_TELEFONO_CHARS = 20;
const MAX_NOTAS = 500;
const MAX_PRECIO_VENTA = new Prisma.Decimal(2_000_000);
const MAX_CANTIDAD_RECETA = new Prisma.Decimal(9_999);

function maxLength(value: string, max: number, campo: string): { ok: false; message: string } | null {
  if (value.length > max) {
    return {
      ok: false,
      message: `${campo} no puede superar ${max} caracteres.`,
    };
  }
  return null;
}

function validarTelefono(tel: string): boolean {
  return /^[0-9+\-\s()]{1,20}$/.test(tel);
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

/** Filtro estándar para entidades con soft delete (listados y mutaciones sobre filas activas). */
const notDeleted = { deletedAt: null } as const;

export async function addSupplier(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const name = requiredString(formData, "name");
    const phone = optionalString(formData, "phone");
    if (!name) return { ok: false, message: "El nombre es obligatorio.", field: "name" };

    const nameLen = maxLength(name, MAX_NOMBRE, "El nombre");
    if (nameLen) return { ...nameLen, field: "name" };
    if (phone) {
      const phoneLen = maxLength(phone, MAX_TELEFONO_CHARS, "El teléfono");
      if (phoneLen) return { ...phoneLen, field: "phone" };
      if (!validarTelefono(phone)) {
        return {
          ok: false,
          message:
            "El teléfono solo puede contener números, +, -, espacios y paréntesis (máximo 20 caracteres).",
          field: "phone",
        };
      }
    }

    const catParsed = parseCategoriasProveedorForm(formData, "categorias");
    if (!catParsed.ok) return { ok: false, message: catParsed.message, field: "categorias" };

    await prisma.proveedor.create({
      data: { userId, nombre: name, telefono: phone, categorias: catParsed.value },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Proveedor agregado." };
  } catch (e) {
    console.error("[addSupplier]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un proveedor con ese nombre."
        : "No se pudo agregar el proveedor. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export async function deleteSupplier(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Proveedor inválido." };

    const res = await prisma.proveedor.updateMany({
      where: { id, userId, ...notDeleted },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) return { ok: false, message: "Proveedor no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Proveedor eliminado." };
  } catch (e) {
    console.error("[deleteSupplier]", e);
    return { ok: false, message: "No se pudo eliminar el proveedor." };
  }
}

export async function updateProveedor(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    const nombre = requiredString(formData, "nombre");
    const telefono = optionalString(formData, "telefono");
    const catParsed = parseCategoriasProveedorForm(formData, "categorias");
    if (!catParsed.ok) return { ok: false, message: catParsed.message };

    if (!id) return { ok: false, message: "Proveedor inválido." };
    if (!nombre) return { ok: false, message: "El nombre es obligatorio." };

    const nombreLen = maxLength(nombre, MAX_NOMBRE, "El nombre");
    if (nombreLen) return nombreLen;
    if (telefono) {
      const telLen = maxLength(telefono, MAX_TELEFONO_CHARS, "El teléfono");
      if (telLen) return { ...telLen, field: "telefono" };
      if (!validarTelefono(telefono)) {
        return {
          ok: false,
          message:
            "El teléfono solo puede contener números, +, -, espacios y paréntesis (máximo 20 caracteres).",
          field: "telefono",
        };
      }
    }

    const res = await prisma.proveedor.updateMany({
      where: { id, userId, ...notDeleted },
      data: { nombre, telefono: telefono ?? null, categorias: catParsed.value },
    });
    if (res.count === 0) return { ok: false, message: "Proveedor no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Proveedor actualizado." };
  } catch (e) {
    console.error("[updateProveedor]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un proveedor con ese nombre."
        : "No se pudo actualizar el proveedor.";
    return { ok: false, message };
  }
}

export async function addSupply(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const name = requiredString(formData, "name");
    const baseUnitRaw = requiredString(formData, "baseUnit");
    const categoriaRaw = optionalString(formData, "categoria");
    const categoriaParsed = parseOptionalCategoriaProveedorSingle(categoriaRaw);
    if (!categoriaParsed.ok) return { ok: false, message: categoriaParsed.message, field: "categoria" };

    if (!name) return { ok: false, message: "El nombre es obligatorio.", field: "name" };
    if (!baseUnitRaw) return { ok: false, message: "La unidad base es obligatoria.", field: "baseUnit" };

    const nameLen = maxLength(name, MAX_NOMBRE, "El nombre");
    if (nameLen) return { ...nameLen, field: "name" };

    const unidadBase = (Unidad as Record<string, Unidad>)[baseUnitRaw];
    if (!unidadBase) return { ok: false, message: "Unidad base inválida.", field: "baseUnit" };

    await prisma.insumo.create({
      data: { userId, nombre: name, unidadBase, categoria: categoriaParsed.value },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Insumo agregado." };
  } catch (e) {
    console.error("[addSupply]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un insumo con ese nombre."
        : "No se pudo agregar el insumo. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export type CheckInsumoEnUsoResult =
  | { ok: true; enUso: false }
  | { ok: true; enUso: true; platoNames: string[] }
  | { ok: false; message: string };

/**
 * Indica si el insumo aparece en alguna receta del usuario y devuelve los nombres de plato afectados (sin duplicados).
 */
export async function checkInsumoEnUso(insumoId: string): Promise<CheckInsumoEnUsoResult> {
  try {
    const userId = await requireUserId();
    const id = insumoId.trim();
    if (!id) return { ok: false, message: "Insumo inválido." };

    const insumo = await prisma.insumo.findFirst({
      where: { id, userId, ...notDeleted },
      select: { id: true },
    });
    if (!insumo) return { ok: false, message: "Insumo no encontrado." };

    const rows = await prisma.receta.findMany({
      where: { userId, insumoId: id },
      select: { plato: { select: { nombre: true } } },
    });

    if (rows.length === 0) return { ok: true, enUso: false };

    const seen = new Set<string>();
    const platoNames: string[] = [];
    for (const r of rows) {
      const n = r.plato.nombre;
      if (!seen.has(n)) {
        seen.add(n);
        platoNames.push(n);
      }
    }
    platoNames.sort((a, b) => a.localeCompare(b, "es"));

    return { ok: true, enUso: true, platoNames };
  } catch (e) {
    console.error("[checkInsumoEnUso]", e);
    return { ok: false, message: "No se pudo comprobar el uso del insumo." };
  }
}

/**
 * Elimina el insumo y, en la misma transacción, los registros de Receta que lo referencian (cascade en acción).
 */
export async function deleteInsumo(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Insumo inválido." };

    await prisma.$transaction(async (tx) => {
      await tx.receta.deleteMany({ where: { insumoId: id, userId } });
      const del = await tx.insumo.updateMany({
        where: { id, userId, ...notDeleted },
        data: { deletedAt: new Date() },
      });
      if (del.count === 0) throw new Error("Insumo no encontrado.");
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Insumo eliminado." };
  } catch (e) {
    console.error("[deleteInsumo]", e);
    const message =
      e instanceof Error ? e.message : "No se pudo eliminar el insumo. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export async function updateInsumo(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    const nombre = requiredString(formData, "nombre");
    const baseUnitRaw = requiredString(formData, "baseUnit");
    const categoriaRaw = optionalString(formData, "categoria");
    const categoriaParsed = parseOptionalCategoriaProveedorSingle(categoriaRaw);
    if (!categoriaParsed.ok) return { ok: false, message: categoriaParsed.message, field: "categoria" };

    if (!id) return { ok: false, message: "Insumo inválido." };
    if (!nombre) return { ok: false, message: "El nombre es obligatorio." };
    if (!baseUnitRaw) return { ok: false, message: "La unidad base es obligatoria." };

    const nombreLen = maxLength(nombre, MAX_NOMBRE, "El nombre");
    if (nombreLen) return nombreLen;

    const unidadBase = (Unidad as Record<string, Unidad>)[baseUnitRaw];
    if (!unidadBase) return { ok: false, message: "Unidad base inválida." };

    const res = await prisma.insumo.updateMany({
      where: { id, userId, ...notDeleted },
      data: { nombre, unidadBase, categoria: categoriaParsed.value },
    });
    if (res.count === 0) return { ok: false, message: "Insumo no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Insumo actualizado." };
  } catch (e) {
    console.error("[updateInsumo]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un insumo con ese nombre."
        : "No se pudo actualizar el insumo.";
    return { ok: false, message };
  }
}

export async function addDish(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const name = requiredString(formData, "name");
    const salePriceRaw = requiredString(formData, "salePrice");
    const activeRaw = formData.get("active");
    const active = activeRaw === "on" || activeRaw === "true";
    const categoriaIdRaw = optionalString(formData, "categoriaId");
    let categoriaId: string | null = null;
    if (categoriaIdRaw) {
      const cat = await prisma.categoria.findFirst({
        where: { id: categoriaIdRaw, userId, ...notDeleted },
        select: { id: true },
      });
      if (!cat) return { ok: false, message: "Categoría inválida.", field: "categoriaId" };
      categoriaId = categoriaIdRaw;
    }

    if (!name) return { ok: false, message: "El nombre es obligatorio.", field: "name" };
    const nameLen = maxLength(name, MAX_NOMBRE, "El nombre");
    if (nameLen) return { ...nameLen, field: "name" };
    const salePrice = toPositiveDecimal(salePriceRaw);
    if (!salePrice) return { ok: false, message: "El precio debe ser mayor a 0.", field: "salePrice" };
    if (salePrice.greaterThan(MAX_PRECIO_VENTA))
      return { ok: false, message: "El precio no puede superar $2.000.000.", field: "salePrice" };

    await prisma.plato.create({
      data: { userId, nombre: name, categoriaId, precioVenta: salePrice, active },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato agregado." };
  } catch (e) {
    console.error("[addDish]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un plato con ese nombre."
        : "No se pudo agregar el plato. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export async function deleteDish(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Plato inválido." };

    const res = await prisma.plato.updateMany({
      where: { id, userId, ...notDeleted },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) return { ok: false, message: "Plato no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato eliminado." };
  } catch (e) {
    console.error("[deleteDish]", e);
    return { ok: false, message: "No se pudo eliminar el plato." };
  }
}

export async function updatePlato(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    const nombre = requiredString(formData, "nombre");
    const salePriceRaw = requiredString(formData, "salePrice");
    const activeRaw = formData.get("active");
    const active = activeRaw === "on" || activeRaw === "true";
    const categoriaIdRaw = optionalString(formData, "categoriaId");
    let categoriaId: string | null = null;
    if (categoriaIdRaw) {
      const cat = await prisma.categoria.findFirst({
        where: { id: categoriaIdRaw, userId, ...notDeleted },
        select: { id: true },
      });
      if (!cat) return { ok: false, message: "Categoría inválida." };
      categoriaId = categoriaIdRaw;
    }

    if (!id) return { ok: false, message: "Plato inválido." };
    if (!nombre) return { ok: false, message: "El nombre es obligatorio." };
    const nombreLen = maxLength(nombre, MAX_NOMBRE, "El nombre");
    if (nombreLen) return nombreLen;
    const salePrice = toPositiveDecimal(salePriceRaw);
    if (!salePrice) return { ok: false, message: "El precio debe ser mayor a 0." };
    if (salePrice.greaterThan(MAX_PRECIO_VENTA))
      return { ok: false, message: "El precio no puede superar $2.000.000." };

    const res = await prisma.plato.updateMany({
      where: { id, userId, ...notDeleted },
      data: { nombre, categoriaId, precioVenta: salePrice, active },
    });
    if (res.count === 0) return { ok: false, message: "Plato no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato actualizado." };
  } catch (e) {
    console.error("[updatePlato]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un plato con ese nombre."
        : "No se pudo actualizar el plato.";
    return { ok: false, message };
  }
}

export async function createPlato(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const name = requiredString(formData, "name");
    const salePriceRaw = requiredString(formData, "salePrice");
    const activeRaw = formData.get("active");
    const active = activeRaw === "on" || activeRaw === "true";
    const tieneRecetaRaw = formData.get("tieneReceta");
    const tieneReceta = tieneRecetaRaw === "on" || tieneRecetaRaw === "true";
    const categoriaIdRaw = optionalString(formData, "categoriaId");
    let categoriaId: string | null = null;
    if (categoriaIdRaw) {
      const cat = await prisma.categoria.findFirst({
        where: { id: categoriaIdRaw, userId, ...notDeleted },
        select: { id: true },
      });
      if (!cat) return { ok: false, message: "Categoría inválida.", field: "categoriaId" };
      categoriaId = categoriaIdRaw;
    }

    if (!name) return { ok: false, message: "El nombre es obligatorio.", field: "name" };
    const nameLen = maxLength(name, MAX_NOMBRE, "El nombre");
    if (nameLen) return { ...nameLen, field: "name" };
    const salePrice = toPositiveDecimal(salePriceRaw);
    if (!salePrice) return { ok: false, message: "El precio debe ser mayor a 0.", field: "salePrice" };
    if (salePrice.greaterThan(MAX_PRECIO_VENTA))
      return { ok: false, message: "El precio no puede superar $2.000.000.", field: "salePrice" };

    await prisma.plato.create({
      data: {
        userId,
        nombre: name,
        categoriaId,
        precioVenta: salePrice,
        active,
        tieneReceta,
      },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato creado." };
  } catch (e) {
    console.error("[createPlato]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un plato con ese nombre."
        : "No se pudo crear el plato. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export async function updatePlatoCompleto(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    const nombre = requiredString(formData, "nombre");
    const salePriceRaw = requiredString(formData, "salePrice");
    const activeRaw = formData.get("active");
    const active = activeRaw === "on" || activeRaw === "true";
    const tieneRecetaRaw = formData.get("tieneReceta");
    const tieneReceta = tieneRecetaRaw === "on" || tieneRecetaRaw === "true";
    const categoriaIdRaw = optionalString(formData, "categoriaId");
    let categoriaId: string | null = null;
    if (categoriaIdRaw) {
      const cat = await prisma.categoria.findFirst({
        where: { id: categoriaIdRaw, userId, ...notDeleted },
        select: { id: true },
      });
      if (!cat) return { ok: false, message: "Categoría inválida." };
      categoriaId = categoriaIdRaw;
    }

    if (!id) return { ok: false, message: "Plato inválido." };
    if (!nombre) return { ok: false, message: "El nombre es obligatorio." };
    const nombreLen = maxLength(nombre, MAX_NOMBRE, "El nombre");
    if (nombreLen) return nombreLen;
    const salePrice = toPositiveDecimal(salePriceRaw);
    if (!salePrice) return { ok: false, message: "El precio debe ser mayor a 0." };
    if (salePrice.greaterThan(MAX_PRECIO_VENTA))
      return { ok: false, message: "El precio no puede superar $2.000.000." };

    const res = await prisma.plato.updateMany({
      where: { id, userId, ...notDeleted },
      data: {
        nombre,
        categoriaId,
        precioVenta: salePrice,
        active,
        tieneReceta,
      },
    });
    if (res.count === 0) return { ok: false, message: "Plato no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato actualizado." };
  } catch (e) {
    console.error("[updatePlatoCompleto]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un plato con ese nombre."
        : "No se pudo actualizar el plato.";
    return { ok: false, message };
  }
}

export async function createCategoria(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const nombre = requiredString(formData, "nombre");
    if (!nombre) return { ok: false, message: "El nombre es obligatorio.", field: "nombre" };

    const nombreLen = maxLength(nombre, MAX_NOMBRE, "El nombre");
    if (nombreLen) return { ...nombreLen, field: "nombre" };

    await prisma.categoria.create({
      data: { userId, nombre },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Categoría creada." };
  } catch (e) {
    console.error("[createCategoria]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe una categoría con ese nombre."
        : "No se pudo crear la categoría.";
    return { ok: false, message };
  }
}

export async function updateCategoria(id: string, nombre: string): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const trimmed = nombre.trim();
    if (!id.trim()) return { ok: false, message: "Categoría inválida." };
    if (!trimmed) return { ok: false, message: "El nombre no puede quedar vacío." };

    const nombreLen = maxLength(trimmed, MAX_NOMBRE, "El nombre");
    if (nombreLen) return nombreLen;

    const existing = await prisma.categoria.findFirst({
      where: { id, userId, ...notDeleted },
      select: { id: true },
    });
    if (!existing) return { ok: false, message: "Categoría no encontrada." };

    const dup = await prisma.categoria.findFirst({
      where: {
        userId,
        ...notDeleted,
        nombre: { equals: trimmed, mode: "insensitive" },
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) return { ok: false, message: "Ya existe una categoría con ese nombre." };

    const res = await prisma.categoria.updateMany({
      where: { id, userId, ...notDeleted },
      data: { nombre: trimmed },
    });
    if (res.count === 0) return { ok: false, message: "Categoría no encontrada." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Categoría actualizada." };
  } catch (e) {
    console.error("[updateCategoria]", e);
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe una categoría con ese nombre."
        : "No se pudo actualizar la categoría.";
    return { ok: false, message };
  }
}

export async function deleteCategoria(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Categoría inválida." };

    const existing = await prisma.categoria.findFirst({
      where: { id, userId, ...notDeleted },
      select: { id: true },
    });
    if (!existing) return { ok: false, message: "Categoría no encontrada." };

    const res = await prisma.categoria.updateMany({
      where: { id, userId, ...notDeleted },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) return { ok: false, message: "Categoría no encontrada." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Categoría eliminada." };
  } catch (e) {
    console.error("[deleteCategoria]", e);
    return { ok: false, message: "No se pudo eliminar la categoría." };
  }
}

export async function deletePlatoConReceta(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Plato inválido." };

    const del = await prisma.plato.updateMany({
      where: { id, userId, ...notDeleted },
      data: { deletedAt: new Date() },
    });
    if (del.count === 0) return { ok: false, message: "Plato no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato eliminado." };
  } catch (e) {
    console.error("[deletePlatoConReceta]", e);
    return { ok: false, message: "No se pudo eliminar el plato. Intenta de nuevo." };
  }
}

export async function addRecipeIngredient(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const dishId = requiredString(formData, "dishId");
    const supplyId = requiredString(formData, "supplyId");
    const quantityRaw = requiredString(formData, "quantity");
    const unitRaw = requiredString(formData, "unit");

    if (!dishId) return { ok: false, message: "Selecciona un plato.", field: "dishId" };
    if (!supplyId) return { ok: false, message: "Selecciona un insumo.", field: "supplyId" };

    const quantity = toPositiveDecimal(quantityRaw);
    if (!quantity) return { ok: false, message: "La cantidad debe ser mayor a 0.", field: "quantity" };

    const unidad = (Unidad as Record<string, Unidad>)[unitRaw];
    if (!unidad) return { ok: false, message: "Unidad inválida.", field: "unit" };

    const plato = await prisma.plato.findFirst({
      where: { id: dishId, userId, active: true, ...notDeleted },
      select: { id: true },
    });
    if (!plato) return { ok: false, message: "Plato inválido o inactivo.", field: "dishId" };

    const insumo = await prisma.insumo.findFirst({
      where: { id: supplyId, userId, ...notDeleted },
      select: { id: true },
    });
    if (!insumo) return { ok: false, message: "Insumo inválido.", field: "supplyId" };

    await prisma.receta.upsert({
      where: { platoId_insumoId: { platoId: dishId, insumoId: supplyId } },
      create: { userId, platoId: dishId, insumoId: supplyId, cantidad: quantity, unidad },
      update: { cantidad: quantity, unidad, userId },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Ingrediente agregado a la receta." };
  } catch (e) {
    console.error("[addRecipeIngredient]", e);
    return { ok: false, message: "No se pudo agregar el ingrediente." };
  }
}

export async function saveRecipeComplete(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const platoId = requiredString(formData, "dishId");
    const countRaw = requiredString(formData, "count");

    if (!platoId) return { ok: false, message: "Selecciona un plato.", field: "dishId" };
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return { ok: false, message: "El número de insumos debe estar entre 1 y 20.", field: "count" };
    }

    const plato = await prisma.plato.findFirst({
      where: { id: platoId, userId, active: true, ...notDeleted },
      select: { id: true },
    });
    if (!plato) return { ok: false, message: "Plato inválido o inactivo.", field: "dishId" };

    const rows = Array.from({ length: count }, (_, i) => {
      const insumoId = requiredString(formData, `supplyId_${i}`);
      const cantidadRaw = requiredString(formData, `quantity_${i}`);
      const unidadRaw = requiredString(formData, `unit_${i}`);
      return { insumoId, cantidadRaw, unidadRaw, index: i };
    });

    for (const r of rows) {
      if (!r.insumoId) return { ok: false, message: `Selecciona el insumo en la fila ${r.index + 1}.` };
      if (!r.cantidadRaw) return { ok: false, message: `Ingresa la cantidad en la fila ${r.index + 1}.` };
      if (!r.unidadRaw) return { ok: false, message: `Selecciona la unidad en la fila ${r.index + 1}.` };
    }

    const uniqueInsumos = new Set(rows.map((r) => r.insumoId));
    if (uniqueInsumos.size !== rows.length) {
      return { ok: false, message: "No puedes repetir el mismo insumo en más de una fila." };
    }

    const insumoIds = Array.from(uniqueInsumos);
    const existing = await prisma.insumo.findMany({
      where: { userId, id: { in: insumoIds }, ...notDeleted },
      select: { id: true, nombre: true, unidadBase: true },
    });
    if (existing.length !== insumoIds.length) {
      return { ok: false, message: "Uno o más insumos no son válidos." };
    }
    const insumoById = new Map(existing.map((i) => [i.id, i]));

    for (const r of rows) {
      const ins = insumoById.get(r.insumoId);
      if (!ins) continue;
      if (!sonUnidadesCompatibles(ins.unidadBase as string, r.unidadRaw)) {
        return {
          ok: false,
          message: recetaUnidadIncompatibleMsg(ins.nombre, ins.unidadBase as string, r.unidadRaw),
        };
      }
    }

    const data = rows.map((r) => {
      const cantidad = toPositiveDecimal(r.cantidadRaw);
      if (!cantidad) throw new Error(`Cantidad inválida en fila ${r.index + 1}.`);
      if (cantidad.greaterThan(MAX_CANTIDAD_RECETA)) {
        throw new Error(`La cantidad en fila ${r.index + 1} no puede superar 9.999.`);
      }
      const unidad = (Unidad as Record<string, Unidad>)[r.unidadRaw];
      if (!unidad) throw new Error(`Unidad inválida en fila ${r.index + 1}.`);
      return {
        userId,
        platoId,
        insumoId: r.insumoId,
        cantidad,
        unidad,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.receta.deleteMany({ where: { platoId, userId } });
      await tx.receta.createMany({ data });
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Receta guardada." };
  } catch (e) {
    console.error("[saveRecipeComplete]", e);
    const message = e instanceof Error ? e.message : "No se pudo guardar la receta. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export type RecetaIngredienteInput = {
  insumoId: string;
  cantidad: string;
  unidad: string;
};

export async function updateReceta(payload: {
  platoId: string;
  ingredientes: RecetaIngredienteInput[];
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const platoId = payload.platoId?.trim() ?? "";
    const ingredientes = payload.ingredientes ?? [];

    if (!platoId) return { ok: false, message: "Plato inválido." };
    if (ingredientes.length < 1) {
      return { ok: false, message: "Debe haber al menos 1 ingrediente." };
    }
    if (ingredientes.length > 50) {
      return { ok: false, message: "Demasiados ingredientes (máximo 50)." };
    }

    const plato = await prisma.plato.findFirst({
      where: { id: platoId, userId, ...notDeleted },
      select: { id: true },
    });
    if (!plato) return { ok: false, message: "Plato no encontrado." };

    const insumoIds = ingredientes.map((r) => r.insumoId.trim());
    if (insumoIds.some((id) => !id)) {
      return { ok: false, message: "Completa todos los insumos." };
    }
    if (new Set(insumoIds).size !== insumoIds.length) {
      return { ok: false, message: "No puedes repetir el mismo insumo en la receta." };
    }

    for (let i = 0; i < ingredientes.length; i++) {
      const r = ingredientes[i];
      if (!r.cantidad?.trim()) {
        return { ok: false, message: `Ingresa la cantidad en la fila ${i + 1}.` };
      }
      if (!r.unidad?.trim()) {
        return { ok: false, message: `Selecciona la unidad en la fila ${i + 1}.` };
      }
    }

    const uniqueIds = Array.from(new Set(insumoIds));
    const insumosOk = await prisma.insumo.findMany({
      where: { userId, id: { in: uniqueIds }, ...notDeleted },
      select: { id: true, nombre: true, unidadBase: true },
    });
    if (insumosOk.length !== uniqueIds.length) {
      return { ok: false, message: "Uno o más insumos no son válidos." };
    }
    const insumoById = new Map(insumosOk.map((i) => [i.id, i]));

    for (const r of ingredientes) {
      const ins = insumoById.get(r.insumoId.trim());
      if (!ins) continue;
      const uRec = r.unidad.trim();
      if (!sonUnidadesCompatibles(ins.unidadBase as string, uRec)) {
        return {
          ok: false,
          message: recetaUnidadIncompatibleMsg(ins.nombre, ins.unidadBase as string, uRec),
        };
      }
    }

    const data: {
      userId: string;
      platoId: string;
      insumoId: string;
      cantidad: Prisma.Decimal;
      unidad: Unidad;
    }[] = [];

    for (let i = 0; i < ingredientes.length; i++) {
      const r = ingredientes[i];
      const cantidad = toPositiveDecimal(r.cantidad.trim());
      if (!cantidad) {
        return { ok: false, message: `Cantidad inválida en fila ${i + 1}.` };
      }
      if (cantidad.greaterThan(MAX_CANTIDAD_RECETA)) {
        return { ok: false, message: `La cantidad en fila ${i + 1} no puede superar 9.999.` };
      }
      const unidad = (Unidad as Record<string, Unidad>)[r.unidad.trim()];
      if (!unidad) {
        return { ok: false, message: `Unidad inválida en la fila ${i + 1}.` };
      }
      data.push({
        userId,
        platoId,
        insumoId: r.insumoId.trim(),
        cantidad,
        unidad,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.receta.deleteMany({ where: { platoId, userId } });
      await tx.receta.createMany({ data });
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Receta actualizada." };
  } catch (e) {
    console.error("[updateReceta]", e);
    const message =
      e instanceof Error ? e.message : "No se pudo actualizar la receta. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export async function deleteRecipeIngredient(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Ingrediente inválido." };

    const res = await prisma.receta.deleteMany({
      where: { id, userId },
    });
    if (res.count === 0) return { ok: false, message: "Ingrediente no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Ingrediente eliminado." };
  } catch (e) {
    console.error("[deleteRecipeIngredient]", e);
    return { ok: false, message: "No se pudo eliminar el ingrediente." };
  }
}

/**
 * Cuenta nóminas del empleado (para advertencia antes de eliminar: el historial se conserva con soft delete).
 */
export async function countNominasEmpleado(
  empleadoId: string,
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    const id = empleadoId.trim();
    if (!id) return { ok: false, message: "Empleado inválido." };

    const empleado = await prisma.empleado.findFirst({
      where: { id, userId, ...notDeleted },
      select: { id: true },
    });
    if (!empleado) return { ok: false, message: "Empleado no encontrado." };

    const count = await prisma.nomina.count({ where: { empleadoId: id, userId } });
    return { ok: true, count };
  } catch (e) {
    console.error("[countNominasEmpleado]", e);
    return { ok: false, message: "No se pudo consultar las nóminas." };
  }
}

export async function deleteEmpleado(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Empleado inválido." };

    const res = await prisma.empleado.updateMany({
      where: { id, userId, ...notDeleted },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) return { ok: false, message: "Empleado no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Empleado eliminado." };
  } catch (e) {
    console.error("[deleteEmpleado]", e);
    return { ok: false, message: "No se pudo eliminar el empleado." };
  }
}

