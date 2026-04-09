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

export async function deleteSupplier(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = requiredString(formData, "id");
  if (!id) throw new Error("Proveedor inválido.");

  const res = await prisma.proveedor.deleteMany({
    where: { id, userId },
  });
  if (res.count === 0) throw new Error("Proveedor no encontrado.");

  revalidatePath("/configuracion");
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

export async function deleteSupply(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = requiredString(formData, "id");
  if (!id) throw new Error("Insumo inválido.");

  const res = await prisma.insumo.deleteMany({
    where: { id, userId },
  });
  if (res.count === 0) throw new Error("Insumo no encontrado.");

  revalidatePath("/configuracion");
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

export async function deleteDish(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = requiredString(formData, "id");
  if (!id) throw new Error("Plato inválido.");

  const res = await prisma.plato.deleteMany({
    where: { id, userId },
  });
  if (res.count === 0) throw new Error("Plato no encontrado.");

  revalidatePath("/configuracion");
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
      where: { id: platoId, userId, active: true },
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
      where: { userId, id: { in: insumoIds } },
      select: { id: true },
    });
    if (existing.length !== insumoIds.length) {
      return { ok: false, message: "Uno o más insumos no son válidos." };
    }

    const ops = rows.map((r) => {
      const cantidad = toPositiveDecimal(r.cantidadRaw);
      if (!cantidad) throw new Error(`Cantidad inválida en fila ${r.index + 1}.`);
      const unidad = (Unidad as Record<string, Unidad>)[r.unidadRaw];
      if (!unidad) throw new Error(`Unidad inválida en fila ${r.index + 1}.`);

      return prisma.receta.upsert({
        where: { platoId_insumoId: { platoId, insumoId: r.insumoId } },
        create: { userId, platoId, insumoId: r.insumoId, cantidad, unidad },
        update: { userId, cantidad, unidad },
      });
    });

    await prisma.$transaction(ops);

    revalidatePath("/configuracion");
    return { ok: true, message: "Receta guardada." };
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo guardar la receta. Intenta de nuevo.";
    return { ok: false, message };
  }
}

export async function deleteRecipeIngredient(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = requiredString(formData, "id");
  if (!id) throw new Error("Ingrediente inválido.");

  const res = await prisma.receta.deleteMany({
    where: { id, userId },
  });
  if (res.count === 0) throw new Error("Ingrediente no encontrado.");

  revalidatePath("/configuracion");
}

