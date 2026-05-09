import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_DIRECT_URL = process.env.TEST_DIRECT_URL;

if (!TEST_DATABASE_URL || !TEST_DIRECT_URL) {
  throw new Error(
    "TEST_DATABASE_URL y TEST_DIRECT_URL deben estar definidas en .env para correr pruebas."
  );
}

// Apuntar Prisma a la BD de pruebas
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DIRECT_URL;

export const prismaTest = new PrismaClient({
  datasources: {
    db: { url: TEST_DATABASE_URL },
  },
});

// Antes de todas las pruebas: aplicar migraciones a la BD de pruebas
beforeAll(async () => {
  execSync("npx prisma migrate deploy", {
    env: {
      ...process.env,
      DATABASE_URL: TEST_DIRECT_URL,
      DIRECT_URL: TEST_DIRECT_URL,
    },
    stdio: "inherit",
  });
});

// Después de todas las pruebas: cerrar conexión
afterAll(async () => {
  await prismaTest.$disconnect();
});
