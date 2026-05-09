import { PrismaClient } from "@prisma/client";

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

// Las migraciones se aplican una sola vez en global-setup.ts
// No repetir aquí para evitar timeouts en Neon Free tier.

// Después de todas las pruebas: cerrar conexión
afterAll(async () => {
  await prismaTest.$disconnect();
});
