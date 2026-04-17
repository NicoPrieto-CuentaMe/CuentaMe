export const TIPO_MESA = "Mesa";

export const DOMICILIO_PREFIX = "Domicilio · ";

export const CANALES_DOMICILIO = [
  "Cliente directo",
  "Rappi",
  "iFood",
  "Didi Food",
  "Delyfas",
  "TuPedido.co",
] as const;

export const METODOS_PAGO = [
  "Efectivo",
  "Tarjeta débito",
  "Tarjeta crédito",
  "Nequi",
  "Daviplata",
  "Transferencia",
] as const;

export function tipoDomicilio(canal: string): string {
  return `${DOMICILIO_PREFIX}${canal}`;
}
