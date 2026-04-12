export const FAMILIAS_UNIDAD = {
  PESO: ["GRAMO", "KILOGRAMO", "LIBRA"],
  VOLUMEN: ["MILILITRO", "LITRO"],
  CONTEO: ["UNIDAD", "PORCION", "CAJA", "BULTO", "GARRAFA"],
} as const;

export type FamiliaUnidad = keyof typeof FAMILIAS_UNIDAD;

export function getFamiliaUnidad(unidad: string): FamiliaUnidad | null {
  for (const [familia, unidades] of Object.entries(FAMILIAS_UNIDAD) as [FamiliaUnidad, readonly string[]][]) {
    if (unidades.includes(unidad)) {
      return familia;
    }
  }
  return null;
}

export function sonUnidadesCompatibles(unidadBase: string, unidadReceta: string): boolean {
  const familiaBase = getFamiliaUnidad(unidadBase);
  const familiaReceta = getFamiliaUnidad(unidadReceta);
  if (!familiaBase || !familiaReceta) return true;
  return familiaBase === familiaReceta;
}

export function getUnidadesCompatibles(unidadBase: string): string[] {
  const familia = getFamiliaUnidad(unidadBase);
  if (!familia) return Object.values(FAMILIAS_UNIDAD).flat() as string[];
  return [...FAMILIAS_UNIDAD[familia]];
}

export const FAMILIA_LABEL_ES: Record<FamiliaUnidad, string> = {
  PESO: "Peso",
  VOLUMEN: "Volumen",
  CONTEO: "Conteo",
};
