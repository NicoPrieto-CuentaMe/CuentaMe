"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Correo o contraseña incorrectos.");
        setPending(false);
        return;
      }
      router.replace("/chat");
      router.refresh();
    } catch {
      setError("No se pudo iniciar sesión. Intenta de nuevo.");
      setPending(false);
    }
  }

  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 20,
      padding: "40px 36px 36px",
      boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
      display: "flex",
      flexDirection: "column" as const,
    }}>
      {/* Logo + wordmark */}
      <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:14, marginBottom:40 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden>
            <defs>
              <linearGradient id="cm-login-grad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#818cf8" />
                <stop offset="1" stopColor="#5e6ad2" />
              </linearGradient>
            </defs>
            <path d="M9 3h14a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6h-7.2l-5.4 4.4a1 1 0 0 1-1.6-.78V26H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6Z" fill="url(#cm-login-grad)" />
            <path d="M9 19.5 13.5 15 17 17.5 23 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
            <circle cx="9" cy="19.5" r="1.6" fill="white" />
            <circle cx="13.5" cy="15" r="1.6" fill="white" />
            <circle cx="17" cy="17.5" r="1.6" fill="white" />
            <circle cx="23" cy="11" r="1.9" fill="white" />
          </svg>
          <span style={{ font:"510 28px/1 Inter,sans-serif", letterSpacing:"-0.6px", color:"#f7f8f8" }}>
            Cuenta<span style={{ fontWeight:590, color:"#7170ff" }}>Me</span>
          </span>
        </div>
        <p style={{ font:"400 13px/1.4 Inter,sans-serif", color:"#62666d", margin:0 }}>
          Habla con tu negocio
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column" as const, gap:14 }}>
        <div style={{ display:"flex", flexDirection:"column" as const, gap:6 }}>
          <label htmlFor="email" style={{ font:"510 11px/1 Inter,sans-serif", color:"#8a8f98" }}>
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="tu@restaurante.com"
            style={{ height:42, padding:"0 14px", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:10, color:"#f7f8f8", font:"510 14px/1 Inter,sans-serif", outline:"none", width:"100%", boxSizing:"border-box" as const }}
          />
        </div>

        <div style={{ display:"flex", flexDirection:"column" as const, gap:6 }}>
          <label htmlFor="password" style={{ font:"510 11px/1 Inter,sans-serif", color:"#8a8f98" }}>
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            style={{ height:42, padding:"0 14px", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:10, color:"#f7f8f8", font:"510 14px/1 Inter,sans-serif", outline:"none", width:"100%", boxSizing:"border-box" as const }}
          />
        </div>

        {error && (
          <div style={{ padding:"10px 14px", background:"rgba(224,82,82,0.10)", border:"1px solid rgba(224,82,82,0.25)", borderRadius:8 }}>
            <span style={{ font:"400 13px/1.4 Inter,sans-serif", color:"#ff8585" }}>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{
            marginTop: 6,
            height: 46,
            background: pending ? "rgba(255,255,255,0.06)" : "linear-gradient(180deg,#6b78de,#5e6ad2)",
            border: "1px solid",
            borderColor: pending ? "rgba(255,255,255,0.08)" : "rgba(113,112,255,0.5)",
            borderRadius: 12,
            color: "#fff",
            font: "590 15px/1 Inter,sans-serif",
            cursor: pending ? "not-allowed" : "pointer",
            boxShadow: pending ? "none" : "inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 20px rgba(94,106,210,0.40)",
            transition: "all 150ms cubic-bezier(0.16,1,0.3,1)",
            letterSpacing: "-0.2px",
          }}
        >
          {pending ? "Ingresando…" : "Ingresar →"}
        </button>
      </form>

      <p style={{ font:"400 11px/1.4 Inter,sans-serif", color:"#4a4d54", textAlign:"center", margin:"28px 0 0" }}>
        CuentaMe · Para restaurantes colombianos
      </p>
    </div>
  );
}
