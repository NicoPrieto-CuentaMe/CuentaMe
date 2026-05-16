import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getGastosFijos } from "@/app/actions/gastos";
import { GastosForm } from "@/components/gastos/GastosForm";
import { GastosHistorialWrapper } from "@/components/gastos/GastosHistorial";

export default async function GastosPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const rows = await getGastosFijos();

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, padding:"0 0 40px" }}>
      <div>
        <h1 style={{ font:"590 22px/1.15 Inter,sans-serif", color:"#f7f8f8", letterSpacing:"-0.5px", margin:0 }}>Gastos fijos</h1>
        <p style={{ font:"400 13px/1.45 Inter,sans-serif", color:"#62666d", margin:"5px 0 0" }}>Registra tus costos fijos mensuales.</p>
      </div>

      <section style={{ background:"linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:18, padding:"28px 32px 24px", display:"flex", flexDirection:"column", gap:20, boxShadow:"0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        <div style={{ font:"590 10px/1 Inter,sans-serif", color:"#62666d", letterSpacing:"1.6px", textTransform:"uppercase" }}>NUEVO GASTO</div>
        <GastosForm />
      </section>

      <GastosHistorialWrapper rows={rows} />
    </div>
  );
}
