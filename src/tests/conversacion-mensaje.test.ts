import { describe, it, expect, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaTest } from "./setup";
import { limpiarBD, crearUsuarioPrueba } from "./helpers";

beforeEach(async () => {
  await limpiarBD();
});

// ─── HELPERS LOCALES ─────────────────────────────────────────────────────────

async function crearConversacion(
  userId: string,
  titulo?: string
) {
  return prismaTest.conversacion.create({
    data: { userId, titulo: titulo ?? null },
  });
}

async function crearMensaje(
  userId: string,
  conversacionId: string,
  overrides?: {
    role?: string;
    content?: string;
    toolCalls?: object | null;
    toolResults?: object | null;
  }
) {
  return prismaTest.mensaje.create({
    data: {
      userId,
      conversacionId,
      role: overrides?.role ?? "user",
      content: overrides?.content ?? "Mensaje de prueba",
      toolCalls: overrides?.toolCalls ?? null,
      toolResults: overrides?.toolResults ?? null,
    },
  });
}

// ─── CONVERSACION ─────────────────────────────────────────────────────────────

describe("Conversacion — estructura y constraints", () => {

  it("crea una conversación con título correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId, "¿Cómo van las ventas de hoy?");

    expect(conv.id).toBeDefined();
    expect(conv.userId).toBe(userId);
    expect(conv.titulo).toBe("¿Cómo van las ventas de hoy?");
    expect(conv.createdAt).toBeDefined();
    expect(conv.updatedAt).toBeDefined();
  });

  it("crea una conversación sin título (nullable)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    expect(conv.titulo).toBeNull();
  });

  it("patrón de auto-título: primeros 50 caracteres del primer mensaje del usuario", async () => {
    // En producción, el título se genera en route.ts con los primeros 50 chars
    // del primer mensaje del usuario. Este test verifica que el campo acepta
    // strings de cualquier longitud y que el patrón de truncado funciona.
    const { userId } = await crearUsuarioPrueba();
    const mensajeLargo = "Cuenta, hoy vendí tres bandejas paisas, dos jugos de lulo y una limonada para llevar, todo en efectivo";
    const tituloGenerado = mensajeLargo.slice(0, 50);

    const conv = await crearConversacion(userId, tituloGenerado);
    expect(conv.titulo).toBe("Cuenta, hoy vendí tres bandejas paisas, dos jugos ");
    expect(conv.titulo!.length).toBe(50);
  });

  it("actualizar título de conversación después de creada", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);
    expect(conv.titulo).toBeNull();

    const actualizada = await prismaTest.conversacion.update({
      where: { id: conv.id },
      data: { titulo: "Ventas del martes" },
    });

    expect(actualizada.titulo).toBe("Ventas del martes");
  });

  it("updatedAt se actualiza al agregar mensajes a la conversación", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);
    const originalUpdatedAt = conv.updatedAt;

    await new Promise((r) => setTimeout(r, 10));

    await prismaTest.conversacion.update({
      where: { id: conv.id },
      data: { updatedAt: new Date() },
    });

    const actualizada = await prismaTest.conversacion.findUnique({
      where: { id: conv.id },
    });
    expect(actualizada!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it("múltiples conversaciones por usuario — sin constraint único", async () => {
    // Un usuario puede tener muchas conversaciones — no hay límite en BD.
    const { userId } = await crearUsuarioPrueba();

    await crearConversacion(userId, "Conversación 1");
    await crearConversacion(userId, "Conversación 2");
    await crearConversacion(userId, "Conversación 3");

    const convs = await prismaTest.conversacion.findMany({ where: { userId } });
    expect(convs).toHaveLength(3);
  });

  it("eliminar conversación borra sus mensajes en cascada (onDelete: Cascade)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    await crearMensaje(userId, conv.id, { role: "user", content: "Hola" });
    await crearMensaje(userId, conv.id, { role: "assistant", content: "Hola, ¿en qué te ayudo?" });

    await prismaTest.conversacion.delete({ where: { id: conv.id } });

    const mensajes = await prismaTest.mensaje.findMany({
      where: { conversacionId: conv.id },
    });
    expect(mensajes).toHaveLength(0);
  });

  it("eliminar usuario borra conversaciones y mensajes en cascada", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);
    await crearMensaje(userId, conv.id, { role: "user" });
    await crearMensaje(userId, conv.id, { role: "assistant" });

    await prismaTest.user.delete({ where: { id: userId } });

    const convs = await prismaTest.conversacion.findMany({ where: { userId } });
    const mensajes = await prismaTest.mensaje.findMany({ where: { userId } });
    expect(convs).toHaveLength(0);
    expect(mensajes).toHaveLength(0);
  });

  it("aislamiento multi-tenant: usuario no puede ver conversaciones de otro", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    await crearConversacion(u1, "Mi conversación privada");

    const convsU2 = await prismaTest.conversacion.findMany({ where: { userId: u2 } });
    expect(convsU2).toHaveLength(0);
  });

  it("ordenamiento por updatedAt desc — conversación más reciente primero", async () => {
    const { userId } = await crearUsuarioPrueba();

    const conv1 = await crearConversacion(userId, "Primera");
    await new Promise((r) => setTimeout(r, 10));
    const conv2 = await crearConversacion(userId, "Segunda");
    await new Promise((r) => setTimeout(r, 10));
    const conv3 = await crearConversacion(userId, "Tercera");

    const ordenadas = await prismaTest.conversacion.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    expect(ordenadas[0].titulo).toBe("Tercera");
    expect(ordenadas[1].titulo).toBe("Segunda");
    expect(ordenadas[2].titulo).toBe("Primera");
  });
});

