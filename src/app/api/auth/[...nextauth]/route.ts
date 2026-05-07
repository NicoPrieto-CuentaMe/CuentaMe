import { handlers } from "@/auth";
import { loginRatelimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";

export const GET = handlers.GET;

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const { success, limit, remaining, reset } = await loginRatelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      {
        error: "Demasiados intentos. Espera un momento antes de volver a intentar.",
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
        },
      },
    );
  }

  return handlers.POST(req);
}
