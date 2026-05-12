import type { ReactNode } from "react";
import { getMetricasDia } from "@/app/actions/metricas-dia";
import { ShellLayout } from "./ShellLayout";

export async function AppShell({
  children,
  restaurantName,
}: {
  children:       ReactNode;
  restaurantName: string;
}) {
  const metricas = await getMetricasDia();

  return (
    <ShellLayout restaurantName={restaurantName} metricas={metricas}>
      {children}
    </ShellLayout>
  );
}
