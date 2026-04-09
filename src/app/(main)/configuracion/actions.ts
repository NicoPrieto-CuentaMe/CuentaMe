"use server";

import { revalidatePath } from "next/cache";
import { Prisma, Unidad } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; message: string; field?: string };

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

export async function addSupplier(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const name = requiredString(formData, "name");
    const phone = optionalString(formData, "phone");
    const category = optionalString(formData, "category");

    if (!name) return { ok: false, message: "El nombre es obligatorio.", field: "name" };

    await prisma.proveedor.create({
      data: { userId, nombre: name, telefono: phone, categoria: category },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Proveedor agregado." };
  } catch (e) {
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

    const res = await prisma.proveedor.deleteMany({
      where: { id, userId },
    });
    if (res.count === 0) return { ok: false, message: "Proveedor no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Proveedor eliminado." };
  } catch {
    return { ok: false, message: "No se pudo eliminar el proveedor." };
  }
}

export async function addSupply(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const name = requiredString(formData, "name");
    const baseUnitRaw = requiredString(formData, "baseUnit");
    const category = optionalString(formData, "category");

    if (!name) return { ok: false, message: "El nombre es obligatorio.", field: "name" };
    if (!baseUnitRaw) return { ok: false, message: "La unidad base es obligatoria.", field: "baseUnit" };

    const unidadBase = (Unidad as Record<string, Unidad>)[baseUnitRaw];
    if (!unidadBase) return { ok: false, message: "Unidad base inválida.", field: "baseUnit" };

    await prisma.insumo.create({
      data: { userId, nombre: name, unidadBase, categoria: category },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Insumo agregado." };
  } catch (e) {
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Ya existe un insumo con ese nombre."
        : "No se pudo agregar el insumo. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export async function deleteSupply(formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const id = requiredString(formData, "id");
    if (!id) return { ok: false, message: "Insumo inválido." };

    const res = await prisma.insumo.deleteMany({
      where: { id, userId },
    });
    if (res.count === 0) return { ok: false, message: "Insumo no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Insumo eliminado." };
  } catch {
    return { ok: false, message: "No se pudo eliminar el insumo (puede estar usado en recetas)." };
  }
}

export async function addDish(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const name = requiredString(formData, "name");
    const category = optionalString(formData, "category");
    const salePriceRaw = requiredString(formData, "salePrice");
    const activeRaw = formData.get("active");
    const active = activeRaw === "on" || activeRaw === "true";

    if (!name) return { ok: false, message: "El nombre es obligatorio.", field: "name" };
    const salePrice = toPositiveDecimal(salePriceRaw);
    if (!salePrice) return { ok: false, message: "El precio de venta debe ser mayor a 0.", field: "salePrice" };

    await prisma.plato.create({
      data: { userId, nombre: name, categoria: category, precioVenta: salePrice, active },
    });

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato agregado." };
  } catch (e) {
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

    const res = await prisma.plato.deleteMany({
      where: { id, userId },
    });
    if (res.count === 0) return { ok: false, message: "Plato no encontrado." };

    revalidatePath("/configuracion");
    return { ok: true, message: "Plato eliminado." };
  } catch {
    return { ok: false, message: "No se pudo eliminar el plato (puede tener recetas)." };
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
      where: { id: dishId, userId, active: true },
      select: { id: true },
    });
    if (!plato) return { ok: false, message: "Plato inválido o inactivo.", field: "dishId" };

    const insumo = await prisma.insumo.findFirst({
      where: { id: supplyId, userId },
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
  } catch {
    return { ok: false, message: "No se pudo agregar el ingrediente. Intenta de nuevo." };
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
  } catch {
    return { ok: false, message: "No se pudo eliminar el ingrediente." };
  }
}

