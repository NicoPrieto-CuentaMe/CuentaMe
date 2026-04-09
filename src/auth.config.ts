import type { NextAuthConfig } from "next-auth";

/**
 * Rutas accesibles sin sesión. El resto de rutas de página exigen usuario autenticado.
 * (Las rutas bajo /api/auth quedan fuera del matcher del middleware.)
 *
 * Rutas del grupo (main) protegidas: /dashboard, /ventas, /compras, /chat, /configuracion
 * y cualquier subruta futura bajo esos prefijos, salvo que se añadan aquí como públicas.
 */
const publicPaths = new Set<string>(["/", "/login"]);

function isPublicPath(pathname: string) {
  if (publicPaths.has(pathname)) return true;
  return false;
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      if (isPublicPath(nextUrl.pathname)) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
