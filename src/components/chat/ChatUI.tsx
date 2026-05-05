"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Plus, MessageSquare, Loader2, ChevronDown } from "lucide-react";

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  const nuevaConversacion = useCallback(() => {
    setConversacionId(null);
    setMensajes([]);
    setInput("");
    setToolActiva(null);
    inputRef.current?.focus();
  }, []);

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
        body: JSON.stringify({ conversacionId, mensaje: texto }),
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
              <button
                key={c.id}
                onClick={() => void cargarConversacion(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-surface-elevated transition ${
                  c.id === conversacionId ? "bg-surface-elevated" : ""
                }`}
              >
                <p className="text-xs text-text-primary truncate">
                  {c.titulo ?? "Sin título"}
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {fmtFecha(c.updatedAt)}
                </p>
              </button>
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
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
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
