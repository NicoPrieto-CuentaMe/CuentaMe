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

  const cargarConversacion = useCallback(async (id: string) => {
    setConversacionId(id);
    setMensajes([]);
    setToolActiva(null);
    try {
      const res = await fetch(`/api/chat/historial?id=${id}`);
      if (!res.ok) return;
      const data = await res.json() as { mensajes: Mensaje[] };
      setMensajes(data.mensajes ?? []);
    } catch {
      // Si falla, la conversación empieza vacía visualmente
    }
  }, []);

  const enviar = useCallback(async () => {
    const texto = input.trim();
    if (!texto || isLoading) return;

    setInput("");
    setIsLoading(true);
    setToolActiva(null);
    setEsperandoConfirmacion(false);

    // Generar idempotencyKey nueva solo cuando el usuario confirma un registro
    const textoLower = texto.toLowerCase();
    const esConfirmacion =
      textoLower.includes("sí, confirma") ||
      textoLower.includes("si, confirma") ||
      textoLower.includes("confirma") ||
      textoLower.includes("dale") ||
      textoLower.includes("correcto") ||
      textoLower.includes("registra");
    const keyParaEnviar = esConfirmacion
      ? crypto.randomUUID()
      : null;
    setIdempotencyKey(keyParaEnviar);

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
            // Detectar si Claude está esperando confirmación
            const textoFinal = textoAcumulado.toLowerCase();
            const esPreview =
              textoFinal.includes("confirmas") ||
              textoFinal.includes("¿confirmas") ||
              textoFinal.includes("para registrar") ||
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
  }, [input, isLoading, conversacionId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  };

  return (
    <div className="flex h-full gap-0 -m-6 overflow-hidden">
      {/* Sidebar de conversaciones */}
      <div
        className={`flex flex-col border-r border-border bg-surface transition-all duration-200 ${
          sidebarOpen ? "w-64 min-w-[200px]" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Conversaciones
          </span>
          <button
            onClick={nuevaConversacion}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-accent hover:bg-accent/10 transition"
            title="Nueva conversación"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversaciones.length === 0 ? (
            <p className="p-4 text-xs text-text-tertiary">No hay conversaciones aún.</p>
          ) : (
            conversaciones.map((c) => (
                <div
                  key={c.id}
                  className={`relative group border-b border-border/50 ${
                    c.id === conversacionId ? "bg-surface-elevated" : ""
                  }`}
                  onMouseEnter={() => setHoveredConvId(c.id)}
                  onMouseLeave={() => setHoveredConvId(null)}
                >
                  <button
                    onClick={() => void cargarConversacion(c.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-elevated transition pr-8"
                  >
                    <p className="text-xs text-text-primary truncate">
                      {c.titulo ?? "Sin título"}
                    </p>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {fmtFecha(c.updatedAt)}
                    </p>
                  </button>
                  {hoveredConvId === c.id && (
                    <button
                      onClick={(e) => void eliminarConversacion(c.id, e)}
                      disabled={eliminandoId === c.id}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-tertiary hover:text-danger hover:bg-danger/10 transition"
                      title="Eliminar conversación"
                    >
                      {eliminandoId === c.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              ))
          )}
        </div>
      </div>

      {/* Área principal del chat */}
      <div className="flex flex-1 flex-col min-w-0 bg-background">
        {/* Header del chat */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition"
            title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">CuentaMe IA</h1>
            <p className="text-xs text-text-tertiary">Habla con tu negocio</p>
          </div>
        </div>

        {/* Lista de mensajes */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {mensajes.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">¿En qué te ayudo hoy?</p>
                <p className="text-xs text-text-tertiary mt-1">
                  Pregúntame por tus ventas, registra una compra o consulta el inventario.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  "¿Cómo estuvieron las ventas hoy?",
                  "¿Cuánto stock de pollo tengo?",
                  "Registra una venta",
                ].map((sugerencia) => (
                  <button
                    key={sugerencia}
                    onClick={() => setInput(sugerencia)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent transition"
                  >
                    {sugerencia}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-accent text-white rounded-br-sm"
                    : "bg-surface border border-border text-text-primary rounded-bl-sm"
                }`}
              >
                {m.content ? (
                  m.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none leading-relaxed
                      [&>p]:mb-2 [&>p:last-child]:mb-0
                      [&>ul]:mb-2 [&>ul]:pl-4 [&>li]:mb-0.5
                      [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-1.5 [&>h3]:mt-2
                      [&>table]:text-xs [&>table]:w-full [&>table]:border-collapse
                      [&>table>thead>tr>th]:border [&>table>thead>tr>th]:border-border/50 [&>table>thead>tr>th]:px-2 [&>table>thead>tr>th]:py-1
                      [&>table>tbody>tr>td]:border [&>table>tbody>tr>td]:border-border/50 [&>table>tbody>tr>td]:px-2 [&>table>tbody>tr>td]:py-1
                      [&>strong]:font-semibold">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  )
                ) : m.isStreaming ? (
                  <span className="flex gap-1 items-center py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : null}
                {m.toolsUsed && m.toolsUsed.length > 0 && (
                  <p className="mt-1.5 text-xs text-text-tertiary border-t border-border/50 pt-1.5">
                    Consultó: {m.toolsUsed.map((t) => TOOL_LABELS[t]?.replace("...", "") ?? t).join(", ")}
                  </p>
                )}
                {/* Botones de confirmación inline — solo en el último mensaje del asistente */}
                {m.role === "assistant" &&
                  !m.isStreaming &&
                  esperandoConfirmacion &&
                  !isLoading &&
                  mensajes[mensajes.length - 1]?.id === m.id && (
                    <div className="flex gap-2 mt-3 pt-2.5 border-t border-border/50">
                      <button
                        onClick={() => {
                          setInput("Sí, confirma");
                          setTimeout(() => void enviar(), 50);
                        }}
                        className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition"
                      >
                        ✓ Confirmar
                      </button>
                      <button
                        onClick={() => {
                          setEsperandoConfirmacion(false);
                          setInput("Cancela, no registres nada");
                          setTimeout(() => void enviar(), 50);
                        }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-danger hover:text-danger transition"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                  )}
              </div>
            </div>
          ))}

          {/* Indicador de tool activa */}
          {toolActiva && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-surface border border-border px-4 py-2.5 text-xs text-text-tertiary">
                <Loader2 className="h-3 w-3 animate-spin" />
                {toolActiva}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border bg-surface px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe un mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent disabled:opacity-50 transition"
            />
            <button
              onClick={toggleMic}
              disabled={isLoading}
              title={isListening ? "Detener grabación" : "Hablar"}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border transition ${
                isListening
                  ? "border-danger bg-danger/10 text-danger animate-pulse"
                  : "border-border bg-surface text-text-tertiary hover:text-text-primary hover:border-accent"
              } disabled:opacity-40`}
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => void enviar()}
              disabled={isLoading || !input.trim()}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-text-tertiary text-center">
            CuentaMe IA puede cometer errores. Verifica información importante.
          </p>
        </div>
      </div>
    </div>
  );
}