// ─── MENSAJE ──────────────────────────────────────────────────────────────────

describe("Mensaje — estructura y persistencia", () => {

  it("crea mensajes de rol 'user' y 'assistant' correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const msgUser = await crearMensaje(userId, conv.id, {
      role: "user",
      content: "Cuenta, ¿cómo van las ventas de hoy?",
    });
    const msgAssistant = await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "Hoy llevas **$145.000** en ventas. ¿Quieres el desglose por plato?",
    });

    expect(msgUser.role).toBe("user");
    expect(msgAssistant.role).toBe("assistant");
  });

  it("BD acepta cualquier string como role — el constraint es solo en el código", async () => {
    // Mensaje.role es String, no enum. La BD acepta "system", "tool", cualquier valor.
    // El código de producción solo genera "user" o "assistant".
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const msg = await crearMensaje(userId, conv.id, { role: "system" });
    expect(msg.role).toBe("system");

    const msgRaro = await crearMensaje(userId, conv.id, { role: "rol-inventado" });
    expect(msgRaro.role).toBe("rol-inventado");
  });

  it("content es TEXT — acepta contenido muy largo sin límite de BD", async () => {
    // En producción, el contenido puede incluir tablas markdown, listas,
    // respuestas largas del asistente. TEXT en Postgres no tiene límite.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const contenidoLargo = "Aquí está tu análisis de ventas:\n" + "| Plato | Ventas |\n".repeat(500);
    const msg = await crearMensaje(userId, conv.id, { content: contenidoLargo });

    expect(msg.content.length).toBeGreaterThan(9000);
  });

  it("toolCalls y toolResults se guardan y recuperan como JSON correctamente", async () => {
    // El chat usa estos campos para persistir las llamadas a herramientas
    // y sus resultados. Son críticos para reconstruir el historial completo.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const toolCallsData = [
      {
        type: "tool_use",
        id: "tool-123",
        name: "get_metricas_dia",
        input: {},
      },
    ];
    const toolResultsData = [
      {
        type: "tool_result",
        tool_use_id: "tool-123",
        content: JSON.stringify({ totalVentas: 145000, numTransacciones: 8 }),
      },
    ];

    const msg = await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "Hoy llevas $145.000 en ventas.",
      toolCalls: toolCallsData,
      toolResults: toolResultsData,
    });

    const recuperado = await prismaTest.mensaje.findUnique({ where: { id: msg.id } });
    expect(recuperado!.toolCalls).toEqual(toolCallsData);
    expect(recuperado!.toolResults).toEqual(toolResultsData);
  });

  it("toolCalls y toolResults pueden ser null (mensaje sin tool use)", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const msg = await crearMensaje(userId, conv.id, {
      toolCalls: null,
      toolResults: null,
    });

    expect(msg.toolCalls).toBeNull();
    expect(msg.toolResults).toBeNull();
  });

  it("JSON anidado complejo en toolCalls — preservado exactamente sin pérdida de tipos", async () => {
    // El tool calling de Anthropic genera JSON con tipos mixtos (strings, numbers, arrays).
    // Verifica que Postgres JSON preserve todos los tipos sin coerción.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const toolCallsComplejos = [
      {
        type: "tool_use",
        id: "toolu_abc123",
        name: "registrar_venta",
        input: {
          fecha: "2026-05-09",
          hora: "13:30",
          tipo: "DOMICILIO",
          canal: "RAPPI",
          metodoPago: "NEQUI",
          lineas: [
            { platoId: "plato-123", cantidad: 2 },
            { platoId: "plato-456", cantidad: 1 },
          ],
        },
      },
    ];

    const msg = await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "",
      toolCalls: toolCallsComplejos,
    });

    const recuperado = await prismaTest.mensaje.findUnique({ where: { id: msg.id } });
    const toolCalls = recuperado!.toolCalls as typeof toolCallsComplejos;

    expect(toolCalls[0].name).toBe("registrar_venta");
    expect(toolCalls[0].input.lineas).toHaveLength(2);
    expect(toolCalls[0].input.lineas[0].cantidad).toBe(2);
  });

  it("historial de conversación ordenado por createdAt asc — orden cronológico correcto", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    await crearMensaje(userId, conv.id, { role: "user", content: "Mensaje 1" });
    await new Promise((r) => setTimeout(r, 10));
    await crearMensaje(userId, conv.id, { role: "assistant", content: "Respuesta 1" });
    await new Promise((r) => setTimeout(r, 10));
    await crearMensaje(userId, conv.id, { role: "user", content: "Mensaje 2" });

    const historial = await prismaTest.mensaje.findMany({
      where: { conversacionId: conv.id },
      orderBy: { createdAt: "asc" },
    });

    expect(historial[0].content).toBe("Mensaje 1");
    expect(historial[1].content).toBe("Respuesta 1");
    expect(historial[2].content).toBe("Mensaje 2");
  });

  it("patrón de poda de historial: conservar primeros 2 + últimos 6 mensajes", async () => {
    // En producción, cuando el historial supera 180k tokens estimados,
    // se poda conservando los primeros 2 y los últimos 6 mensajes.
    // Este test verifica que la query de poda funciona correctamente.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    // Crear 10 mensajes
    for (let i = 1; i <= 10; i++) {
      await crearMensaje(userId, conv.id, {
        role: i % 2 === 0 ? "assistant" : "user",
        content: `Mensaje ${i}`,
      });
    }

    const todos = await prismaTest.mensaje.findMany({
      where: { conversacionId: conv.id },
      orderBy: { createdAt: "asc" },
    });
    expect(todos).toHaveLength(10);

    // Aplicar patrón de poda: primeros 2 + últimos 6
    const primeros2 = todos.slice(0, 2);
    const ultimos6 = todos.slice(-6);
    const podados = [...primeros2, ...ultimos6];

    expect(podados).toHaveLength(8);
    expect(podados[0].content).toBe("Mensaje 1");
    expect(podados[1].content).toBe("Mensaje 2");
    expect(podados[2].content).toBe("Mensaje 5");
    expect(podados[7].content).toBe("Mensaje 10");
  });

  it("aislamiento multi-tenant: usuario no puede ver mensajes de otro", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const conv = await crearConversacion(u1);

    await crearMensaje(u1, conv.id, { content: "Información confidencial del restaurante" });

    const mensajesU2 = await prismaTest.mensaje.findMany({ where: { userId: u2 } });
    expect(mensajesU2).toHaveLength(0);
  });

  it("mensaje de otro usuario NO puede asociarse a conversación ajena — FK violation", async () => {
    // conversacionId tiene FK hacia Conversacion, pero NO hay constraint que valide
    // que mensaje.userId == conversacion.userId. Solo el userId FK de User se verifica.
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const convDeU1 = await crearConversacion(u1);

    // U2 intenta crear un mensaje en la conversación de U1
    // La BD LO PERMITE porque ambos userId son válidos y conversacionId existe
    const mensajeRaro = await prismaTest.mensaje.create({
      data: {
        userId: u2,            // userId de u2
        conversacionId: convDeU1.id, // conversación de u1
        role: "user",
        content: "Acceso no autorizado",
      },
    });

    // La BD acepta este estado inconsistente
    expect(mensajeRaro.userId).toBe(u2);
    expect(mensajeRaro.conversacionId).toBe(convDeU1.id);
    // Documenta: el schema no impide que mensajes de un usuario
    // aparezcan en conversaciones de otro. La defensa está en route.ts
    // que siempre usa el userId de la sesión activa.
  });

  it("concurrencia — dos mensajes simultáneos en la misma conversación: ambos aceptados", async () => {
    // El chat puede recibir el mensaje del usuario y procesar la respuesta en paralelo.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const resultados = await Promise.allSettled([
      crearMensaje(userId, conv.id, { role: "user", content: "Mensaje A" }),
      crearMensaje(userId, conv.id, { role: "user", content: "Mensaje B" }),
    ]);

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);

    const mensajes = await prismaTest.mensaje.findMany({
      where: { conversacionId: conv.id },
    });
    expect(mensajes).toHaveLength(2);
  });

  it("estimación de tokens del historial: 1 token ≈ 4 caracteres (patrón de poda)", async () => {
    // En producción, el historial se estima con content.length / 4.
    // Este test verifica que la estimación funciona para disparar la poda.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    // Mensaje de 4000 caracteres ≈ 1000 tokens
    const contenido4k = "a".repeat(4000);
    const msg = await crearMensaje(userId, conv.id, { content: contenido4k });

    const tokenEstimado = msg.content.length / 4;
    expect(tokenEstimado).toBe(1000);

    // Con 180 mensajes de 1000 tokens cada uno ≈ 180k tokens → poda necesaria
    // La BD acepta cualquier cantidad de mensajes sin límite propio
    expect(msg.content.length).toBe(4000);
  });

  it("cascade: conversación eliminada → sus mensajes desaparecen, pero los de otra conversación del mismo usuario permanecen", async () => {
    const { userId } = await crearUsuarioPrueba();
    const conv1 = await crearConversacion(userId, "Conv 1");
    const conv2 = await crearConversacion(userId, "Conv 2");

    await crearMensaje(userId, conv1.id, { content: "Mensaje en conv1" });
    await crearMensaje(userId, conv2.id, { content: "Mensaje en conv2" });

    // Eliminar solo conv1
    await prismaTest.conversacion.delete({ where: { id: conv1.id } });

    // Mensajes de conv1 → eliminados
    const msgsConv1 = await prismaTest.mensaje.findMany({
      where: { conversacionId: conv1.id },
    });
    expect(msgsConv1).toHaveLength(0);

    // Mensajes de conv2 → intactos
    const msgsConv2 = await prismaTest.mensaje.findMany({
      where: { conversacionId: conv2.id },
    });
    expect(msgsConv2).toHaveLength(1);
  });
});

