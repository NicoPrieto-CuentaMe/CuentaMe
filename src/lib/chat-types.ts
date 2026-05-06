import type Anthropic from "@anthropic-ai/sdk";

/** Roles posibles de un mensaje en la conversación */
export type ChatRole = "user" | "assistant";

/** Mensaje serializado para guardar en BD y para el frontend */
export type MensajeChat = {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: unknown;
  toolResults?: unknown;
  createdAt: Date;
};

/** Mensaje en el formato que espera la API de Anthropic */
export type AnthropicMessage = Anthropic.MessageParam;

/** Resultado de una llamada a una tool */
export type ToolResult = {
  tool_use_id: string;
  content: string;
};

/** Estado de una conversación activa */
export type ConversacionActiva = {
  id: string;
  titulo: string | null;
  createdAt: Date;
  updatedAt: Date;
  mensajes: MensajeChat[];
};

/** Payload que recibe el endpoint /api/chat */
export type ChatRequestPayload = {
  conversacionId: string | null;
  mensaje: string;
  idempotencyKey: string | null;
};

/** Respuesta del endpoint /api/chat */
export type ChatResponseChunk =
  | { type: "text"; text: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_end"; toolName: string; result: string }
  | { type: "error"; message: string }
  | { type: "done"; conversacionId: string; mensajeId: string };
