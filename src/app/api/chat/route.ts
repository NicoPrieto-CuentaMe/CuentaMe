import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic, CHAT_MODEL, CHAT_MAX_HISTORIAL } from "@/lib/anthropic";
import { buildSystemPrompt, buildContextoTemporal } from "@/lib/chat-system-prompt";
import { getMetricasDia } from "@/app/actions/metricas-dia";
import { getStockActual } from "@/lib/get-stock-actual";
import { getPlatosCatalogoCompleto } from "@/app/actions/ventas";
import { getVentasRango } from "@/app/actions/chat-queries";
import { getGastosRango } from "@/app/actions/chat-queries";
import { getComprasRango } from "@/app/actions/chat-queries";
import { registrarVenta } from "@/app/actions/ventas";
import { registrarCompra } from "@/app/actions/compras";
import { addGastoFijo } from "@/app/actions/gastos";
import type { AnthropicMessage } from "@/lib/chat-types";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;
const CHAT_MAX_TOKENS_CONTEXT = 180_000; // límite de tokens en el array de mensajes antes de podar

// ─── DEFINICIÓN DE TOOLS ────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_metricas_dia",
    description:
      "Obtiene las métricas del día actual: total de ventas, compras, gastos, balance, número de transacciones, platos vendidos y desglose por método de pago. Úsala cuando el usuario pregunte sobre el rendimiento de hoy.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_ventas_rango",
    description:
      "Obtiene ventas en un rango de fechas con resumen agregado (total, transacciones, top platos, desglose por tipo/método/canal). Úsala para preguntas como '¿cuánto vendí esta semana?', '¿cuáles son mis platos más vendidos?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        fechaDesde: {
          type: "string",
          description: "Fecha inicio en formato YYYY-MM-DD (hora Colombia UTC-5)",
        },
        fechaHasta: {
          type: "string",
          description: "Fecha fin en formato YYYY-MM-DD (hora Colombia UTC-5)",
        },
        tipo: {
          type: "string",
          enum: ["MESA", "DOMICILIO", "PARA_LLEVAR"],
          description: "Filtrar por tipo de venta (opcional)",
        },
        metodoPago: {
          type: "string",
          enum: ["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "NEQUI", "DAVIPLATA", "TRANSFERENCIA"],
          description: "Filtrar por método de pago (opcional)",
        },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "get_gastos_rango",
    description:
      "Obtiene gastos fijos en un rango de fechas con resumen por categoría, periodicidad y método de pago. Úsala para preguntas como '¿cuánto gasté en arriendo este mes?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        fechaDesde: {
          type: "string",
          description: "Fecha inicio en formato YYYY-MM-DD",
        },
        fechaHasta: {
          type: "string",
          description: "Fecha fin en formato YYYY-MM-DD",
        },
        categoria: {
          type: "string",
          enum: [
            "ARRIENDO", "SERVICIOS_PUBLICOS", "NOMINA", "IMPUESTOS_Y_TASAS",
            "MANTENIMIENTO", "PUBLICIDAD", "CONTABILIDAD", "SEGURO",
            "TECNOLOGIA", "TRANSPORTE", "OTRO",
          ],
          description: "Filtrar por categoría de gasto (opcional)",
        },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "get_compras_rango",
    description:
      "Obtiene compras de insumos en un rango de fechas con resumen por proveedor y top insumos. Úsala para preguntas sobre gastos de materia prima.",
    input_schema: {
      type: "object" as const,
      properties: {
        fechaDesde: {
          type: "string",
          description: "Fecha inicio en formato YYYY-MM-DD",
        },
        fechaHasta: {
          type: "string",
          description: "Fecha fin en formato YYYY-MM-DD",
        },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "get_stock_actual",
    description:
      "Obtiene el stock calculado de todos los insumos del restaurante. Úsala cuando el usuario pregunte por inventario o stock disponible.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_platos_catalogo",
    description:
      "Obtiene el catálogo completo de platos incluyendo inactivos, con precio y categoría. Úsala para validar nombres de platos antes de registrar una venta o responder preguntas sobre el menú.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "registrar_venta",
    description:
      "Registra una venta en el sistema SOLO después de que el usuario haya confirmado explícitamente el preview. NUNCA llames esta tool sin confirmación previa del usuario.",
    input_schema: {
      type: "object" as const,
      properties: {
        fecha: {
          type: "string",
          description: "Fecha en formato YYYY-MM-DD (hora Colombia)",
        },
        hora: {
          type: "string",
          description: "Hora en formato HH:MM (24h, hora Colombia)",
        },
        tipo: {
          type: "string",
          enum: ["MESA", "DOMICILIO", "PARA_LLEVAR"],
        },
        canal: {
          type: "string",
          enum: ["RAPPI", "IFOOD", "DIDI_FOOD", "TU_PEDIDO_CO"],
          description: "Requerido solo si tipo es DOMICILIO",
        },
        metodoPago: {
          type: "string",
          enum: ["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "NEQUI", "DAVIPLATA", "TRANSFERENCIA"],
        },
        lineas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              platoId: { type: "string" },
              cantidad: { type: "number" },
            },
            required: ["platoId", "cantidad"],
          },
          description: "Lista de platos vendidos con su ID y cantidad",
        },
      },
      required: ["fecha", "hora", "tipo", "metodoPago", "lineas"],
    },
  },
  {
    name: "registrar_compra",
    description:
      "Registra una compra de insumos SOLO después de confirmación explícita del usuario.",
    input_schema: {
      type: "object" as const,
      properties: {
        fecha: { type: "string", description: "Fecha YYYY-MM-DD" },
        proveedorId: { type: "string", description: "ID del proveedor" },
        lineas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              insumoId: { type: "string" },
              cantidad: { type: "number" },
              unidad: {
                type: "string",
                enum: ["GRAMO", "KILOGRAMO", "LIBRA", "MILILITRO", "LITRO", "UNIDAD", "PORCION", "CAJA", "BULTO", "GARRAFA"],
              },
              total: { type: "number", description: "Total pagado en COP por esta línea" },
            },
            required: ["insumoId", "cantidad", "unidad", "total"],
          },
        },
        notas: { type: "string", description: "Notas opcionales" },
      },
      required: ["fecha", "proveedorId", "lineas"],
    },
  },
  {
    name: "registrar_gasto",
    description:
      "Registra un gasto fijo SOLO después de confirmación explícita del usuario.",
    input_schema: {
      type: "object" as const,
      properties: {
        fecha: { type: "string", description: "Fecha YYYY-MM-DD" },
        categoria: {
          type: "string",
          enum: [
            "ARRIENDO", "SERVICIOS_PUBLICOS", "NOMINA", "IMPUESTOS_Y_TASAS",
            "MANTENIMIENTO", "PUBLICIDAD", "CONTABILIDAD", "SEGURO",
            "TECNOLOGIA", "TRANSPORTE", "OTRO",
          ],
        },
        monto: { type: "number", description: "Monto en COP" },
        periodicidad: {
          type: "string",
          enum: ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL", "UNICO"],
        },
        metodoPago: {
          type: "string",
          enum: ["EFECTIVO", "TRANSFERENCIA", "TARJETA_DEBITO", "TARJETA_CREDITO", "CHEQUE", "OTRO"],
        },
        notas: { type: "string", description: "Notas opcionales" },
      },
      required: ["fecha", "categoria", "monto", "periodicidad", "metodoPago"],
    },
  },
];