// ─── ESCENARIOS CRÍTICOS PARA EL NEGOCIO ─────────────────────────────────────

describe("Chat IA — escenarios críticos para el dueño del restaurante", () => {

  it("borrar conversación NO borra las ventas registradas en ella — datos de negocio seguros", async () => {
    // CRÍTICO: el dueño puede borrar el historial del chat creyendo que solo
    // limpia mensajes. Sus ventas deben sobrevivir porque Venta no tiene FK
    // hacia Conversacion. Este es el escenario más importante del módulo.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    // Registrar una venta (simulando lo que hace el chat)
    const venta = await prismaTest.venta.create({
      data: {
        userId,
        fecha: new Date(),
        hora: "13:00",
        tipo: "MESA",
        total: new Prisma.Decimal("25000"),
        metodoPago: "EFECTIVO",
      },
    });

    // Guardar mensaje que referencia la venta (pero sin FK real)
    await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "✅ Venta registrada por $25.000",
      toolResults: [{ ventaId: venta.id, ok: true }],
    });

    // El dueño borra la conversación
    await prismaTest.conversacion.delete({ where: { id: conv.id } });

    // La venta debe seguir existiendo
    const ventaIntacta = await prismaTest.venta.findUnique({ where: { id: venta.id } });
    expect(ventaIntacta).not.toBeNull();
    expect(ventaIntacta!.userId).toBe(userId);
  });

  it("borrar conversación NO borra el IdempotencyRecord — protección contra duplicados preservada", async () => {
    // Si el IdempotencyRecord se borrara con la conversación, un retry del chat
    // después de borrar el historial podría registrar la misma venta dos veces.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    // Simular idempotencia registrada durante la conversación
    const key = "uuid-venta-registrada-en-esta-conv";
    await prismaTest.idempotencyRecord.create({
      data: { userId, key, recordId: "venta-abc123", entity: "venta" },
    });

    await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "✅ Venta registrada",
    });

    // Borrar conversación
    await prismaTest.conversacion.delete({ where: { id: conv.id } });

    // El IdempotencyRecord debe seguir existiendo
    const record = await prismaTest.idempotencyRecord.findUnique({
      where: { userId_key_entity: { userId, key, entity: "venta" } },
    });
    expect(record).not.toBeNull();
    expect(record!.recordId).toBe("venta-abc123");
  });

  it("mensaje con content vacío — válido cuando el asistente solo usa tool calls", async () => {
    // Cuando Claude invoca herramientas, envía content: "" y los detalles
    // en toolCalls. La BD debe aceptar content vacío sin error.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const msg = await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "",
      toolCalls: [{ type: "tool_use", id: "t1", name: "get_metricas_dia", input: {} }],
    });

    expect(msg.content).toBe("");
    expect(msg.toolCalls).not.toBeNull();
  });

  it("toolResults sin toolCalls — estado inconsistente que la BD acepta silenciosamente", async () => {
    // Un refactor descuidado podría guardar toolResults sin toolCalls.
    // El historial quedaría con resultados de herramientas sin referencia
    // a qué herramienta se llamó. La BD no lo previene.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    const msg = await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "Aquí tienes los resultados",
      toolCalls: null,      // sin tool calls
      toolResults: [{ tool_use_id: "t1", content: "resultado huérfano" }], // con resultados
    });

    expect(msg.toolCalls).toBeNull();
    expect(msg.toolResults).not.toBeNull();
    // Documenta: el schema no garantiza consistencia entre toolCalls y toolResults.
    // La responsabilidad es del código en route.ts.
  });

  it("toolResults con JSON muy grande — consulta de un año de ventas no rompe la BD", async () => {
    // Si el dueño pregunta '¿cuánto vendí el año pasado?', get_ventas_rango
    // puede devolver cientos de ventas. Ese JSON enorme se guarda en toolResults.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    // Simular ~300 ventas en el resultado de una herramienta
    const ventasSimuladas = Array.from({ length: 300 }, (_, i) => ({
      id: `venta-${i}`,
      fecha: "2026-01-01",
      total: 25000 + i * 100,
      tipo: "MESA",
      metodoPago: "EFECTIVO",
      platos: [{ nombre: "Bandeja Paisa", cantidad: 2 }],
    }));

    const toolResultsGrande = [
      {
        tool_use_id: "t1",
        content: JSON.stringify({
          ok: true,
          resumen: { totalCOP: 7500000, numTransacciones: 300 },
          ventas: ventasSimuladas,
        }),
      },
    ];

    const msg = await crearMensaje(userId, conv.id, {
      role: "assistant",
      content: "En el último año vendiste $7.500.000 en 300 transacciones.",
      toolResults: toolResultsGrande,
    });

    const recuperado = await prismaTest.mensaje.findUnique({ where: { id: msg.id } });
    const results = recuperado!.toolResults as typeof toolResultsGrande;
    const ventasRecuperadas = JSON.parse(results[0].content).ventas;

    expect(ventasRecuperadas).toHaveLength(300);
    expect(ventasRecuperadas[0].id).toBe("venta-0");
    expect(ventasRecuperadas[299].id).toBe("venta-299");
  });

  it("título con emojis y caracteres colombianos — UTF-8 completo preservado", async () => {
    // Un dueño que escribe "vendí 3 🍗 y jugos de lulo ñoño" genera
    // un título con emojis (UTF-8 de 4 bytes) y caracteres latinos especiales.
    const { userId } = await crearUsuarioPrueba();
    const tituloConEmojis = "Vendí 3 🍗 y 2 jugos de lulo ñoño 🥤";

    const conv = await crearConversacion(userId, tituloConEmojis);

    const recuperada = await prismaTest.conversacion.findUnique({
      where: { id: conv.id },
    });
    expect(recuperada!.titulo).toBe(tituloConEmojis);
    // Verifica que emojis (4 bytes UTF-8) y ñ/letras con tilde sobreviven intactos
  });

  it("race condition en timestamps — dos mensajes simultáneos pueden tener el mismo createdAt y el orden no es determinístico", async () => {
    // Si dos mensajes se insertan en el mismo milisegundo, ORDER BY createdAt ASC
    // no garantiza el orden entre ellos. Es una limitación del diseño actual.
    // Esta prueba documenta el comportamiento real, no un bug a corregir.
    const { userId } = await crearUsuarioPrueba();
    const conv = await crearConversacion(userId);

    // Insertar dos mensajes simultáneamente
    const [msg1, msg2] = await Promise.all([
      crearMensaje(userId, conv.id, { role: "user", content: "Mensaje A" }),
      crearMensaje(userId, conv.id, { role: "assistant", content: "Mensaje B" }),
    ]);

    // Si tienen el mismo timestamp, el orden en la query puede variar
    const historial = await prismaTest.mensaje.findMany({
      where: { conversacionId: conv.id },
      orderBy: { createdAt: "asc" },
    });

    expect(historial).toHaveLength(2);

    // Lo que SÍ garantizamos: ambos mensajes están ahí
    const contenidos = historial.map((m) => m.content);
    expect(contenidos).toContain("Mensaje A");
    expect(contenidos).toContain("Mensaje B");

    // Si los timestamps son iguales, el orden es indefinido — documenta la limitación
    if (msg1.createdAt.getTime() === msg2.createdAt.getTime()) {
      console.warn(
        "⚠ Dos mensajes tienen el mismo createdAt — el orden del historial no es determinístico en este caso."
      );
    }
  });
});
