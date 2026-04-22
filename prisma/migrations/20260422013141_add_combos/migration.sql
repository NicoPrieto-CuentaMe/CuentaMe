-- CreateEnum
CREATE TYPE "TipoPlato" AS ENUM ('PLATO', 'COMBO');

-- AlterTable
ALTER TABLE "Plato" ADD COLUMN     "tipo" "TipoPlato" NOT NULL DEFAULT 'PLATO';

-- CreateTable
CREATE TABLE "ComboItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "platoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboItem_comboId_idx" ON "ComboItem"("comboId");

-- CreateIndex
CREATE INDEX "ComboItem_platoId_idx" ON "ComboItem"("platoId");

-- CreateIndex
CREATE INDEX "ComboItem_userId_idx" ON "ComboItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboItem_comboId_platoId_key" ON "ComboItem"("comboId", "platoId");

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Plato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_platoId_fkey" FOREIGN KEY ("platoId") REFERENCES "Plato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