// ─── EJECUTOR DE TOOLS ───────────────────────────────────────────────────────

async function ejecutarTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
  idempotencyKey: string | null,
): Promise<string> {
  try {
    switch (toolName) {
      case "get_metricas_dia": {
        const result = await getMetricasDia();
        if (!result) return JSON.stringify({ error: "No se pudieron obtener las métricas.", errorCode: "DB_ERROR" });
        return JSON.stringify(result);
      }

      case "get_ventas_rango": {
        const result = await getVentasRango({
          fechaDesde: toolInput.fechaDesde as string,
          fechaHasta: toolInput.fechaHasta as string,
          tipo: toolInput.tipo as never,
          canal: toolInput.canal as never,
          metodoPago: toolInput.metodoPago as never,
        });
        return JSON.stringify(result);
      }

      case "get_gastos_rango": {
        const result = await getGastosRango({
          fechaDesde: toolInput.fechaDesde as string,
          fechaHasta: toolInput.fechaHasta as string,
          categoria: toolInput.categoria as never,
        });
        return JSON.stringify(result);
      }

      case "get_compras_rango": {
        const result = await getComprasRango({
          fechaDesde: toolInput.fechaDesde as string,
          fechaHasta: toolInput.fechaHasta as string,
          proveedorId: toolInput.proveedorId as string | undefined,
        });
        return JSON.stringify(result);
      }

      case "get_stock_actual": {
        // userId ya viene como parámetro de ejecutarTool — no hace falta llamar auth() de nuevo
        const result = await getStockActual(userId);
        return JSON.stringify(result);
      }

      case "get_platos_catalogo": {
        const result = await getPlatosCatalogoCompleto();
        return JSON.stringify(result);
      }

      case "registrar_venta": {
        // Verificar idempotencia
        if (idempotencyKey) {
          const existing = await prisma.idempotencyRecord.findUnique({
            where: { userId_key: { userId, key: idempotencyKey } },
          });
          if (existing) {
            return JSON.stringify({ ok: true, message: "Venta ya registrada.", createdId: existing.recordId });
          }
        }
        const formData = new FormData();
        formData.set("fecha", toolInput.fecha as string);
        formData.set("hora", toolInput.hora as string);
        formData.set("tipo", toolInput.tipo as string);
        if (toolInput.canal) formData.set("canal", toolInput.canal as string);
        formData.set("metodoPago", toolInput.metodoPago as string);
        formData.set("lineas", JSON.stringify(toolInput.lineas));
        const result = await registrarVenta({ ok: false, message: "" }, formData);
        if (result.ok && result.createdId && idempotencyKey) {
          await prisma.idempotencyRecord.create({
            data: { userId, key: idempotencyKey, recordId: result.createdId, entity: "venta" },
          });
        }
        return JSON.stringify(result);
      }

      case "registrar_compra": {
        if (idempotencyKey) {
          const existing = await prisma.idempotencyRecord.findUnique({
            where: { userId_key: { userId, key: idempotencyKey } },
          });
          if (existing) {
            return JSON.stringify({ ok: true, message: "Compra ya registrada.", createdId: existing.recordId });
          }
        }
        const formData = new FormData();
        formData.set("fecha", toolInput.fecha as string);
        formData.set("proveedorId", toolInput.proveedorId as string);
        formData.set("lineas", JSON.stringify(toolInput.lineas));
        if (toolInput.notas) formData.set("notas", toolInput.notas as string);
        const result = await registrarCompra({ ok: false, message: "" }, formData);
        if (result.ok && result.createdId && idempotencyKey) {
          await prisma.idempotencyRecord.create({
            data: { userId, key: idempotencyKey, recordId: result.createdId, entity: "compra" },
          });
        }
        return JSON.stringify(result);
      }

      case "registrar_gasto": {
        if (idempotencyKey) {
          const existing = await prisma.idempotencyRecord.findUnique({
            where: { userId_key: { userId, key: idempotencyKey } },
          });
          if (existing) {
            return JSON.stringify({ ok: true, message: "Gasto ya registrado.", createdId: existing.recordId });
          }
        }
        const formData = new FormData();
        formData.set("fecha", toolInput.fecha as string);
        formData.set("categoria", toolInput.categoria as string);
        formData.set("monto", String(toolInput.monto));
        formData.set("periodicidad", toolInput.periodicidad as string);
        formData.set("metodoPago", toolInput.metodoPago as string);
        if (toolInput.notas) formData.set("notas", toolInput.notas as string);
        const result = await addGastoFijo({ ok: false, message: "" }, formData);
        if (result.ok && result.createdId && idempotencyKey) {
          await prisma.idempotencyRecord.create({
            data: { userId, key: idempotencyKey, recordId: result.createdId, entity: "gasto" },
          });
        }
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Tool desconocida: ${toolName}` });
    }
  } catch (e) {
    console.error(`[ejecutarTool:${toolName}]`, e);
    return JSON.stringify({ error: "Error interno al ejecutar la herramienta.", errorCode: "DB_ERROR" });
  }
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        // 1. Autenticación
        const session = await auth();
        const userId = session?.user?.id;
        const restaurantName = (session?.user as { restaurantName?: string })?.restaurantName ?? "el restaurante";
        if (!userId) {
          send({ type: "error", message: "No autenticado." });
          controller.close();
          return;
        }

        // 2. Parsear body
        const body = await req.json() as { conversacionId?: string | null; mensaje?: string; idempotencyKey?: string | null };
        const { conversacionId: convIdInput, mensaje, idempotencyKey } = body;

        if (!mensaje?.trim()) {
          send({ type: "error", message: "Mensaje vacío." });
          controller.close();
          return;
        }

        if (mensaje.length > 4000) {
          send({ type: "error", message: "El mensaje es demasiado largo (máximo 4000 caracteres)." });
          controller.close();
          return;
        }

        // 3. Crear o cargar conversación
        let conversacionId: string;
        if (!convIdInput) {
          const nueva = await prisma.conversacion.create({
            data: { userId, titulo: null },
          });
          conversacionId = nueva.id;
        } else {
          const existente = await prisma.conversacion.findFirst({
            where: { id: convIdInput, userId },
          });
          if (!existente) {
            send({ type: "error", message: "Conversación no encontrada." });
            controller.close();
            return;
          }
          conversacionId = convIdInput;
        }

        // 4. Cargar historial (últimos N mensajes)
        const historialDb = await prisma.mensaje.findMany({
          where: { conversacionId },
          orderBy: { createdAt: "desc" },
          take: CHAT_MAX_HISTORIAL,
        });
        historialDb.reverse(); // reordenar cronológicamente para Anthropic (desc → asc)

        // 5. Persistir mensaje del usuario
        const mensajeUsuarioDb = await prisma.mensaje.create({
          data: {
            userId,
            conversacionId,
            role: "user",
            content: mensaje.trim(),
          },
        });

        // 6. Construir historial para Anthropic
        const historialAnthopic: AnthropicMessage[] = historialDb.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Agregar mensaje actual del usuario
        historialAnthopic.push({
          role: "user",
          content: mensaje.trim(),
        });

        // 7. System prompt con contexto temporal
        const systemPrompt = `${buildSystemPrompt(restaurantName)}\n\n${buildContextoTemporal()}`;

        // 8. Loop de tool calling
        let respuestaFinal = "";
        let toolCallsLog: unknown[] = [];
        let toolResultsLog: unknown[] = [];
        let mensajes = [...historialAnthopic];

        let iteraciones = 0;
        const MAX_ITERACIONES = 10;

        while (iteraciones < MAX_ITERACIONES) {
          iteraciones++;

          const response = await anthropic.messages.create({
            model: CHAT_MODEL,
            max_tokens: 4096,
            system: [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: TOOLS,
            tool_choice: { type: "auto" },
            messages: mensajes,
          });

          // Procesar bloques de respuesta.
          // Los tool_results se acumulan y se agregan al historial UNA SOLA VEZ
          // después del for, para soportar tool use paralelo (múltiples tool_use
          // en una misma respuesta de Claude).
          const toolResultsThisTurn: Array<{
            type: "tool_result";
            tool_use_id: string;
            content: string;
          }> = [];

          for (const block of response.content) {
            if (block.type === "text") {
              respuestaFinal += block.text;
              send({ type: "text", text: block.text });
            } else if (block.type === "tool_use") {
              send({ type: "tool_start", toolName: block.name });
              toolCallsLog.push({ name: block.name, input: block.input });

              const toolResult = await ejecutarTool(
                block.name,
                block.input as Record<string, unknown>,
                userId,
                idempotencyKey ?? null,
              );

              toolResultsLog.push({ name: block.name, result: toolResult });
              send({ type: "tool_end", toolName: block.name, result: toolResult });

              // Acumular — NO agregar al historial todavía
              toolResultsThisTurn.push({
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: toolResult,
              });
            }
          }

          // Agregar al historial una sola vez, con todos los tool_results juntos.
          // Esto respeta el contrato de la API de Anthropic: un mensaje assistant
          // seguido de un mensaje user con TODOS los tool_results de esa respuesta.
          if (toolResultsThisTurn.length > 0) {
            mensajes = [
              ...mensajes,
              { role: "assistant" as const, content: response.content },
              { role: "user" as const, content: toolResultsThisTurn },
            ];
          }

          // Si Claude cortó por límite de tokens, avisar al usuario y salir
          if (response.stop_reason === "max_tokens") {
            const aviso = "\n\n_(Respuesta cortada por longitud. Puedes pedirme que continúe o que sea más conciso.)_";
            respuestaFinal += aviso;
            send({ type: "text", text: aviso });
            break;
          }

          // Si Claude terminó limpiamente, salir del loop
          if (response.stop_reason === "end_turn") break;

          // Si no es tool_use tampoco, salir para evitar loop infinito
          if (response.stop_reason !== "tool_use") break;

          // Podar historial si crece demasiado — evita superar ventana de contexto
          // Estimación simple: 1 token ≈ 4 caracteres
          const totalChars = mensajes.reduce((acc, m) => {
            if (typeof m.content === "string") return acc + m.content.length;
            if (Array.isArray(m.content)) {
              return acc + m.content.reduce((a, b) => {
                if ("text" in b && typeof b.text === "string") return a + b.text.length;
                if ("content" in b && typeof b.content === "string") return a + b.content.length;
                return a;
              }, 0);
            }
            return acc;
          }, 0);

          const estimadoTokens = Math.round(totalChars / 4);
          if (estimadoTokens > CHAT_MAX_TOKENS_CONTEXT) {
            // Conservar solo los primeros 2 mensajes (contexto inicial) + los últimos 6
            if (mensajes.length > 8) {
              mensajes = [...mensajes.slice(0, 2), ...mensajes.slice(-6)];
            }
          }
        }

        // 9. Persistir respuesta del asistente
        const mensajeAsistenteDb = await prisma.mensaje.create({
          data: {
            userId,
            conversacionId,
            role: "assistant",
            content: respuestaFinal,
            toolCalls:
              toolCallsLog.length > 0 ? (toolCallsLog as Prisma.InputJsonValue) : undefined,
            toolResults:
              toolResultsLog.length > 0 ? (toolResultsLog as Prisma.InputJsonValue) : undefined,
          },
        });

        // 10. Actualizar conversación: updatedAt siempre, título solo en el primer mensaje
        const convActual = await prisma.conversacion.findUnique({
          where: { id: conversacionId },
          select: { titulo: true },
        });

        const tituloNuevo =
          !convActual?.titulo
            ? mensaje.trim().slice(0, 50) + (mensaje.trim().length > 50 ? "…" : "")
            : undefined;

        await prisma.conversacion.update({
          where: { id: conversacionId },
          data: {
            updatedAt: new Date(),
            ...(tituloNuevo ? { titulo: tituloNuevo } : {}),
          },
        });

        // 11. Señal de fin
        send({
          type: "done",
          conversacionId,
          mensajeId: mensajeAsistenteDb.id,
          mensajeUsuarioId: mensajeUsuarioDb.id,
        });

        controller.close();
      } catch (e) {
        console.error("[/api/chat POST]", e);
        send({ type: "error", message: "Error interno del servidor." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
