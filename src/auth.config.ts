import type { NextAuthConfig } from "next-auth";

const protectedPrefixes = ["/dashboard", "/ventas", "/compras", "/chat"] as const;

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      if (nextUrl.pathname === "/login") return true;
      if (isProtectedPath(nextUrl.pathname)) return !!auth?.user;
      return true;
    },
  },
} satisfies NextAuthConfig;
