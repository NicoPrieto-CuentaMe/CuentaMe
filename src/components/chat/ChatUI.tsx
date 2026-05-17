"use client";

import ReactMarkdown from "react-markdown";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Plus, MessageSquare, Loader2, Trash2, Mic, MicOff } from "lucide-react";

type ConversacionResumen = {
  id: string;
  titulo: string | null;
  updatedAt: string;
};

type Mensaje = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  isStreaming?: boolean;
};

type SSEChunk =
  | { type: "text"; text: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_end"; toolName: string; result: string }
  | { type: "error"; message: string }
  | { type: "done"; conversacionId: string; mensajeId: string; mensajeUsuarioId: string };

/** Instancia mínima de Web Speech API (tipos globales no siempre presentes en lib.dom). */
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult:
    | ((
        event: { results: { [i: number]: { [j: number]: { transcript: string } } } },
      ) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

const TOOL_LABELS: Record<string, string> = {
  get_metricas_dia: "Consultando métricas del día...",
  get_ventas_rango: "Consultando ventas...",
  get_gastos_rango: "Consultando gastos...",
  get_compras_rango: "Consultando compras...",
  get_stock_actual: "Consultando inventario...",
  get_platos_catalogo: "Consultando menú...",
  registrar_venta: "Registrando venta...",
  registrar_compra: "Registrando compra...",
  registrar_gasto: "Registrando gasto...",
};

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function ChatUI({
  conversaciones: conversacionesIniciales,
}: {
  conversaciones: ConversacionResumen[];
}) {
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolActiva, setToolActiva] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [esperandoConfirmacion, setEsperandoConfirmacion] = useState(false);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, toolActiva]);

  // Auto-resize del textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const toggleMic = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      (window as unknown as {
        SpeechRecognition?: BrowserSpeechRecognitionCtor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
      }).SpeechRecognition ??
      (window as unknown as {
        SpeechRecognition?: BrowserSpeechRecognitionCtor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
      }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome en Android o escritorio.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "es-CO";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const nuevaConversacion = useCallback(() => {
    setConversacionId(null);
    setMensajes([]);
    setInput("");
    setToolActiva(null);
    inputRef.current?.focus();
  }, []);

  const eliminarConversacion = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (eliminandoId) return;
    setEliminandoId(id);
    try {
      const res = await fetch(`/api/chat/conversacion?id=${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConversaciones((prev) => prev.filter((c) => c.id !== id));
      if (conversacionId === id) {
        setConversacionId(null);
        setMensajes([]);
        setEsperandoConfirmacion(false);
      }
    } catch {
      // silencioso
    } finally {
      setEliminandoId(null);
    }
  }, [eliminandoId, conversacionId]);

  const historialAbortRef = useRef<AbortController | null>(null);

  const cargarConversacion = useCallback(async (id: string) => {
    // Cancelar fetch anterior si el usuario cambia de conversación rápido
    historialAbortRef.current?.abort();
    historialAbortRef.current = new AbortController();

    setConversacionId(id);
    setMensajes([]);
    setToolActiva(null);
    try {
      const res = await fetch(`/api/chat/historial?id=${id}`, {
        signal: historialAbortRef.current.signal,
      });
      if (!res.ok) return;
      const data = await res.json() as { mensajes: Mensaje[] };
      setMensajes(data.mensajes ?? []);
    } catch (e) {
      // AbortError es esperado al cambiar conversación — ignorar silenciosamente
      if ((e as Error).name !== "AbortError") {
        console.error("[cargarConversacion]", e);
      }
    }
  }, []);

  const enviar = useCallback(async () => {
    const texto = input.trim();
    if (!texto || isLoading) return;

    setInput("");
    setIsLoading(true);
    setToolActiva(null);

    // Generar idempotencyKey cuando el usuario está confirmando un registro.
    // Usamos el estado esperandoConfirmacion (que el servidor setea cuando Claude
    // muestra un preview) en lugar de keywords frágiles. Así cubrimos "sí", "dale",
    // "correcto" y cualquier otra forma natural de confirmar.
    const keyParaEnviar = esperandoConfirmacion
      ? crypto.randomUUID()
      : null;
    setIdempotencyKey(keyParaEnviar);

    setEsperandoConfirmacion(false);

    const idMensajeUsuario = `user-${Date.now()}`;
    const idMensajeAsistente = `asst-${Date.now()}`;

    // Agregar mensaje del usuario inmediatamente
    setMensajes((prev) => [
      ...prev,
      { id: idMensajeUsuario, role: "user", content: texto },
      { id: idMensajeAsistente, role: "assistant", content: "", isStreaming: true },
    ]);

    const toolsUsadas: string[] = [];
    let textoAcumulado = "";

    try {
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacionId, mensaje: texto, idempotencyKey: keyParaEnviar }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Error del servidor");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let chunk: SSEChunk;
          try {
            chunk = JSON.parse(raw) as SSEChunk;
          } catch {
            continue;
          }

          if (chunk.type === "text") {
            textoAcumulado += chunk.text;
            setMensajes((prev) =>
              prev.map((m) =>
                m.id === idMensajeAsistente
                  ? { ...m, content: textoAcumulado }
                  : m,
              ),
            );
          } else if (chunk.type === "tool_start") {
            setToolActiva(TOOL_LABELS[chunk.toolName] ?? chunk.toolName);
            if (!toolsUsadas.includes(chunk.toolName)) {
              toolsUsadas.push(chunk.toolName);
            }
          } else if (chunk.type === "tool_end") {
            setToolActiva(null);
          } else if (chunk.type === "error") {
            textoAcumulado = chunk.message;
            setMensajes((prev) =>
              prev.map((m) =>
                m.id === idMensajeAsistente
                  ? { ...m, content: chunk.message, isStreaming: false }
                  : m,
              ),
            );
          } else if (chunk.type === "done") {
            // Actualizar conversacionId si era nueva
            if (!conversacionId) {
              setConversacionId(chunk.conversacionId);
              setConversaciones((prev) => [
                {
                  id: chunk.conversacionId,
                  titulo: texto.slice(0, 40),
                  updatedAt: new Date().toISOString(),
                },
                ...prev,
              ]);
            }
            setMensajes((prev) =>
              prev.map((m) =>
                m.id === idMensajeAsistente
                  ? { ...m, isStreaming: false, toolsUsed: toolsUsadas }
                  : m,
              ),
            );
            // Detectar si Claude está esperando confirmación.
            // Solo activar cuando el system prompt muestra el preview explícito.
            // Se eliminó "para registrar" porque es ambiguo — Claude lo usa también
            // cuando pide datos ("necesito el monto para registrar"), no solo en previews.
            const textoFinal = textoAcumulado.toLowerCase();
            const esPreview =
              textoFinal.includes("confirmas") ||
              textoFinal.includes("¿confirmas") ||
              textoFinal.includes("resumen para confirmar");
            setEsperandoConfirmacion(esPreview);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMensajes((prev) =>
          prev.map((m) =>
            m.id === idMensajeAsistente
              ? {
                  ...m,
                  content: "Hubo un problema de conexión. Intenta de nuevo.",
                  isStreaming: false,
                }
              : m,
          ),
        );
      }
    } finally {
      setIsLoading(false);
      setToolActiva(null);
      inputRef.current?.focus();
    }
  }, [input, isLoading, conversacionId, esperandoConfirmacion]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  };
  return (
    <div style={{ 
      display:"flex", 
      height:"calc(100vh - 64px)",
      overflow:"hidden", 
      position:"fixed",
      top: 64,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1,
    }}>

      {/* ── Sidebar conversaciones ── */}
      <div style={{
        width: sidebarOpen ? 240 : 0,
        minWidth: sidebarOpen ? 240 : 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#0f1011",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        transition: "width 220ms cubic-bezier(0.16,1,0.3,1), min-width 220ms cubic-bezier(0.16,1,0.3,1)",
        flexShrink: 0,
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 14px 12px", borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0, whiteSpace:"nowrap", overflow:"hidden" }}>
          <span style={{ font:"510 11px/1 Inter,sans-serif", color:"#62666d", letterSpacing:"0.8px", textTransform:"uppercase" }}>Conversaciones</span>
          <button onClick={nuevaConversacion}
            style={{ display:"inline-flex", alignItems:"center", gap:4, height:26, padding:"0 8px", background:"rgba(113,112,255,0.10)", border:"1px solid rgba(113,112,255,0.20)", borderRadius:6, color:"#a4adff", font:"510 11px/1 Inter,sans-serif", cursor:"pointer" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nueva
          </button>
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {conversaciones.length === 0 ? (
            <p style={{ padding:"16px 14px", font:"400 12px/1.4 Inter,sans-serif", color:"#62666d" }}>No hay conversaciones aún.</p>
          ) : conversaciones.map(c => (
            <div key={c.id}
              onMouseEnter={() => setHoveredConvId(c.id)}
              onMouseLeave={() => setHoveredConvId(null)}
              style={{ position:"relative", overflow:"hidden", borderBottom:"1px solid rgba(255,255,255,0.03)", background: c.id === conversacionId ? "rgba(94,106,210,0.10)" : "transparent" }}>
              <button onClick={() => void cargarConversacion(c.id)}
                style={{ width:"100%", textAlign:"left", padding:"10px 36px 10px 14px", background:"transparent", border:"none", cursor:"pointer", display:"block" }}>
                <p style={{ font:"510 12px/1.3 Inter,sans-serif", color: c.id === conversacionId ? "#a4adff" : "#d0d6e0", margin:0, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", maxWidth:"100%" }}>
                  {c.titulo ?? "Sin título"}
                </p>
                <p style={{ font:"400 11px/1 Inter,sans-serif", color:"#62666d", margin:"4px 0 0" }}>{fmtFecha(c.updatedAt)}</p>
              </button>
              {hoveredConvId === c.id && (
                <button onClick={e => void eliminarConversacion(c.id, e)} disabled={eliminandoId === c.id}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(224,82,82,0.12)", border:"1px solid rgba(224,82,82,0.20)", borderRadius:5, color:"#ff8585", cursor:"pointer" }}>
                  {eliminandoId === c.id
                    ? <Loader2 style={{ width:10, height:10 }} className="animate-spin" />
                    : <Trash2 style={{ width:10, height:10 }} />}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Área principal ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, background:"#08090a" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 16px", height:52, borderBottom:"1px solid rgba(255,255,255,0.05)", background:"#0f1011", flexShrink:0 }}>
          <button onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Ocultar conversaciones" : "Mostrar conversaciones"}
            style={{ width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, color:"#8a8f98", cursor:"pointer", flexShrink:0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {sidebarOpen
                ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>
                : <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>
              }
            </svg>
          </button>

          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden style={{ flexShrink:0 }}>
            <defs>
              <linearGradient id="cm-header-grad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#818cf8" />
                <stop offset="1" stopColor="#5e6ad2" />
              </linearGradient>
            </defs>
            <path d="M9 3h14a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6h-7.2l-5.4 4.4a1 1 0 0 1-1.6-.78V26H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6Z" fill="url(#cm-header-grad)" />
            <path d="M9 19.5 13.5 15 17 17.5 23 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
            <circle cx="9" cy="19.5" r="1.6" fill="white" />
            <circle cx="13.5" cy="15" r="1.6" fill="white" />
            <circle cx="17" cy="17.5" r="1.6" fill="white" />
            <circle cx="23" cy="11" r="1.9" fill="white" />
          </svg>
          <div>
            <p style={{ font:"590 14px/1 Inter,sans-serif", color:"#f7f8f8", margin:0, letterSpacing:"-0.2px" }}>CuentaMe IA</p>
            <p style={{ font:"400 11px/1 Inter,sans-serif", color:"#62666d", margin:"3px 0 0" }}>Habla con tu negocio</p>
          </div>
        </div>

        {/* Mensajes */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 16px", display:"flex", flexDirection:"column", gap:12 }}>
          {mensajes.length === 0 && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"40px 0", textAlign:"center" }}>
              <div style={{ width:56, height:56, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="56" height="56" viewBox="0 0 32 32" fill="none" aria-hidden>
                  <defs>
                    <linearGradient id="cm-empty-grad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#818cf8" />
                      <stop offset="1" stopColor="#5e6ad2" />
                    </linearGradient>
                  </defs>
                  <path d="M9 3h14a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6h-7.2l-5.4 4.4a1 1 0 0 1-1.6-.78V26H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6Z" fill="url(#cm-empty-grad)" />
                  <path d="M9 19.5 13.5 15 17 17.5 23 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                  <circle cx="9" cy="19.5" r="1.6" fill="white" />
                  <circle cx="13.5" cy="15" r="1.6" fill="white" />
                  <circle cx="17" cy="17.5" r="1.6" fill="white" />
                  <circle cx="23" cy="11" r="1.9" fill="white" />
                </svg>
              </div>
              <div>
                <p style={{ font:"590 16px/1.2 Inter,sans-serif", color:"#f7f8f8", margin:0, letterSpacing:"-0.2px" }}>¿En qué te ayudo hoy?</p>
                <p style={{ font:"400 13px/1.4 Inter,sans-serif", color:"#62666d", margin:"6px 0 0" }}>Pregúntame por tus ventas, registra una compra o consulta el inventario.</p>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
                {["¿Cómo estuvieron las ventas hoy?","¿Cuánto stock de pollo tengo?","Registra una venta"].map(s => (
                  <button key={s} onClick={() => setInput(s)}
                    style={{ height:30, padding:"0 14px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:999, color:"#8a8f98", font:"510 12px/1 Inter,sans-serif", cursor:"pointer", transition:"all 150ms cubic-bezier(0.16,1,0.3,1)" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="rgba(113,112,255,0.40)"; e.currentTarget.style.color="#a4adff"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; e.currentTarget.style.color="#8a8f98"; }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map(m => (
            <div key={m.id} style={{ display:"flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "78%",
                padding: "10px 14px",
                borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: m.role === "user" ? "linear-gradient(135deg,#6b78de,#5e6ad2)" : "rgba(255,255,255,0.04)",
                border: m.role === "user" ? "1px solid rgba(113,112,255,0.40)" : "1px solid rgba(255,255,255,0.07)",
                font: "400 14px/1.6 Inter,sans-serif",
                color: m.role === "user" ? "#fff" : "#d0d6e0",
                boxShadow: m.role === "user" ? "0 2px 12px rgba(94,106,210,0.25)" : "none",
              }}>
                {m.content ? (
                  m.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ul]:pl-4 [&>li]:mb-0.5 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-1.5 [&>h3]:mt-2 [&>table]:text-xs [&>table]:w-full [&>table]:border-collapse [&>table>thead>tr>th]:border [&>table>thead>tr>th]:border-white/10 [&>table>thead>tr>th]:px-2 [&>table>thead>tr>th]:py-1 [&>table>tbody>tr>td]:border [&>table>tbody>tr>td]:border-white/10 [&>table>tbody>tr>td]:px-2 [&>table>tbody>tr>td]:py-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p style={{ margin:0, whiteSpace:"pre-wrap" }}>{m.content}</p>
                  )
                ) : m.isStreaming ? (
                  <span style={{ opacity:0.5 }}>...</span>
                ) : null}

                {m.toolsUsed && m.toolsUsed.length > 0 && (
                  <p style={{ font:"400 11px/1 Inter,sans-serif", color:"rgba(255,255,255,0.4)", margin:"6px 0 0" }}>
                    Herramientas: {m.toolsUsed.join(", ")}
                  </p>
                )}

                {m.role === "assistant" && !m.isStreaming && esperandoConfirmacion && !isLoading && mensajes[mensajes.length - 1]?.id === m.id && (
                  <div style={{ display:"flex", gap:8, marginTop:12, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.08)" }}>
                    <button onClick={() => { setInput("Sí, confirma"); setTimeout(() => void enviar(), 50); }}
                      style={{ flex:1, height:34, background:"linear-gradient(180deg,#6b78de,#5e6ad2)", border:"1px solid rgba(113,112,255,0.5)", borderRadius:8, color:"#fff", font:"590 12px/1 Inter,sans-serif", cursor:"pointer" }}>
                      ✓ Confirmar
                    </button>
                    <button onClick={() => { setEsperandoConfirmacion(false); setInput("Cancela, no registres nada"); setTimeout(() => void enviar(), 50); }}
                      style={{ height:34, padding:"0 12px", background:"rgba(224,82,82,0.10)", border:"1px solid rgba(224,82,82,0.25)", borderRadius:8, color:"#ff8585", font:"510 12px/1 Inter,sans-serif", cursor:"pointer" }}>
                      ✕ Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {toolActiva && (
            <div style={{ display:"flex", justifyContent:"flex-start" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"16px 16px 16px 4px", font:"400 13px/1 Inter,sans-serif", color:"#8a8f98" }}>
                <Loader2 style={{ width:12, height:12 }} className="animate-spin" />
                {toolActiva}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding:"12px 16px 16px", borderTop:"1px solid rgba(255,255,255,0.05)", background:"#0f1011", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe un mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
              rows={1}
              disabled={isLoading}
              style={{ flex:1, resize:"none", minHeight:42, maxHeight:160, padding:"10px 14px", background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:12, color:"#f7f8f8", font:"400 14px/1.5 Inter,sans-serif", outline:"none", opacity: isLoading ? 0.5 : 1, transition:"border-color 150ms" }}
              onFocus={e => { e.currentTarget.style.borderColor="rgba(113,112,255,0.40)"; }}
              onBlur={e => { e.currentTarget.style.borderColor="rgba(255,255,255,0.10)"; }}
            />
            <button onClick={toggleMic} disabled={isLoading} title={isListening ? "Detener" : "Hablar"}
              style={{ width:42, height:42, display:"flex", alignItems:"center", justifyContent:"center", background: isListening ? "rgba(224,82,82,0.15)" : "rgba(255,255,255,0.04)", border:"1px solid", borderColor: isListening ? "rgba(224,82,82,0.35)" : "rgba(255,255,255,0.08)", borderRadius:10, color: isListening ? "#ff8585" : "#8a8f98", cursor:"pointer", flexShrink:0 }}>
              <Mic style={{ width:16, height:16 }} />
            </button>
            <button onClick={() => void enviar()} disabled={isLoading || !input.trim()}
              style={{ height:42, padding:"0 16px", display:"flex", alignItems:"center", gap:6, background: isLoading || !input.trim() ? "rgba(255,255,255,0.04)" : "linear-gradient(180deg,#6b78de,#5e6ad2)", border:"1px solid", borderColor: isLoading || !input.trim() ? "rgba(255,255,255,0.06)" : "rgba(113,112,255,0.5)", borderRadius:10, color: isLoading || !input.trim() ? "#62666d" : "#fff", font:"590 13px/1 Inter,sans-serif", cursor: isLoading || !input.trim() ? "not-allowed" : "pointer", flexShrink:0, boxShadow: isLoading || !input.trim() ? "none" : "0 2px 12px rgba(94,106,210,0.35)", transition:"all 150ms cubic-bezier(0.16,1,0.3,1)", whiteSpace:"nowrap" }}>
              {isLoading
                ? <><Loader2 style={{ width:14, height:14 }} className="animate-spin" /> Enviando</>
                : <><Send style={{ width:14, height:14 }} /> Enviar</>}
            </button>
          </div>
          <p style={{ font:"400 11px/1 Inter,sans-serif", color:"#4a4d54", margin:"8px 0 0", textAlign:"center" }}>
            CuentaMe IA puede cometer errores. Verifica información importante.
          </p>
        </div>
      </div>
    </div>
  );
}
