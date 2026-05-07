/*
  Warnings:

  - A unique constraint covering the columns `[userId,key,entity]` on the table `IdempotencyRecord` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "IdempotencyRecord_userId_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_userId_key_entity_key" ON "IdempotencyRecord"("userId", "key", "entity");
