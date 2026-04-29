-- Migración segura: convierte tipo y metodoPago de String a enum
-- preservando los 111 registros existentes de ventas.

-- Paso 1: Crear los 3 nuevos tipos enum
CREATE TYPE "TipoVenta" AS ENUM ('MESA', 'DOMICILIO', 'PARA_LLEVAR');
CREATE TYPE "CanalDomicilio" AS ENUM ('CLIENTE_DIRECTO', 'RAPPI', 'IFOOD', 'DIDI_FOOD', 'DELYFAS', 'TU_PEDIDO_CO');
CREATE TYPE "MetodoPagoVenta" AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA');

-- Paso 2: Agregar columna canal (nullable)
ALTER TABLE "Venta" ADD COLUMN "canal" "CanalDomicilio";

-- Paso 3: Poblar canal donde se conoce el canal de domicilio
UPDATE "Venta" SET "canal" = 'CLIENTE_DIRECTO'
  WHERE tipo = 'Domicilio · Cliente directo';

-- Paso 4: Convertir tipo String → TipoVenta usando columna temporal
ALTER TABLE "Venta" ADD COLUMN "tipo_new" "TipoVenta";
UPDATE "Venta" SET "tipo_new" = 'MESA'        WHERE tipo = 'Mesa';
UPDATE "Venta" SET "tipo_new" = 'DOMICILIO'   WHERE tipo LIKE 'Domicilio%';
UPDATE "Venta" SET "tipo_new" = 'PARA_LLEVAR' WHERE tipo = 'Llevar';
ALTER TABLE "Venta" ALTER COLUMN "tipo_new" SET NOT NULL;
ALTER TABLE "Venta" DROP COLUMN "tipo";
ALTER TABLE "Venta" RENAME COLUMN "tipo_new" TO "tipo";

-- Paso 5: Convertir metodoPago String → MetodoPagoVenta usando columna temporal
ALTER TABLE "Venta" ADD COLUMN "metodoPago_new" "MetodoPagoVenta";
UPDATE "Venta" SET "metodoPago_new" = 'EFECTIVO'        WHERE "metodoPago" = 'Efectivo';
UPDATE "Venta" SET "metodoPago_new" = 'TARJETA_DEBITO'  WHERE "metodoPago" = 'Tarjeta débito';
UPDATE "Venta" SET "metodoPago_new" = 'TARJETA_CREDITO' WHERE "metodoPago" = 'Tarjeta crédito';
UPDATE "Venta" SET "metodoPago_new" = 'NEQUI'           WHERE "metodoPago" = 'Nequi';
UPDATE "Venta" SET "metodoPago_new" = 'DAVIPLATA'       WHERE "metodoPago" = 'Daviplata';
UPDATE "Venta" SET "metodoPago_new" = 'TRANSFERENCIA'   WHERE "metodoPago" = 'Transferencia';
ALTER TABLE "Venta" ALTER COLUMN "metodoPago_new" SET NOT NULL;
ALTER TABLE "Venta" DROP COLUMN "metodoPago";
ALTER TABLE "Venta" RENAME COLUMN "metodoPago_new" TO "metodoPago";
