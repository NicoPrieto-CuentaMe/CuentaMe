"use client";

import { useState } from "react";
import { TrendingUp, X } from "lucide-react";
import type { MetricasDia } from "@/app/actions/metricas-dia";

const fmtCop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function desgloseMetodoLinea(porMetodo: Record<string, number>) {
  return Object.entries(porMetodo)
    .filter(([, monto]) => monto > 0)
    .map(([metodo, monto]) => `${metodo} ${fmtCop.format(monto)}`);
}

export function WidgetDia({ metricas }: { metricas: MetricasDia | null }) {
  const [open, setOpen] = useState(false);

  const isEmptyDia =
    metricas != null &&
    metricas.numVentas === 0 &&
    metricas.totalCompras === 0 &&
    metricas.totalGastos === 0;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div
          className="absolute bottom-14 right-0 w-64 space-y-3 rounded-xl border border-border bg-surface p-4 shadow-xl"
          role="dialog"
          aria-label="Métricas del día"
        >
          {metricas == null ? (
            <p className="text-sm text-text-tertiary">Sin datos hoy</p>
          ) : isEmptyDia ? (
            <p className="text-sm text-text-tertiary">Sin movimientos hoy</p>
          ) : (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Hoy</h2>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-text-primary">Ventas</span>
                  <span className="text-sm font-semibold text-accent">{fmtCop.format(metricas.totalVentas)}</span>
                </div>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {metricas.numVentas} {metricas.numVentas === 1 ? "transacción" : "transacciones"}
                </p>
                {(() => {
                  const linea = desgloseMetodoLinea(metricas.porMetodo);
                  if (linea.length === 0) return null;
                  return <p className="mt-1.5 break-words text-xs text-text-tertiary">{linea.join(" · ")}</p>;
                })()}
              </div>
              <div className="h-px w-full bg-border" role="separator" />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-text-primary">Compras</span>
                  <span className="tabular-nums text-text-secondary">{fmtCop.format(metricas.totalCompras)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-text-primary">Gastos</span>
                  <span className="tabular-nums text-text-secondary">{fmtCop.format(metricas.totalGastos)}</span>
                </div>
              </div>
              <div className="h-px w-full bg-border" role="separator" />
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-medium text-text-primary">Balance</span>
                <span
                  className={`tabular-nums font-semibold ${
                    metricas.balance > 0
                      ? "text-accent"
                      : metricas.balance < 0
                        ? "text-danger"
                        : "text-text-secondary"
                  }`}
                >
                  {fmtCop.format(metricas.balance)}
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition ${
          open
            ? "border-accent bg-accent text-white"
            : "border border-border bg-surface text-text-primary"
        }`}
        aria-expanded={open}
        aria-label={open ? "Cerrar métricas del día" : "Abrir métricas del día"}
      >
        {open ? <X className="h-5 w-5" strokeWidth={2} /> : <TrendingUp className="h-5 w-5" strokeWidth={2} />}
      </button>
    </div>
  );
}
