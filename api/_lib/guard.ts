// 공개 배포용 요청 가드. api/*.ts 핸들러가 가장 먼저 호출한다.
//
// - 출처(Origin) 검사: 같은 사이트에서 온 요청이거나, 환경변수 ALLOWED_ORIGINS(쉼표 구분)에 있는 출처만 허용한다.
//   Origin 헤더가 없는 요청(curl 등)은 거부한다.
// - 요청 크기 제한: 본문이 너무 크면 거부한다(토큰 비용 폭증 방지).
// - 호출 횟수 제한: IP당 하루 API_DAILY_LIMIT회(기본 300). 서버리스 인스턴스마다 따로 세는
//   "최선 노력" 방식이라 완전한 제한이 아니다. 실제 비용 상한은 Vercel 방화벽/속도 제한이나
//   Gemini 프로젝트의 할당량으로 따로 두어야 한다(README 참조).

declare const process: {
  env: Record<string, string | undefined>;
};

type GuardRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type GuardResponse = {
  setHeader: (key: string, value: string) => void;
  status: (status: number) => { json: (value: unknown) => void };
};

export const MAX_BODY_CHARS = 60_000;

const counters = new Map<string, number>();
const MAX_COUNTER_KEYS = 5_000;
let counterDay = '';

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return false;

  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return true;

  try {
    return Boolean(host) && new URL(origin).host.toLowerCase() === host!.toLowerCase();
  } catch {
    return false;
  }
}

// 주의: x-forwarded-for의 첫 값을 믿는다. Vercel은 이 헤더를 자기가 본 클라이언트 IP로 채우지만,
// 앞단에 다른 프록시가 있거나 Vercel이 아닌 곳에 배포하면 위조될 수 있다. 그런 환경에서는 이 한도에 기대지 말고
// 호스팅의 속도 제한을 쓰라.
function clientIp(req: GuardRequest): string {
  const forwarded = headerValue(req.headers?.['x-forwarded-for']);
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

function overDailyLimit(ip: string, now = new Date()): boolean {
  const parsed = Number.parseInt(process.env.API_DAILY_LIMIT ?? '300', 10);
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
  const day = now.toISOString().slice(0, 10);
  const key = `${day}:${ip}`;

  // 날짜가 바뀌면 옛 항목을 비운다. 한 날에도 키가 너무 많아지면(IP를 바꿔 가며 부르는 경우) 오래된 것부터 지워 메모리를 묶는다.
  if (day !== counterDay) {
    counters.clear();
    counterDay = day;
  }
  if (counters.size >= MAX_COUNTER_KEYS && !counters.has(key)) {
    const oldest = counters.keys().next().value;
    if (oldest !== undefined) counters.delete(oldest);
  }

  const current = counters.get(key) ?? 0;
  if (current >= limit) return true;
  counters.set(key, current + 1);
  return false;
}

function bodySize(body: unknown): number {
  if (typeof body === 'string') return body.length;
  try {
    return JSON.stringify(body ?? null).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** 응답을 이미 보냈으면 true. 핸들러는 true이면 바로 return 한다. */
export function guard(req: GuardRequest, res: GuardResponse): boolean {
  const origin = headerValue(req.headers?.origin);
  const host = headerValue(req.headers?.host);
  const allowed = isAllowedOrigin(origin, host);

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-session-id');
  res.setHeader('Vary', 'Origin');
  if (allowed && origin) res.setHeader('Access-Control-Allow-Origin', origin);

  if (!allowed) {
    res.status(403).json({ error: 'origin_not_allowed' });
    return true;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).json({});
    return true;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return true;
  }
  if (bodySize(req.body) > MAX_BODY_CHARS) {
    res.status(413).json({ error: 'payload_too_large' });
    return true;
  }
  if (overDailyLimit(clientIp(req))) {
    res.status(429).json({ error: 'daily_limit_exceeded' });
    return true;
  }
  return false;
}
