import type { RateLimitStore } from './types';

type RateLimitEnv = {
  RATE_KV: RateLimitStore;
  DAILY_LIMIT?: string;
};

export async function isOverDailyLimit(ip: string, sessionId: string, env: RateLimitEnv, now = new Date()): Promise<boolean> {
  const limit = Number.parseInt(env.DAILY_LIMIT ?? '1500', 10);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 1500;
  const day = now.toISOString().slice(0, 10);
  const key = `persona-chat:${day}:${ip}:${sessionId}`;
  const current = Number.parseInt((await env.RATE_KV.get(key)) ?? '0', 10);

  if (current >= safeLimit) return true;

  await env.RATE_KV.put(key, String(current + 1), { expirationTtl: 60 * 60 * 30 });
  return false;
}
