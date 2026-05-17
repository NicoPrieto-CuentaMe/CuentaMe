import { type Page, type Locator, expect } from "@playwright/test";

export class VentasPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navegación ─────────────────────────────────────────────────

  async goto() {
    await this.page.goto("/ventas");
    await this.page.waitForLoadState("networkidle");
  }

  // ── Tipo de venta ──────────────────────────────────────────────

  async seleccionarMesa() {
    await this.page.getByRole("button", { name: "Mesa", exact: true }).first().click();
  }

  async seleccionarPaLLevar() {
    await this.page.getByRole("button", { name: "Para llevar", exact: true }).first().click();
  }

  async seleccionarDomicilio() {
    await this.page.getByRole("button", { name: "Domicilio", exact: true }).first().click();
  }

  // ── Canal de domicilio ─────────────────────────────────────────

  get canalTrigger(): Locator {
    return this.page.getByRole("button", { name: /canal de domicilio/i }).first();
  }

  async seleccionarCanal(canal: string) {
    await this.canalTrigger.click();
    await this.page.getByRole("button", { name: canal, exact: true }).click();
  }

  // ── Método de pago ─────────────────────────────────────────────

  async seleccionarMetodoPago(metodo: string) {
    await this.page.getByTestId("metodo-pago-btn").click();
    await this.page.getByRole("button", { name: metodo, exact: true }).click();
  }

  // ── Catálogo ───────────────────────────────────────────────────

  get platosEnCatalogo(): Locator {
    return this.page.getByTestId("plato-card");
  }

  async agregarPrimerPlato() {
    const plato = this.platosEnCatalogo.first();
    await expect(plato).toBeVisible({ timeout: 8000 });
    await plato.click();
    await this.page.waitForTimeout(200);
  }

  async buscarPlato(texto: string) {
    const input = this.page.getByPlaceholder(/buscar/i).first();
    await input.fill(texto);
    await this.page.waitForTimeout(300);
  }

  // ── Pedido ─────────────────────────────────────────────────────

  get totalPedido(): Locator {
    return this.page.getByTestId("total-pedido");
  }

  get itemsLabel(): Locator {
    return this.page.getByTestId("items-label");
  }

  get estadoVacio(): Locator {
    return this.page.getByText(/pedido vacío/i);
  }

  get btnRegistrar(): Locator {
    return this.page.getByRole("button", { name: /registrar/i }).last();
  }

  async registrar() {
    await this.btnRegistrar.click();
    await expect(
      this.page.getByText(/venta registrada|registrada correctamente/i)
    ).toBeVisible({ timeout: 10000 });
  }

  async quitarPrimerPlatoDelPedido() {
    const btn = this.page.getByRole("button", { name: /quitar|menos/i }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
    }
  }

  // ── Historial ──────────────────────────────────────────────────

  async abrirHistorial() {
    await this.page.getByTestId("historial-toggle").click();
    await this.page.waitForTimeout(400);
  }

  get filasHistorial(): Locator {
    return this.page.getByRole("button", { name: /editar/i });
  }

  async editarPrimeraVenta() {
    const btn = this.filasHistorial.first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    await expect(this.page.getByText(/editando venta/i)).toBeVisible({ timeout: 3000 });
  }

  async cerrarEdicion() {
    await this.page.getByTestId("cerrar-edicion").click();
    await expect(this.page.getByText(/editando venta/i)).not.toBeVisible({ timeout: 3000 });
  }

  async guardarEdicion() {
    await this.page.getByRole("button", { name: /guardar cambios/i }).click();
    await expect(this.page.getByText(/editando venta/i)).not.toBeVisible({ timeout: 5000 });
  }

  async eliminarPrimeraVenta() {
    const btn = this.page.getByRole("button", { name: /eliminar/i }).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    await this.page.getByRole("button", { name: /confirmar/i }).click();
    await this.page.waitForTimeout(1000);
  }

  async cancelarEliminacion() {
    const btn = this.page.getByRole("button", { name: /eliminar/i }).first();
    await btn.click();
    await this.page.getByRole("button", { name: /cancelar/i }).first().click();
  }

  async obtenerIdPrimeraVenta(): Promise<string | null> {
    const fila = this.page.locator("[data-testid^='fila-venta-']").first();
    await expect(fila).toBeVisible({ timeout: 5000 });
    const testId = await fila.getAttribute("data-testid");
    return testId ? testId.replace("fila-venta-", "") : null;
  }

  async filaVenta(id: string): Promise<Locator> {
    return this.page.getByTestId(`fila-venta-${id}`);
  }

  // ── Sort ───────────────────────────────────────────────────────

  async sortPorColumna(testId: string) {
    const header = this.page.getByTestId(testId);
    if (await header.isVisible({ timeout: 3000 }).catch(() => false)) {
      await header.click();
      await this.page.waitForTimeout(300);
    }
  }

  // ── Filtro ─────────────────────────────────────────────────────

  async filtrarColumna(testId: string, valor: string) {
    const header = this.page.getByTestId(testId);
    if (await header.isVisible({ timeout: 3000 }).catch(() => false)) {
      await header.click();
      await this.page.waitForTimeout(200);
      const input = this.page.getByPlaceholder(/filtrar|buscar/i).last();
      if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
        await input.fill(valor);
        await this.page.waitForTimeout(300);
      }
    }
  }
}
