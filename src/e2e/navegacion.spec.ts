import { test, expect } from "@playwright/test";

test.describe("Navegación básica — usuario autenticado", () => {

  test("accede al chat desde la navegación", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/.*chat/);
    // Verificar el h1 específicamente, no cualquier texto en la página
    await expect(page.getByRole("heading", { name: "CuentaMe IA" })).toBeVisible();
  });

  test("accede a ventas", async ({ page }) => {
    await page.goto("/ventas");
    await expect(page).toHaveURL(/.*ventas/);
  });

  test("accede a compras", async ({ page }) => {
    await page.goto("/compras");
    await expect(page).toHaveURL(/.*compras/);
  });

  test("accede a inventario", async ({ page }) => {
    await page.goto("/inventario");
    await expect(page).toHaveURL(/.*inventario/);
  });

  test("accede a gastos", async ({ page }) => {
    await page.goto("/gastos");
    await expect(page).toHaveURL(/.*gastos/);
  });

  test("accede a configuración", async ({ page }) => {
    await page.goto("/configuracion");
    await expect(page).toHaveURL(/.*configuracion/);
  });

  test("login con contraseña incorrecta muestra error", async ({ page }) => {
    // Cerrar sesión primero para llegar al login limpio
    await page.goto("/login");

    // Si hay sesión activa, ir al logout y volver al login
    const esDashboard = page.url().includes("dashboard") ||
                        page.url().includes("chat") ||
                        page.url().includes("ventas");

    if (await page.getByRole("button", { name: /cerrar sesión/i }).isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /cerrar sesión/i }).click();
      await page.waitForURL(/.*login/, { timeout: 10000 });
    }

    // Ahora intentar login con contraseña incorrecta
    await page.locator("#email").fill("admin@cuenta.app");
    await page.locator("#password").fill("contraseña-incorrecta-123");
    await page.getByRole("button", { name: /ingresar/i }).click();

    // Debe mostrar mensaje de error sin redirigir
    await expect(
      page.getByText(/correo o contraseña incorrectos/i)
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/.*login/);
  });

  test("sidebar muestra todas las secciones correctamente", async ({ page }) => {
    await page.goto("/chat");

    // Verificar items del sidebar
    await expect(page.getByRole("link", { name: /ventas/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /compras/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /inventario/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /gastos/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /configuración/i })).toBeVisible();
  });
});
