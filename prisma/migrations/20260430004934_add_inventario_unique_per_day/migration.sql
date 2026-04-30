/*
  Warnings:

  - A unique constraint covering the columns `[userId,insumoId,fecha]` on the table `Inventario` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Inventario_userId_insumoId_fecha_key" ON "Inventario"("userId", "insumoId", "fecha");
