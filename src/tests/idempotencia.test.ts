import { describe, it, expect, beforeEach } from "vitest";
import { prismaTest } from "./setup";
import { limpiarBD, crearUsuarioPrueba } from "./helpers";

beforeEach(async () => {
  await limpiarBD();
});

// ─── HELPER LOCAL ─────────────────────────────────────────────────────────────

async function crearRegistroIdempotencia(
  userId: string,
  key: string,
  entity: string,
  recordId = "pending"
) {
  return prismaTest.idempotencyRecord.create({
    data: { userId, key, recordId, entity },
  });
}

// ─── PRUEBAS ──────────────────────────────────────────────────────────────────

describe("IdempotencyRecord — cobertura exhaustiva", () => {

  // ─── HAPPY PATH ────────────────────────────────────────────────────────────

  it("crea un registro de idempotencia correctamente", async () => {
    const { userId } = await crearUsuarioPrueba();
    const key = "550e8400-e29b-41d4-a716-446655440000";

    const record = await crearRegistroIdempotencia(userId, key, "venta", "pending");

    expect(record.id).toBeDefined();
    expect(record.userId).toBe(userId);
    expect(record.key).toBe(key);
    expect(record.entity).toBe("venta");
    expect(record.recordId).toBe("pending");
    expect(record.createdAt).toBeDefined();
  });

  it("actualiza recordId de 'pending' al ID real después de ejecutar la acción", async () => {
    // Patrón de producción: create 'pending' → ejecutar action → update con ID real.
    const { userId } = await crearUsuarioPrueba();
    const key = "550e8400-e29b-41d4-a716-446655440001";

    const record = await crearRegistroIdempotencia(userId, key, "venta", "pending");
    expect(record.recordId).toBe("pending");

    const idRealVenta = "venta-id-real-generado";
    const actualizado = await prismaTest.idempotencyRecord.update({
      where: { userId_key_entity: { userId, key, entity: "venta" } },
      data: { recordId: idRealVenta },
    });

    expect(actualizado.recordId).toBe(idRealVenta);
  });

  // ─── CONSTRAINT ÚNICO @@unique([userId, key, entity]) ─────────────────────

  it("mismo userId + key + entity → P2002 (protección contra duplicados)", async () => {
    // CRÍTICO: esta es la defensa principal contra registrar la misma venta dos veces.
    const { userId } = await crearUsuarioPrueba();
    const key = "clave-idempotente-unica";

    await crearRegistroIdempotencia(userId, key, "venta");

    await expect(
      crearRegistroIdempotencia(userId, key, "venta")
    ).rejects.toThrow();
  });

  it("mismo userId + key pero diferente entity → permitido (venta vs compra vs gasto)", async () => {
    // Un mismo UUID de idempotencia puede usarse para distintas entidades.
    // Esto es correcto: el mismo key no colisiona entre venta y compra.
    const { userId } = await crearUsuarioPrueba();
    const key = "clave-compartida";

    const r1 = await crearRegistroIdempotencia(userId, key, "venta");
    const r2 = await crearRegistroIdempotencia(userId, key, "compra");
    const r3 = await crearRegistroIdempotencia(userId, key, "gasto");

    expect(r1.entity).toBe("venta");
    expect(r2.entity).toBe("compra");
    expect(r3.entity).toBe("gasto");
  });

  it("mismo key + entity pero diferente userId → permitido (aislamiento multi-tenant)", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });
    const key = "uuid-que-coincide-en-dos-restaurantes";

    const r1 = await crearRegistroIdempotencia(u1, key, "venta");
    const r2 = await crearRegistroIdempotencia(u2, key, "venta");

    expect(r1.userId).toBe(u1);
    expect(r2.userId).toBe(u2);
    expect(r1.id).not.toBe(r2.id);
  });

  // ─── PATRÓN CRÍTICO: create-first → P2002 → return existing ───────────────

  it("patrón de idempotencia completo: primer request crea, segundo request detecta P2002 y devuelve recordId existente", async () => {
    // Este es el patrón exacto del chat en route.ts:
    // 1. Intentar crear con recordId="pending"
    // 2. Si P2002 → findUnique y devolver recordId existente
    // Esto garantiza que un retry del chat no registre la venta dos veces.
    const { userId } = await crearUsuarioPrueba();
    const key = "idempotency-key-retry-scenario";
    const entity = "venta";

    // Primera llamada: crea el registro y ejecuta la acción
    await crearRegistroIdempotencia(userId, key, entity, "pending");
    const idVentaReal = "venta-abc123";
    await prismaTest.idempotencyRecord.update({
      where: { userId_key_entity: { userId, key, entity } },
      data: { recordId: idVentaReal },
    });

    // Segunda llamada (retry): detecta P2002
    let recordIdRetornado: string | null = null;
    try {
      await prismaTest.idempotencyRecord.create({
        data: { userId, key, recordId: "pending", entity },
      });
    } catch (err: unknown) {
      // P2002 → buscar el registro existente
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        const existing = await prismaTest.idempotencyRecord.findUnique({
          where: { userId_key_entity: { userId, key, entity } },
        });
        recordIdRetornado = existing?.recordId ?? null;
      }
    }

    // El retry recibe el ID de la venta original, no crea una segunda
    expect(recordIdRetornado).toBe(idVentaReal);
  });

  it("patrón create-first con recordId='pending' es atómico — dos requests simultáneos: uno crea, el otro detecta P2002", async () => {
    // RACE CONDITION CRÍTICA: el chat IA puede enviar requests paralelos.
    // Postgres garantiza atomicidad del INSERT con unique constraint.
    const { userId } = await crearUsuarioPrueba();
    const key = "race-condition-key";
    const entity = "venta";

    const resultados = await Promise.allSettled([
      prismaTest.idempotencyRecord.create({
        data: { userId, key, recordId: "pending", entity },
      }),
      prismaTest.idempotencyRecord.create({
        data: { userId, key, recordId: "pending", entity },
      }),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const fallidos = resultados.filter((r) => r.status === "rejected");

    // Exactamente uno creó, el otro obtuvo P2002
    expect(exitosos).toHaveLength(1);
    expect(fallidos).toHaveLength(1);

    // Solo un registro en BD
    const count = await prismaTest.idempotencyRecord.count({
      where: { userId, key, entity },
    });
    expect(count).toBe(1);
  });

  // ─── ESCENARIOS DE FALLO PARCIAL ───────────────────────────────────────────

  it("si la acción falla después de crear el registro, el recordId queda en 'pending' — el dueño no puede reintentar con el mismo key", async () => {
    // ESCENARIO REAL: 1) crear IdempotencyRecord("pending"), 2) llamar registrarVenta → falla.
    // El registro queda con recordId="pending". Si el dueño reintenta con el mismo key,
    // detecta P2002, busca el registro, ve recordId="pending" y piensa que "ya estaba registrado".
    // La defensa es el cleanup cada 24h que elimina registros con recordId="pending".
    const { userId } = await crearUsuarioPrueba();
    const key = "fallo-parcial-key";

    // Simular: registro creado pero acción fallida
    await crearRegistroIdempotencia(userId, key, "venta", "pending");

    // Simular: retry detecta P2002 y busca el registro
    let recordIdEncontrado: string | null = null;
    try {
      await prismaTest.idempotencyRecord.create({
        data: { userId, key, recordId: "pending", entity: "venta" },
      });
    } catch {
      const existing = await prismaTest.idempotencyRecord.findUnique({
        where: { userId_key_entity: { userId, key, entity: "venta" } },
      });
      recordIdEncontrado = existing?.recordId ?? null;
    }

    // El retry ve "pending" — no sabe si la acción falló o está en progreso
    expect(recordIdEncontrado).toBe("pending");
    // Documenta: el cleanup de 24h es crítico para limpiar estos registros huérfanos.
  });

  it("findUnique por @@unique([userId, key, entity]) funciona como composite key", async () => {
    const { userId } = await crearUsuarioPrueba();
    const key = "composite-key-test";

    await crearRegistroIdempotencia(userId, key, "venta", "venta-xyz");

    const encontrado = await prismaTest.idempotencyRecord.findUnique({
      where: { userId_key_entity: { userId, key, entity: "venta" } },
    });

    expect(encontrado).not.toBeNull();
    expect(encontrado!.recordId).toBe("venta-xyz");
  });

  // ─── CLEANUP ───────────────────────────────────────────────────────────────

  it("cleanup manual: deleteMany de registros con más de 24h elimina solo los antiguos", async () => {
    // Patrón de mantenimiento de la BD: limpiar registros de idempotencia viejos.
    // Equivalente al SQL manual: DELETE FROM IdempotencyRecord WHERE createdAt < NOW() - INTERVAL '24 hours'
    const { userId } = await crearUsuarioPrueba();

    // Registro antiguo: simular createdAt de hace 25 horas
    const hace25h = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const registroAntiguo = await prismaTest.idempotencyRecord.create({
      data: { userId, key: "clave-antigua", recordId: "r1", entity: "venta", createdAt: hace25h },
    });

    // Registro reciente: hace 1 hora
    const hace1h = new Date(Date.now() - 1 * 60 * 60 * 1000);
    await prismaTest.idempotencyRecord.create({
      data: { userId, key: "clave-reciente", recordId: "r2", entity: "venta", createdAt: hace1h },
    });

    // Ejecutar cleanup
    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const resultado = await prismaTest.idempotencyRecord.deleteMany({
      where: { createdAt: { lt: limite24h } },
    });

    expect(resultado.count).toBe(1); // solo el antiguo

    // El reciente sigue intacto
    const reciente = await prismaTest.idempotencyRecord.findMany({
      where: { userId },
    });
    expect(reciente).toHaveLength(1);
    expect(reciente[0].key).toBe("clave-reciente");

    // El antiguo desapareció
    const antiguo = await prismaTest.idempotencyRecord.findUnique({
      where: { id: registroAntiguo.id },
    });
    expect(antiguo).toBeNull();
  });

  it("cleanup no afecta registros de otros usuarios", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    const hace25h = new Date(Date.now() - 25 * 60 * 60 * 1000);

    // Ambos usuarios tienen registros antiguos
    await prismaTest.idempotencyRecord.create({
      data: { userId: u1, key: "k1", recordId: "r1", entity: "venta", createdAt: hace25h },
    });
    await prismaTest.idempotencyRecord.create({
      data: { userId: u2, key: "k2", recordId: "r2", entity: "venta", createdAt: hace25h },
    });

    // Cleanup global (sin filtro de userId — así está en el SQL manual)
    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prismaTest.idempotencyRecord.deleteMany({
      where: { createdAt: { lt: limite24h } },
    });

    // Ambos fueron limpiados correctamente
    const countU1 = await prismaTest.idempotencyRecord.count({ where: { userId: u1 } });
    const countU2 = await prismaTest.idempotencyRecord.count({ where: { userId: u2 } });
    expect(countU1).toBe(0);
    expect(countU2).toBe(0);
  });

  // ─── CASCADE Y AISLAMIENTO ─────────────────────────────────────────────────

  it("eliminar usuario en cascada borra sus registros de idempotencia", async () => {
    const { userId } = await crearUsuarioPrueba();

    await crearRegistroIdempotencia(userId, "k1", "venta");
    await crearRegistroIdempotencia(userId, "k2", "compra");
    await crearRegistroIdempotencia(userId, "k3", "gasto");

    await prismaTest.user.delete({ where: { id: userId } });

    const count = await prismaTest.idempotencyRecord.count({ where: { userId } });
    expect(count).toBe(0);
  });

  it("aislamiento multi-tenant: usuario no puede ver registros de idempotencia de otro", async () => {
    const { userId: u1 } = await crearUsuarioPrueba({ email: "r1@test.com" });
    const { userId: u2 } = await crearUsuarioPrueba({ email: "r2@test.com" });

    await crearRegistroIdempotencia(u1, "clave-privada-u1", "venta");

    const registrosU2 = await prismaTest.idempotencyRecord.findMany({
      where: { userId: u2 },
    });
    expect(registrosU2).toHaveLength(0);
  });

  it("BD acepta cualquier string como key — la validación de formato UUID es solo en el cliente", async () => {
    // El cliente genera UUIDs con crypto.randomUUID(), pero la BD acepta cualquier string.
    // Documenta que la seguridad del key depende del cliente, no del schema.
    const { userId } = await crearUsuarioPrueba();

    const r1 = await crearRegistroIdempotencia(userId, "no-es-uuid", "venta");
    const r2 = await crearRegistroIdempotencia(userId, "", "compra");
    const r3 = await crearRegistroIdempotencia(userId, "clave con espacios y ñ", "gasto");

    expect(r1.key).toBe("no-es-uuid");
    expect(r2.key).toBe("");
    expect(r3.key).toBe("clave con espacios y ñ");
  });

  it("múltiples entidades del mismo usuario con el mismo key — tres registros coexisten sin conflicto", async () => {
    // Escenario: el dueño usa el mismo UUID para registrar una venta, una compra y un gasto
    // en el mismo turno del chat. Cada entidad tiene su propio registro.
    const { userId } = await crearUsuarioPrueba();
    const mismoKey = "uuid-turno-chat-12345";

    await crearRegistroIdempotencia(userId, mismoKey, "venta", "venta-abc");
    await crearRegistroIdempotencia(userId, mismoKey, "compra", "compra-def");
    await crearRegistroIdempotencia(userId, mismoKey, "gasto", "gasto-ghi");

    const registros = await prismaTest.idempotencyRecord.findMany({
      where: { userId, key: mismoKey },
      orderBy: { entity: "asc" },
    });

    expect(registros).toHaveLength(3);
    expect(registros.map((r) => r.entity)).toEqual(["compra", "gasto", "venta"]);
    expect(registros.map((r) => r.recordId)).toContain("venta-abc");
    expect(registros.map((r) => r.recordId)).toContain("compra-def");
    expect(registros.map((r) => r.recordId)).toContain("gasto-ghi");
  });
});
