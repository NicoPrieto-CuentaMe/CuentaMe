import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,    // 7 días máximo de inactividad
    updateAge: 24 * 60 * 60,     // refrescar token cada 24h de uso activo
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;
        const normalized = email.trim().toLowerCase();
        if (!normalized || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email: normalized },
        });

        if (!user) {
          // Hash dummy para evitar timing attack:
          // sin esto, un atacante puede enumerar emails
          // midiendo que las respuestas fallidas son ~150ms más
          // rápidas que las exitosas (bcrypt.compare no se ejecuta).
          await bcrypt.compare(
            password,
            "$2a$12$dummyhashfortimingnobodyusesthis",
          );
          return null;
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          restaurantName: user.restaurantName,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.restaurantName = user.restaurantName;
        if (user.email) token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.restaurantName = token.restaurantName as string;
      }
      return session;
    },
  },
});
