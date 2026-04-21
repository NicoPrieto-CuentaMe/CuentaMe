import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getGastosFijos } from "@/app/actions/gastos";
import { GastosShell } from "@/components/gastos/GastosForm";

export default async function GastosPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const rows = await getGastosFijos();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Gastos fijos</h1>
        <p className="mt-1 text-sm text-text-tertiary">Registra tus costos fijos mensuales</p>
      </div>

      <GastosShell rows={rows} />
    </div>
  );
}
