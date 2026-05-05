import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requerido." }, { status: 400 });

    const conversacion = await prisma.conversacion.findFirst({
      where: { id, userId },
    });
    if (!conversacion) {
      return NextResponse.json({ error: "No encontrada." }, { status: 404 });
    }

    const mensajes = await prisma.mensaje.findMany({
      where: { conversacionId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return NextResponse.json({
      mensajes: mensajes.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    });
  } catch (e) {
    console.error("[GET /api/chat/historial]", e);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
