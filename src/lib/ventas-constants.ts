import type { CanalDomicilio, MetodoPagoVenta, TipoVenta } from "@prisma/client";

export const TIPO_VENTA_LABELS: Record<TipoVenta, string> = {
  MESA: "Mesa",
  DOMICILIO: "Domicilio",
  PARA_LLEVAR: "Para llevar",
};

export const CANAL_DOMICILIO_LABELS: Record<CanalDomicilio, string> = {
  CLIENTE_DIRECTO: "Cliente directo",
  RAPPI: "Rappi",
  IFOOD: "iFood",
  DIDI_FOOD: "Didi Food",
  DELYFAS: "Delyfas",
  TU_PEDIDO_CO: "TuPedido.co",
};

export const METODO_PAGO_VENTA_LABELS: Record<MetodoPagoVenta, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia",
};

// CLIENTE_DIRECTO se cubre con "Para llevar". DELYFAS no está en uso.
// Se mantienen en el enum y labels para compatibilidad con registros existentes,
// pero no se ofrecen como opción al registrar nuevas ventas.
export const CANALES_DOMICILIO = (Object.keys(
  CANAL_DOMICILIO_LABELS,
) as CanalDomicilio[]).filter(
  (c) => c !== "CLIENTE_DIRECTO" && c !== "DELYFAS"
);

export const METODOS_PAGO_VENTA = Object.keys(
  METODO_PAGO_VENTA_LABELS,
) as MetodoPagoVenta[];
