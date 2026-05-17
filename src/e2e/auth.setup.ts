import { test as setup, expect } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
import path from "path";

const authFile = path.join(__dirname, ".auth/usuario.json");

setup("autenticar usuario de prueba", async ({ page }) => {
  // Navegar al login
  await page.goto("/login");

  // Esperar que el formulario esté visible
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();

  // Llenar credenciales del usuario de prueba
  await page.getByLabel("Correo electrónico").fill("admin@cuenta.app");
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD ?? "");

  // Submit
  await page.getByRole("button", { name: /ingresar/i }).click();

  // Esperar redirección al chat (página principal)
  await page.waitForURL(/\/(chat|dashboard)/, { timeout: 30000 });

  // Guardar estado de sesión para reutilizar en todas las pruebas
  await page.context().storageState({ path: authFile });
});
