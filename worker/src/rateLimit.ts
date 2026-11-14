import type { RateLimitStore } from './types';

type RateLimitEnv = {
  RATE_KV: RateLimitStore;
  DAILY_LIMIT?: string;
  SEARCH_DAILY_LIMIT?: string;
};

async function overLimit(scope: string, rawLimit: string | undefined, fallback: number, ip: string, env: RateLimitEnv, now: Date): Promise<boolean> {
  const limit = Number.parseInt(rawLimit ?? String(fallback), 10);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : fallback;
  const day = now.toISOString().slice(0, 10);
  const key = `${scope}:${day}:${ip}`;
  const current = Number.parseInt((await env.RATE_KV.get(key)) ?? '0', 10);

  if (current >= safeLimit) return true;

  await env.RATE_KV.put(key, String(current + 1), { expirationTtl: 60 * 60 * 30 });
  return false;
}

// 인터뷰 응답(AI 호출) 한도: IP당 하루 DAILY_LIMIT회(기본 1500).
export function isOverDailyLimit(ip: string, env: RateLimitEnv, now = new Date()): Promise<boolean> {
  return overLimit('persona-chat', env.DAILY_LIMIT, 1500, ip, env, now);
}

// 페르소나 검색(R2 읽기) 한도: IP당 하루 SEARCH_DAILY_LIMIT회(기본 3000).
export function isOverSearchLimit(ip: string, env: RateLimitEnv, now = new Date()): Promise<boolean> {
  return overLimit('persona-search', env.SEARCH_DAILY_LIMIT, 3000, ip, env, now);
}
