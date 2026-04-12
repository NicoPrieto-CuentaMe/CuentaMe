"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/config";

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 15.1c.06-.2.11-.4.15-.6l1.65-1.28a.9.9 0 0 0 .2-1.15l-1.56-2.7a.9.9 0 0 0-1.08-.4l-1.97.79c-.32-.26-.67-.49-1.05-.69l-.3-2.1A.9.9 0 0 0 13.55 6h-3.1a.9.9 0 0 0-.89.76l-.3 2.1c-.38.2-.73.43-1.05.69l-1.97-.79a.9.9 0 0 0-1.08.4L3.6 11.86a.9.9 0 0 0 .2 1.15l1.65 1.28c.04.2.09.4.15.6-.06.2-.11.4-.15.6L3.8 16.77a.9.9 0 0 0-.2 1.15l1.56 2.7a.9.9 0 0 0 1.08.4l1.97-.79c.32.26.67.49 1.05.69l.3 2.1c.07.44.45.76.89.76h3.1c.44 0 .82-.32.89-.76l.3-2.1c.38-.2.73-.43 1.05-.69l1.97.79c.4.16.86 0 1.08-.4l1.56-2.7a.9.9 0 0 0-.2-1.15l-1.65-1.28c-.04-.2-.09-.4-.15-.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const nav = [
  { href: "/dashboard", label: "Panel" },
  { href: "/ventas", label: "Ventas" },
  { href: "/compras", label: "Compras" },
  { href: "/chat", label: "Chat con IA" },
  { href: "/configuracion", label: "Configuración", icon: GearIcon },
] as const;

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
          const Icon = "icon" in item ? item.icon : null;
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
                {Icon ? <Icon className="h-4 w-4" /> : null}
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
