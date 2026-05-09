import { execSync } from "child_process";
import { config } from "dotenv";
import { resolve } from "path";

/**
 * Global setup: corre UNA SOLA VEZ antes de todos los archivos de prueba.
 * Aplica migraciones a la BD de pruebas sin repetir el comando por archivo.
 * Nota: globalSetup corre en proceso separado — debe cargar .env manualmente.
 */
export default function setup() {
  // Cargar .env desde la raíz del proyecto
  config({ path: resolve(process.cwd(), ".env") });

  const TEST_DIRECT_URL = process.env.TEST_DIRECT_URL;
  if (!TEST_DIRECT_URL) {
    throw new Error("TEST_DIRECT_URL debe estar definida en .env para correr pruebas.");
  }

  execSync("npx prisma migrate deploy", {
    env: {
      ...process.env,
      DATABASE_URL: TEST_DIRECT_URL,
      DIRECT_URL: TEST_DIRECT_URL,
    },
    stdio: "inherit",
  });
}
