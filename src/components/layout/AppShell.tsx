import type { ReactNode } from "react";
import { getMetricasDia } from "@/app/actions/metricas-dia";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { WidgetDia } from "./WidgetDia";

export async function AppShell({
  children,
  restaurantName,
}: {
  children: ReactNode;
  restaurantName: string;
}) {
  const metricas = await getMetricasDia();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header restaurantName={restaurantName} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <WidgetDia metricas={metricas} />
    </div>
  );
}
