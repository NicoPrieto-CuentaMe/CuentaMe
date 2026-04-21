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
import { APP_NAME } from "@/lib/config";

const nav: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/chat", label: "CuentaMe IA", Icon: MessageSquare },
  { href: "/dashboard", label: "Análisis", Icon: BarChart2 },
  { href: "/ventas", label: "Ventas", Icon: ShoppingCart },
  { href: "/compras", label: "Compras", Icon: PackagePlus },
  { href: "/inventario", label: "Inventario", Icon: Warehouse },
  { href: "/gastos", label: "Gastos", Icon: Receipt },
  { href: "/configuracion", label: "Configuración", Icon: Settings2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-accent">
          {APP_NAME}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent-light text-accent"
                  : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
