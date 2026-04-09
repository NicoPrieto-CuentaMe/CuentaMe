/** Digits only → string for hidden input / server */
export function digitsToSalePriceString(digits: string): string {
  const d = digits.replace(/[^\d]/g, "");
  if (!d) return "";
  const n = Number(d);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/** Formatted display: $ 15.000 */
export function formatCopFromDigits(digits: string): string {
  const d = digits.replace(/[^\d]/g, "");
  if (!d) return "";
  const n = Number(d);
  if (!Number.isFinite(n)) return "";
  return `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n)}`;
}

/** From DB decimal to digit string for initializing inline edit */
export function precioVentaToDigits(precio: unknown): string {
  const n = Number(precio);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n));
}
