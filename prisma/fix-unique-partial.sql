CREATE UNIQUE INDEX IF NOT EXISTS "Proveedor_userId_nombre_activo_key"
ON "Proveedor" ("userId", "nombre")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Insumo_userId_nombre_activo_key"
ON "Insumo" ("userId", "nombre")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Categoria_userId_nombre_activo_key"
ON "Categoria" ("userId", "nombre")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Plato_userId_nombre_activo_key"
ON "Plato" ("userId", "nombre")
WHERE "deletedAt" IS NULL;
