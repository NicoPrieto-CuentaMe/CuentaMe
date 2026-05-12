"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { WidgetDia } from "./WidgetDia";
import type { MetricasDia } from "@/app/actions/metricas-dia";

export function ShellLayout({
  children,
  restaurantName,
  metricas,
}: {
  children:       ReactNode;
  restaurantName: string;
  metricas:       MetricasDia;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        restaurantName={restaurantName}
      />

      <main className="flex-1 overflow-auto">
        {children}
      </main>

      <WidgetDia metricas={metricas} />
    </div>
  );
}
