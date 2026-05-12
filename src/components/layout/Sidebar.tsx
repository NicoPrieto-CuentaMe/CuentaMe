"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  MessageSquare,
  PackagePlus,
  Receipt,
  Settings2,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href:      string;
  label:     string;
  Icon:      LucideIcon;
  disabled?: boolean;
}

const nav: NavItem[] = [
  { href: "/chat",          label: "CuentaMe IA",  Icon: MessageSquare },
  { href: "/dashboard",     label: "Análisis",      Icon: BarChart2,   disabled: true },
  { href: "/ventas",        label: "Ventas",        Icon: ShoppingCart },
  { href: "/compras",       label: "Compras",       Icon: PackagePlus },
  { href: "/inventario",    label: "Inventario",    Icon: Warehouse },
  { href: "/gastos",        label: "Gastos fijos",  Icon: Receipt },
  { href: "/configuracion", label: "Configuración", Icon: Settings2 },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar({
  open,
  onClose,
  restaurantName,
}: {
  open:           boolean;
  onClose:        () => void;
  restaurantName: string;
}) {
  const pathname = usePathname();

  return (
    <div
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        100,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   "absolute",
          inset:      0,
          background: "rgba(0,0,0,0.55)",
          opacity:    open ? 1 : 0,
          transition: "opacity 220ms cubic-bezier(0.16,1,0.3,1)",
        }}
      />

      {/* Panel */}
      <aside
        style={{
          position:    "absolute",
          top:         0,
          left:        0,
          bottom:      0,
          width:       232,
          background:  "var(--bg-panel)",
          borderRight: "1px solid var(--border-subtle)",
          display:     "flex",
          flexDirection: "column",
          transform:   open ? "translateX(0)" : "translateX(-100%)",
          transition:  "transform 280ms cubic-bezier(0.16,1,0.3,1)",
          boxShadow:   "4px 0 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* ── Logomark ───────────────────────────────────────── */}
        <div
          style={{
            height:        64,
            flexShrink:    0,
            display:       "flex",
            alignItems:    "center",
            gap:           10,
            padding:       "0 16px",
            borderBottom:  "1px solid var(--border-subtle)",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden style={{ flexShrink: 0 }}>
            <defs>
              <linearGradient id="cm-grad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#818cf8" />
                <stop offset="1" stopColor="#5e6ad2" />
              </linearGradient>
            </defs>
            <path
              d="M9 3h14a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6h-7.2l-5.4 4.4a1 1 0 0 1-1.6-.78V26H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6Z"
              fill="url(#cm-grad)"
            />
            <path
              d="M9 19.5 13.5 15 17 17.5 23 11"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />
            <circle cx="9" cy="19.5" r="1.6" fill="white" />
            <circle cx="13.5" cy="15" r="1.6" fill="white" />
            <circle cx="17" cy="17.5" r="1.6" fill="white" />
            <circle cx="23" cy="11" r="1.9" fill="white" />
          </svg>

          <span
            style={{
              flex:          1,
              fontSize:      15,
              lineHeight:    1,
              letterSpacing: "-0.2px",
              color:         "var(--fg-1)",
              fontWeight:    510,
            }}
          >
            Cuenta<span style={{ fontWeight: 590, color: "var(--accent)" }}>Me</span>
          </span>

          {/* Botón cerrar */}
          <button
            onClick={onClose}
            style={{
              width:          28,
              height:         28,
              borderRadius:   6,
              background:     "rgba(255,255,255,0.04)",
              border:         "1px solid rgba(255,255,255,0.06)",
              color:          "var(--fg-3)",
              cursor:         "pointer",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}
            aria-label="Cerrar menú"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Navegación ─────────────────────────────────────── */}
        <nav
          style={{
            flex:           1,
            padding:        10,
            display:        "flex",
            flexDirection:  "column",
            gap:            2,
            overflowY:      "auto",
          }}
        >
          {nav.map((item) => {
            const active   = pathname === item.href || pathname.startsWith(item.href + "/");
            const disabled = item.disabled ?? false;
            const Icon     = item.Icon;

            return (
              <Link
                key={item.href}
                href={disabled ? "#" : item.href}
                aria-disabled={disabled}
                onClick={(e) => {
                  if (disabled) { e.preventDefault(); return; }
                  onClose();
                }}
                style={{
                  display:       "flex",
                  alignItems:    "center",
                  gap:           10,
                  height:        36,
                  padding:       "0 12px",
                  borderRadius:  7,
                  fontSize:      13,
                  fontWeight:    510,
                  letterSpacing: "-0.1px",
                  lineHeight:    1,
                  color:  active   ? "#a4adff"
                        : disabled ? "var(--fg-4)"
                        : "var(--fg-3)",
                  background:    active ? "rgba(94,106,210,0.14)" : "transparent",
                  border:        "none",
                  cursor:        disabled ? "not-allowed" : "pointer",
                  textDecoration: "none",
                  transition:    "all 150ms cubic-bezier(0.16,1,0.3,1)",
                }}
                onMouseEnter={(e) => {
                  if (!active && !disabled) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color      = "var(--fg-1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active && !disabled) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color      = "var(--fg-3)";
                  }
                }}
              >
                <Icon
                  style={{ width: 15, height: 15, flexShrink: 0 }}
                  aria-hidden
                  strokeWidth={1.8}
                />
                <span style={{ flex: 1 }}>{item.label}</span>

                {disabled && (
                  <span
                    style={{
                      fontSize:      9,
                      fontWeight:    510,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      color:         "var(--fg-4)",
                      background:    "rgba(255,255,255,0.03)",
                      padding:       "3px 6px",
                      borderRadius:  4,
                    }}
                  >
                    Pronto
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Usuario ────────────────────────────────────────── */}
        <div
          style={{
            padding:    12,
            borderTop:  "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        10,
              padding:    6,
              borderRadius: 6,
            }}
          >
            <div
              style={{
                width:          28,
                height:         28,
                borderRadius:   "50%",
                background:     "var(--surface-2)",
                border:         "1px solid var(--border)",
                color:          "var(--fg-1)",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontSize:       12,
                fontWeight:     590,
                flexShrink:     0,
              }}
            >
              {getInitials(restaurantName)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  fontSize:      13,
                  fontWeight:    510,
                  lineHeight:    1.2,
                  color:         "var(--fg-1)",
                  overflow:      "hidden",
                  whiteSpace:    "nowrap",
                  textOverflow:  "ellipsis",
                }}
              >
                {restaurantName}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
