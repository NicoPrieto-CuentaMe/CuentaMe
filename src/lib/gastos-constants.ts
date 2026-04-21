import type { CategoriaGasto, MetodoPagoGasto, PeriodicidadGasto } from "@prisma/client";

export const CATEGORIA_LABELS: Record<CategoriaGasto, string> = {
  ARRIENDO: "Arriendo",
  SERVICIOS_PUBLICOS: "Servicios públicos",
  NOMINA: "Nómina",
  IMPUESTOS_Y_TASAS: "Impuestos y tasas",
  MANTENIMIENTO: "Mantenimiento",
  PUBLICIDAD: "Publicidad",
  CONTABILIDAD: "Contabilidad",
  SEGURO: "Seguro",
  TECNOLOGIA: "Tecnología",
  TRANSPORTE: "Transporte",
  OTRO: "Otro",
};

export const PERIODICIDAD_LABELS: Record<PeriodicidadGasto, string> = {
  DIARIO: "Diario",
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
  BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
  UNICO: "Único",
};

export const METODO_PAGO_LABELS: Record<MetodoPagoGasto, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  CHEQUE: "Cheque",
  OTRO: "Otro",
};
