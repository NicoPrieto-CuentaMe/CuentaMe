-- Partial unique indexes para soft delete
-- Garantizan unicidad de nombre por usuario solo entre filas activas (no soft-deleted).
-- Permiten que un nombre "reservado" pueda volver a usarse si el original fue eliminado.

CREATE UNIQUE INDEX "Proveedor_userId_nombre_active_key"
  ON public."Proveedor" ("userId", nombre)
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Insumo_userId_nombre_active_key"
  ON public."Insumo" ("userId", nombre)
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Plato_userId_nombre_active_key"
  ON public."Plato" ("userId", nombre)
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Categoria_userId_nombre_active_key"
  ON public."Categoria" ("userId", nombre)
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Empleado_userId_nombre_active_key"
  ON public."Empleado" ("userId", nombre)
  WHERE "deletedAt" IS NULL;