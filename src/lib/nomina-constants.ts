import type { RolEmpleado, TipoContrato } from "@prisma/client";

export const ROL_LABELS: Record<RolEmpleado, string> = {
  ADMINISTRADOR: "Administrador",
  COCINERO: "Cocinero/a",
  AUXILIAR_COCINA: "Auxiliar de cocina",
  MESERO: "Mesero/a",
  CAJERO: "Cajero/a",
  DOMICILIARIO: "Domiciliario/a",
  ASEADOR: "Aseador/a",
  OTRO: "Otro",
};

export const TIPO_CONTRATO_LABELS: Record<TipoContrato, string> = {
  TERMINO_FIJO: "Término fijo",
  TERMINO_INDEFINIDO: "Término indefinido",
  PRESTACION_DE_SERVICIOS: "Prestación de servicios",
  APRENDIZAJE: "Aprendizaje",
  OBRA_LABOR: "Obra o labor",
  INFORMAL: "Informal",
};

// Constantes de nómina colombiana 2026 (Decretos 1469 de 2025 y 0159 de 2026).
// Los porcentajes (salud, pensión, ARL, parafiscales, prestaciones) son estables
// porque vienen del Código Sustantivo del Trabajo, no se actualizan cada año.
// TODO: cuando se implemente la edición de constantes por usuario, mover esto
// a un módulo de configuración con UI para editar.
export const SMLMV_2026 = 1_750_905;
export const AUXILIO_TRANSPORTE_2026 = 249_095;
export const PORC_SALUD_EMPLEADO = 0.04;
export const PORC_PENSION_EMPLEADO = 0.04;
export const PORC_SALUD_EMPLEADOR = 0.085;
export const PORC_PENSION_EMPLEADOR = 0.12;
export const PORC_ARL = 0.01044; // Riesgo II (cocina)
export const PORC_CAJA = 0.04;
export const PORC_PROVISION_PRESTACIONES = 0.2183;

/** Función de cálculo exportada para usar en el form y en la action */
export function calcularNomina(params: {
  salarioBase: number;
  horasExtra: number;
  otrosIngresos: number;
  otrasDeduciones?: number;
}) {
  const { salarioBase, horasExtra, otrosIngresos } = params;
  const otrasDed = Math.max(0, Math.round(params.otrasDeduciones ?? 0));
  const auxilio = salarioBase <= SMLMV_2026 * 2 ? AUXILIO_TRANSPORTE_2026 : 0;
  const dedSalud = Math.round(salarioBase * PORC_SALUD_EMPLEADO);
  const dedPension = Math.round(salarioBase * PORC_PENSION_EMPLEADO);
  const ss = Math.round(salarioBase * (PORC_SALUD_EMPLEADOR + PORC_PENSION_EMPLEADOR + PORC_ARL));
  const para = Math.round(salarioBase * PORC_CAJA);
  const prov = Math.round(salarioBase * PORC_PROVISION_PRESTACIONES);
  const neto = salarioBase + auxilio + horasExtra + otrosIngresos - dedSalud - dedPension - otrasDed;
  const costoTotal = neto + ss + para + prov;
  return { auxilio, dedSalud, dedPension, ss, para, prov, neto, costoTotal };
}
