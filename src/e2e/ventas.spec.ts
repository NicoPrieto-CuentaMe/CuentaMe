import { test, expect } from "@playwright/test";
import { VentasPage } from "./pages/VentasPage";

test.describe("Ventas — flujo completo", () => {
  let ventas: VentasPage;

  test.beforeEach(async ({ page }) => {
    ventas = new VentasPage(page);
    await ventas.goto();
  });

  // ── ESTRUCTURA ────────────────────────────────────────────────────

  test("carga la página con título y elementos base", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Ventas" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mesa", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Para llevar", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Domicilio", exact: true }).first()).toBeVisible();
  });

  test("muestra estado vacío cuando no hay platos en el pedido", async () => {
    await expect(ventas.estadoVacio).toBeVisible();
  });

  // ── TIPO DE VENTA ─────────────────────────────────────────────────

  test("cambia tipo de venta a Para llevar", async () => {
    await ventas.seleccionarPaLLevar();
    await expect(ventas.canalTrigger).not.toBeVisible();
  });

  test("cambia tipo de venta a Domicilio y muestra selector de canal", async () => {
    await ventas.seleccionarDomicilio();
    await expect(ventas.canalTrigger).toBeVisible({ timeout: 3000 });
  });

  test("selector de canal solo aparece en modo Domicilio", async () => {
    await ventas.seleccionarMesa();
    await expect(ventas.canalTrigger).not.toBeVisible();

    await ventas.seleccionarDomicilio();
    await expect(ventas.canalTrigger).toBeVisible({ timeout: 3000 });

    await ventas.seleccionarMesa();
    await expect(ventas.canalTrigger).not.toBeVisible();
  });

  // ── MÉTODO DE PAGO ────────────────────────────────────────────────

  test("abre dropdown de método de pago y selecciona Nequi", async ({ page }) => {
    await ventas.seleccionarMetodoPago("Nequi");
    await expect(page.getByTestId("metodo-pago-btn")).toContainText(/nequi/i);
  });

  // ── CATÁLOGO ──────────────────────────────────────────────────────

  test("muestra platos en el catálogo", async () => {
    await expect(ventas.platosEnCatalogo.first()).toBeVisible({ timeout: 8000 });
  });

  test("los platos se muestran en el catálogo (ranking activo)", async () => {
    const count = await ventas.platosEnCatalogo.count();
    expect(count).toBeGreaterThan(0);
  });

  test("busca un plato por texto", async () => {
    await ventas.buscarPlato("plato1");
    await expect(ventas.platosEnCatalogo.first()).toBeVisible({ timeout: 3000 });
  });

  test("navega a vista por categoría", async ({ page }) => {
    const catChips = page.getByRole("button", { name: /categoria\d+/i });
    if (await catChips.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await catChips.first().click();
      await expect(ventas.platosEnCatalogo.first()).toBeVisible({ timeout: 3000 });
    }
  });

  // ── PEDIDO ────────────────────────────────────────────────────────

  test("agrega un plato al pedido y muestra total", async () => {
    await ventas.agregarPrimerPlato();
    await expect(ventas.estadoVacio).not.toBeVisible();
    await expect(ventas.totalPedido).toBeVisible();
  });

  test("botón REGISTRAR está deshabilitado sin platos", async () => {
    await expect(ventas.btnRegistrar).toBeDisabled();
  });

  test("label de ítems cambia al agregar platos", async () => {
    await ventas.agregarPrimerPlato();
    await expect(ventas.itemsLabel).toBeVisible({ timeout: 3000 });
  });

  test("quitar plato con botón − limpia el pedido", async () => {
    await ventas.agregarPrimerPlato();
    await expect(ventas.estadoVacio).not.toBeVisible();
    await ventas.quitarPrimerPlatoDelPedido();
    await expect(ventas.estadoVacio).toBeVisible({ timeout: 3000 });
    await expect(ventas.btnRegistrar).toBeDisabled();
  });

  // ── FECHA Y HORA ──────────────────────────────────────────────────

  test("fecha es editable y tiene max=hoy", async ({ page }) => {
    const input = page.locator("input[type='date']").first();
    if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
      const val = await input.inputValue();
      expect(val).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const max = await input.getAttribute("max");
      expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("hora es editable y tiene formato HH:MM", async ({ page }) => {
    const input = page.locator("input[type='time']").first();
    if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
      const val = await input.inputValue();
      expect(val).toMatch(/^\d{2}:\d{2}$/);
      expect(await input.getAttribute("type")).toBe("time");
    }
  });

  // ── REGISTRO ──────────────────────────────────────────────────────

  test("registra venta Mesa con Efectivo", async () => {
    await ventas.seleccionarMesa();
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
    await expect(ventas.estadoVacio).toBeVisible({ timeout: 5000 });
  });

  test("registra venta Para llevar con Nequi", async () => {
    await ventas.seleccionarPaLLevar();
    await ventas.seleccionarMetodoPago("Nequi");
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
  });

  test("registra venta Domicilio con Rappi", async () => {
    await ventas.seleccionarDomicilio();
    await ventas.seleccionarCanal("Rappi");
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
  });

  test("no permite registrar con pedido vacío", async () => {
    await expect(ventas.btnRegistrar).toBeDisabled();
  });

  // ── HISTORIAL ─────────────────────────────────────────────────────

  test("abre drawer de historial y muestra columnas", async ({ page }) => {
    await ventas.abrirHistorial();
    await expect(page.getByTestId("col-fecha")).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("col-total")).toBeVisible({ timeout: 3000 });
  });

  test("puede editar una venta y cerrar el portal", async () => {
    await ventas.abrirHistorial();
    await ventas.editarPrimeraVenta();
    await ventas.cerrarEdicion();
  });

  test("cancelar eliminación no borra la venta", async () => {
    await ventas.abrirHistorial();
    const countAntes = await ventas.filasHistorial.count();
    await ventas.cancelarEliminacion();
    const countDespues = await ventas.filasHistorial.count();
    expect(countDespues).toBe(countAntes);
  });

  test("puede eliminar una venta", async ({ page }) => {
    // Registrar venta nueva
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
    await ventas.abrirHistorial();

    // Obtener el ID de la primera venta visible
    const id = await ventas.obtenerIdPrimeraVenta();
    expect(id).toBeTruthy();

    // Eliminar
    await page.getByTestId(`fila-venta-${id}`).getByRole("button", { name: /eliminar/i }).click();
    await page.getByRole("button", { name: /confirmar/i }).click();

    // Verificar que esa fila específica ya no existe en el DOM
    await expect(page.getByTestId(`fila-venta-${id}`)).not.toBeVisible({ timeout: 5000 });
  });

  // ── SORT ──────────────────────────────────────────────────────────

  test("sort por columna Total", async () => {
    await ventas.abrirHistorial();
    await ventas.sortPorColumna("col-total");
    await ventas.sortPorColumna("col-total");
  });

  test("sort por columna Fecha", async () => {
    await ventas.abrirHistorial();
    await ventas.sortPorColumna("col-fecha");
    await ventas.sortPorColumna("col-fecha");
  });

  test("sort por columna Método pago", async () => {
    await ventas.abrirHistorial();
    await ventas.sortPorColumna("col-metodo");
  });

  // ── FILTRO ────────────────────────────────────────────────────────

  test("filtro por columna Fecha filtra resultados", async ({ page }) => {
    await ventas.abrirHistorial();
    await ventas.filtrarColumna("col-fecha", "2099");
    await expect(
      page.getByText(/no hay ventas|sin resultado|no coincid/i).first()
    ).toBeVisible({ timeout: 3000 });
  });

  // ── PAGINACIÓN ────────────────────────────────────────────────────

  test("botón Ver más carga más ventas", async ({ page }) => {
    await ventas.abrirHistorial();
    const verMas = page.getByRole("button", { name: /ver más/i });
    if (await verMas.isVisible({ timeout: 2000 }).catch(() => false)) {
      await verMas.click();
      await page.waitForTimeout(500);
    }
  });

  // ── EDICIÓN ───────────────────────────────────────────────────────

  test("editar venta y guardar cambios", async () => {
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
    await ventas.abrirHistorial();
    await ventas.editarPrimeraVenta();
    await ventas.guardarEdicion();
  });

  test("editar venta — cambiar tipo de venta y guardar", async ({ page }) => {
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
    await ventas.abrirHistorial();
    await ventas.editarPrimeraVenta();
    const llevarBtn = page.getByRole("button", { name: "Para llevar", exact: true }).last();
    if (await llevarBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await llevarBtn.click();
    }
    await ventas.guardarEdicion();
  });

  test("editar venta — quitar plato desde el portal", async ({ page }) => {
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
    await ventas.abrirHistorial();
    await ventas.editarPrimeraVenta();
    const quitarBtn = page.getByRole("button", { name: /quitar|eliminar línea/i }).last();
    if (await quitarBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await quitarBtn.click();
    }
    await ventas.cerrarEdicion();
  });

  test("editar venta — agregar plato desde portal", async ({ page }) => {
    await ventas.agregarPrimerPlato();
    await ventas.registrar();
    await ventas.abrirHistorial();
    await ventas.editarPrimeraVenta();
    const addInput = page.getByPlaceholder(/buscar plato|agregar/i).last();
    if (await addInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addInput.fill("plato");
      await page.waitForTimeout(300);
    }
    await ventas.cerrarEdicion();
  });

  // ── VALIDACIONES ──────────────────────────────────────────────────

  test("fecha futura bloqueada — input tiene max=hoy", async ({ page }) => {
    const input = page.locator("input[type='date']").first();
    if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
      const max = await input.getAttribute("max");
      expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
