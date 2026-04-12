import type { CategoriaProveedor } from "@prisma/client";

/** Opciones del enum `CategoriaProveedor` con etiquetas para UI. */
export const proveedorCategoriaOptions: { value: CategoriaProveedor; label: string }[] = [
  { value: "CARNES", label: "Carnes" },
  { value: "LACTEOS", label: "Lácteos" },
  { value: "VERDURAS_Y_FRUTAS", label: "Verduras y frutas" },
  { value: "GRANOS_Y_SECOS", label: "Granos y secos" },
  { value: "BEBIDAS", label: "Bebidas" },
  { value: "LIMPIEZA_Y_DESECHABLES", label: "Limpieza y desechables" },
  { value: "OTRO", label: "Otro" },
];

const labelByValue = Object.fromEntries(
  proveedorCategoriaOptions.map((o) => [o.value, o.label]),
) as Record<CategoriaProveedor, string>;

export function proveedorCategoriaLabel(c: CategoriaProveedor | null | undefined): string | null {
  if (c == null) return null;
  return labelByValue[c] ?? null;
}

export const insumoCategorias = [
  "Carnes",
  "Lácteos",
  "Verduras y frutas",
  "Granos y secos",
  "Bebidas",
  "Aceites y grasas",
  "Condimentos y salsas",
  "Panadería",
  "Limpieza y desechables",
  "Otro",
] as const;

export const platoCategorias = [
  "Entradas",
  "Platos fuertes",
  "Sopas y caldos",
  "Bebidas",
  "Postres",
  "Combos",
  "Otro",
] as const;
