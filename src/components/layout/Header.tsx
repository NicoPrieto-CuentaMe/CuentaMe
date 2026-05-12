"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import { LogOut, Menu } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/chat":          "CuentaMe IA",
  "/dashboard":     "Análisis",
  "/ventas":        "Ventas",
  "/compras":       "Compras",
  "/inventario":    "Inventario",
  "/gastos":        "Gastos fijos",
  "/configuracion": "Configuración",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.keys(PAGE_TITLES).find((key) => pathname.startsWith(key + "/"));
  return match ? PAGE_TITLES[match] : "CuentaMe";
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const fecha = now.toLocaleDateString("es-CO", {
    weekday: "short",
    day:     "2-digit",
    month:   "short",
  });
  const hora = now.toLocaleTimeString("es-CO", {
    hour:   "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div style={{ textAlign: "right" }}>
      <p
        style={{
          fontSize:      11,
          fontWeight:    510,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color:         "var(--fg-3)",
          lineHeight:    1,
        }}
      >
        {fecha}
      </p>
      <p
        className="tabular"
        style={{
          fontSize:      18,
          fontWeight:    510,
          letterSpacing: "-0.3px",
          color:         "var(--fg-1)",
          lineHeight:    1,
          marginTop:     4,
        }}
      >
        {hora}
      </p>
    </div>
  );
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname  = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header
      style={{
        height:        64,
        flexShrink:    0,
        display:       "flex",
        alignItems:    "center",
        justifyContent: "space-between",
        padding:       "0 20px",
        gap:           16,
        background:    "var(--bg-panel)",
        borderBottom:  "1px solid var(--border-subtle)",
      }}
    >
      {/* ── Izquierda: hamburger + título ─────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onMenuClick}
          aria-label="Abrir menú"
          style={{
            width:          38,
            height:         38,
            borderRadius:   8,
            background:     "rgba(255,255,255,0.04)",
            border:         "1px solid rgba(255,255,255,0.08)",
            color:          "var(--fg-2)",
            cursor:         "pointer",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            transition:     "all 150ms cubic-bezier(0.16,1,0.3,1)",
            flexShrink:     0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.07)";
            e.currentTarget.style.color      = "var(--fg-1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color      = "var(--fg-2)";
          }}
        >
          <Menu size={17} strokeWidth={1.8} />
        </button>

        <h1
          style={{
            fontSize:      15,
            fontWeight:    590,
            letterSpacing: "-0.2px",
            lineHeight:    1,
            color:         "var(--fg-1)",
            margin:        0,
          }}
        >
          {pageTitle}
        </h1>
      </div>

      {/* ── Derecha: reloj + cerrar sesión ────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <LiveClock />

        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           6,
              height:        34,
              padding:       "0 12px",
              borderRadius:  8,
              fontSize:      13,
              fontWeight:    510,
              color:         "var(--fg-3)",
              background:    "rgba(255,255,255,0.03)",
              border:        "1px solid var(--border)",
              cursor:        "pointer",
              transition:    "all 150ms cubic-bezier(0.16,1,0.3,1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color      = "var(--fg-1)";
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color      = "var(--fg-3)";
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
          >
            <LogOut size={14} strokeWidth={1.8} />
            <span>Salir</span>
          </button>
        </form>
      </div>
    </header>
  );
}
