"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/config";

const nav = [
  { href: "/dashboard", label: "Panel" },
  { href: "/ventas", label: "Ventas" },
  { href: "/compras", label: "Compras" },
  { href: "/chat", label: "Chat con IA" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="flex h-14 items-center border-b border-[var(--border)] px-5">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-accent">
          {APP_NAME}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-[var(--foreground)]/80 hover:bg-gray-100 hover:text-[var(--foreground)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
