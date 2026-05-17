import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#08090a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Gradiente radial desde arriba — iluminación brand */}
      <div style={{
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "800px",
        height: "600px",
        background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(94,106,210,0.22) 0%, rgba(94,106,210,0.08) 45%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 0,
      }} />
      {/* Gradiente secundario abajo izquierda */}
      <div style={{
        position: "absolute",
        bottom: "-100px",
        left: "-100px",
        width: "500px",
        height: "500px",
        background: "radial-gradient(ellipse, rgba(113,112,255,0.06) 0%, transparent 65%)",
        pointerEvents: "none",
        zIndex: 0,
      }} />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
        <LoginForm />
      </div>
    </div>
  );
}
