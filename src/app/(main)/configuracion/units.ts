import { Unidad } from "@prisma/client";

export const UNIT_OPTIONS: Array<{ value: Unidad; label: string }> = [
  { value: Unidad.GRAMO, label: "Gramo" },
  { value: Unidad.KILOGRAMO, label: "Kilogramo" },
  { value: Unidad.LIBRA, label: "Libra" },
  { value: Unidad.MILILITRO, label: "Mililitro" },
  { value: Unidad.LITRO, label: "Litro" },
  { value: Unidad.UNIDAD, label: "Unidad" },
  { value: Unidad.PORCION, label: "Porción" },
  { value: Unidad.CAJA, label: "Caja" },
  { value: Unidad.BULTO, label: "Bulto" },
  { value: Unidad.GARRAFA, label: "Garrafa" },
];

