import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChatUI } from "@/components/chat/ChatUI";

export default async function ChatPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Cargar conversaciones recientes para el selector
  const conversaciones = await prisma.conversacion.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, titulo: true, updatedAt: true },
  });

  return (
    <ChatUI
      conversaciones={conversaciones.map((c) => ({
        id: c.id,
        titulo: c.titulo,
        updatedAt: c.updatedAt.toISOString(),
      }))}
    />
  );
}
