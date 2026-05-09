import { prismaTest } from "./setup";
import bcrypt from "bcryptjs";

// ─── LIMPIEZA ────────────────────────────────────────────────────────────────

/**
 * Limpia todas las tablas de negocio en orden correcto (respeta FK constraints).
 * Se llama en beforeEach para que cada prueba empiece con BD limpia.
 */
export async function limpiarBD() {
  await prismaTest.$transaction([
    prismaTest.idempotencyRecord.deleteMany(),
    prismaTest.mensaje.deleteMany(),
    prismaTest.conversacion.deleteMany(),
    prismaTest.detalleVenta.deleteMany(),
    prismaTest.venta.deleteMany(),
    prismaTest.compraDetalle.deleteMany(),
    prismaTest.compra.deleteMany(),
    prismaTest.inventario.deleteMany(),
    prismaTest.nomina.deleteMany(),
    prismaTest.gastoFijo.deleteMany(),
    prismaTest.comboItem.deleteMany(),
    prismaTest.receta.deleteMany(),
    prismaTest.plato.deleteMany(),
    prismaTest.categoria.deleteMany(),
    prismaTest.insumo.deleteMany(),
    prismaTest.proveedor.deleteMany(),
    prismaTest.user.deleteMany(),
  ]);
}

// ─── FACTORIES ───────────────────────────────────────────────────────────────

/**
 * Crea un usuario de prueba con restaurante y devuelve su id.
 */
export async function crearUsuarioPrueba(overrides?: {
  email?: string;
  restaurantName?: string;
}): Promise<{ userId: string; email: string; password: string }> {
  const email = overrides?.email ?? "test@cuentame.app";
  const password = "Test1234!";
  const hash = await bcrypt.hash(password, 10);

  const user = await prismaTest.user.create({
    data: {
      email,
      password: hash,
      restaurantName: overrides?.restaurantName ?? "Restaurante Test",
    },
  });

  return { userId: user.id, email, password };
}

/**
 * Crea un proveedor de prueba para un usuario dado.
 */
export async function crearProveedorPrueba(
  userId: string,
  overrides?: { nombre?: string }
) {
  return prismaTest.proveedor.create({
    data: {
      userId,
      nombre: overrides?.nombre ?? "Proveedor Test",
      categorias: ["CARNES"],
    },
  });
}

/**
 * Crea un insumo de prueba para un usuario dado.
 */
export async function crearInsumoPrueba(
  userId: string,
  overrides?: { nombre?: string; unidadBase?: string }
) {
  return prismaTest.insumo.create({
    data: {
      userId,
      nombre: overrides?.nombre ?? "Pollo",
      unidadBase: (overrides?.unidadBase ?? "KILOGRAMO") as never,
    },
  });
}

/**
 * Crea un plato de prueba para un usuario dado.
 */
export async function crearPlatoPrueba(
  userId: string,
  overrides?: { nombre?: string; precioVenta?: number; tieneReceta?: boolean }
) {
  return prismaTest.plato.create({
    data: {
      userId,
      nombre: overrides?.nombre ?? "Bandeja Paisa",
      precioVenta: overrides?.precioVenta ?? 25000,
      tieneReceta: overrides?.tieneReceta ?? false,
    },
  });
}

/**
 * Crea una categoría de carta de prueba.
 */
export async function crearCategoriaPrueba(
  userId: string,
  overrides?: { nombre?: string }
) {
  return prismaTest.categoria.create({
    data: {
      userId,
      nombre: overrides?.nombre ?? "Platos principales",
    },
  });
}
