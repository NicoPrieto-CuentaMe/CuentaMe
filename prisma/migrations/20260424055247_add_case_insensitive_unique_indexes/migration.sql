-- Reemplazar partial unique indexes por versiones case-insensitive
-- Previene duplicados como "Tomate" / "tomate" / "TOMATE" en las 5 tablas con soft delete

-- Eliminar los índices case-sensitive actuales
DROP INDEX IF EXISTS "Proveedor_userId_nombre_active_key";
DROP INDEX IF EXISTS "Insumo_userId_nombre_active_key";
DROP INDEX IF EXISTS "Plato_userId_nombre_active_key";
DROP INDEX IF EXISTS "Categoria_userId_nombre_active_key";
DROP INDEX IF EXISTS "Empleado_userId_nombre_active_key";

-- Crear nuevos índices case-insensitive sobre LOWER(nombre)
CREATE UNIQUE INDEX "Proveedor_userId_lower_nombre_active_key"
  ON public."Proveedor" ("userId", LOWER(nombre))
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Insumo_userId_lower_nombre_active_key"
  ON public."Insumo" ("userId", LOWER(nombre))
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Plato_userId_lower_nombre_active_key"
  ON public."Plato" ("userId", LOWER(nombre))
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Categoria_userId_lower_nombre_active_key"
  ON public."Categoria" ("userId", LOWER(nombre))
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Empleado_userId_lower_nombre_active_key"
  ON public."Empleado" ("userId", LOWER(nombre))
  WHERE "deletedAt" IS NULL;