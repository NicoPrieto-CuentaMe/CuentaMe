import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Rate limiter para el login:
 * Máximo 5 intentos por IP cada 60 segundos.
 * Protege contra fuerza bruta en credenciales.
 */
export const loginRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  analytics: false,
  prefix: "rl:login",
});

/**
 * Rate limiter para el chat IA:
 * Máximo 30 mensajes por usuario cada 60 segundos.
 * Protege contra abuso de créditos de Anthropic.
 */
export const chatRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  analytics: false,
  prefix: "rl:chat",
});
