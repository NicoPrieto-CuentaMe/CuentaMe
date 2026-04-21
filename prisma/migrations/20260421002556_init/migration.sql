-- CreateEnum
CREATE TYPE "Unidad" AS ENUM ('GRAMO', 'KILOGRAMO', 'LIBRA', 'MILILITRO', 'LITRO', 'UNIDAD', 'PORCION', 'CAJA', 'BULTO', 'GARRAFA');

-- CreateEnum
CREATE TYPE "CategoriaProveedor" AS ENUM ('CARNES', 'LACTEOS', 'VERDURAS_Y_FRUTAS', 'GRANOS_Y_SECOS', 'BEBIDAS', 'LIMPIEZA_Y_DESECHABLES', 'OTRO');

-- CreateEnum
CREATE TYPE "CategoriaGasto" AS ENUM ('ARRIENDO', 'SERVICIOS_PUBLICOS', 'NOMINA', 'IMPUESTOS_Y_TASAS', 'MANTENIMIENTO', 'PUBLICIDAD', 'CONTABILIDAD', 'SEGURO', 'TECNOLOGIA', 'TRANSPORTE', 'OTRO');

-- CreateEnum
CREATE TYPE "PeriodicidadGasto" AS ENUM ('DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO');

-- CreateEnum
CREATE TYPE "MetodoPagoGasto" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'CHEQUE', 'OTRO');

-- CreateEnum
CREATE TYPE "RolEmpleado" AS ENUM ('ADMINISTRADOR', 'COCINERO', 'AUXILIAR_COCINA', 'MESERO', 'CAJERO', 'DOMICILIARIO', 'ASEADOR', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'PRESTACION_DE_SERVICIOS', 'APRENDIZAJE', 'OBRA_LABOR', 'INFORMAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "categorias" "CategoriaProveedor"[] DEFAULT ARRAY[]::"CategoriaProveedor"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidadBase" "Unidad" NOT NULL,
    "categoria" "CategoriaProveedor",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plato" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoriaId" TEXT,
    "precioVenta" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tieneReceta" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Plato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receta" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platoId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,4) NOT NULL,
    "unidad" "Unidad" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraDetalle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,4) NOT NULL,
    "unidad" "Unidad" NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompraDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "stockReal" DECIMAL(12,4) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "hora" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleVenta" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "platoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetalleVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "RolEmpleado" NOT NULL,
    "tipoContrato" "TipoContrato" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nomina" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "periodo" TIMESTAMP(3) NOT NULL,
    "salarioBase" DECIMAL(12,2) NOT NULL,
    "auxilioTransporte" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "horasExtra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otrosIngresos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deduccionSalud" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deduccionPension" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otrasDeduciones" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aportesSeguridadSocial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aporteParafiscales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "provisionPrestaciones" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netoEmpleado" DECIMAL(12,2) NOT NULL,
    "costoTotalEmpleador" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,

    CONSTRAINT "Nomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoFijo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "categoria" "CategoriaGasto" NOT NULL,
    "descripcion" VARCHAR(200),
    "monto" DECIMAL(12,2) NOT NULL,
    "periodicidad" "PeriodicidadGasto" NOT NULL,
    "metodoPago" "MetodoPagoGasto" NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GastoFijo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Proveedor_userId_deletedAt_idx" ON "Proveedor"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Insumo_userId_deletedAt_idx" ON "Insumo"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Categoria_userId_deletedAt_idx" ON "Categoria"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Plato_userId_deletedAt_idx" ON "Plato"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Receta_userId_idx" ON "Receta"("userId");

-- CreateIndex
CREATE INDEX "Receta_platoId_idx" ON "Receta"("platoId");

-- CreateIndex
CREATE INDEX "Receta_insumoId_idx" ON "Receta"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "Receta_platoId_insumoId_key" ON "Receta"("platoId", "insumoId");

-- CreateIndex
CREATE INDEX "Compra_userId_idx" ON "Compra"("userId");

-- CreateIndex
CREATE INDEX "Compra_proveedorId_idx" ON "Compra"("proveedorId");

-- CreateIndex
CREATE INDEX "CompraDetalle_userId_idx" ON "CompraDetalle"("userId");

-- CreateIndex
CREATE INDEX "CompraDetalle_compraId_idx" ON "CompraDetalle"("compraId");

-- CreateIndex
CREATE INDEX "CompraDetalle_insumoId_idx" ON "CompraDetalle"("insumoId");

-- CreateIndex
CREATE INDEX "Inventario_userId_idx" ON "Inventario"("userId");

-- CreateIndex
CREATE INDEX "Inventario_insumoId_idx" ON "Inventario"("insumoId");

-- CreateIndex
CREATE INDEX "Inventario_userId_insumoId_fecha_idx" ON "Inventario"("userId", "insumoId", "fecha");

-- CreateIndex
CREATE INDEX "Venta_userId_idx" ON "Venta"("userId");

-- CreateIndex
CREATE INDEX "DetalleVenta_userId_idx" ON "DetalleVenta"("userId");

-- CreateIndex
CREATE INDEX "DetalleVenta_ventaId_idx" ON "DetalleVenta"("ventaId");

-- CreateIndex
CREATE INDEX "DetalleVenta_platoId_idx" ON "DetalleVenta"("platoId");

-- CreateIndex
CREATE INDEX "Empleado_userId_deletedAt_idx" ON "Empleado"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Nomina_userId_idx" ON "Nomina"("userId");

-- CreateIndex
CREATE INDEX "Nomina_empleadoId_idx" ON "Nomina"("empleadoId");

-- CreateIndex
CREATE INDEX "Nomina_userId_periodo_idx" ON "Nomina"("userId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "Nomina_empleadoId_periodo_key" ON "Nomina"("empleadoId", "periodo");

-- CreateIndex
CREATE INDEX "GastoFijo_userId_idx" ON "GastoFijo"("userId");

-- CreateIndex
CREATE INDEX "GastoFijo_userId_fecha_idx" ON "GastoFijo"("userId", "fecha");

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plato" ADD CONSTRAINT "Plato_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plato" ADD CONSTRAINT "Plato_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_platoId_fkey" FOREIGN KEY ("platoId") REFERENCES "Plato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receta" ADD CONSTRAINT "Receta_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraDetalle" ADD CONSTRAINT "CompraDetalle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraDetalle" ADD CONSTRAINT "CompraDetalle_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraDetalle" ADD CONSTRAINT "CompraDetalle_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_platoId_fkey" FOREIGN KEY ("platoId") REFERENCES "Plato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoFijo" ADD CONSTRAINT "GastoFijo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
