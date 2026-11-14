// 공개 배포용 보호 장치가 조용히 사라지지 않도록 지키는 회귀 테스트.
// 각 테스트는 "그 보호 장치를 지우면 실패"하도록 만들었다.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import coachHandler from '../../api/coach';
import interviewHandler from '../../api/interview';
import personaSearchHandler from '../../api/persona-search';
import worker from '../../worker/src/index';

declare const process: { env: Record<string, string | undefined> };

type ApiHandler = (req: { method?: string; body?: unknown; headers?: Record<string, string> }, res: never) => Promise<unknown> | unknown;

const SITE = 'https://site.example.test';
const EVIL = 'https://evil.example.test';

beforeEach(() => {
  process.env.ALLOWED_ORIGINS = 'https://allowed.example.test';
  delete process.env.API_DAILY_LIMIT;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ALLOWED_ORIGINS;
  delete process.env.GEMINI_API_KEY;
});

async function invoke(handler: ApiHandler, req: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let payload: unknown;
  await handler(req, {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    status: (status: number) => {
      statusCode = status;
      return { json: (value: unknown) => (payload = value) };
    },
    json: (value: unknown) => (payload = value),
  } as never);
  return { statusCode, headers, body: payload as Record<string, unknown> };
}

const persona = {
  label: '고등학생',
  background: '시험을 준비하는 학생',
  perspective: '입시 압박이 크다',
  voice: '차분하다',
  livedExperiences: ['야간 자율학습'],
  concerns: ['수면 부족'],
  tensions: ['성적과 건강'],
};

function chatBody(extra: Record<string, unknown> = {}) {
  return {
    personaId: 'p-1',
    topic: '청소년 수면',
    researchQuestion: '스마트폰은 수면에 어떤 영향을 주는가?',
    latest: '왜 그렇게 생각하세요?',
    persona,
    ...extra,
  };
}

// --- 핸들러마다 나쁜 Origin을 거부한다 (guard 호출이 빠지면 실패) ---

for (const [name, handler] of [
  ['interview', interviewHandler],
  ['coach', coachHandler],
  ['persona-search', personaSearchHandler],
] as const) {
  test(`${name} api rejects a cross-site Origin with 403 and never reaches Gemini`, async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await invoke(handler as ApiHandler, {
      method: 'POST',
      body: chatBody(),
      headers: { origin: EVIL, host: 'site.example.test' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toBe('origin_not_allowed');
    expect(response.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test(`${name} api rejects a request with no Origin header`, async () => {
    const response = await invoke(handler as ApiHandler, { method: 'POST', body: chatBody(), headers: { host: 'site.example.test' } });

    expect(response.statusCode).toBe(403);
  });
}

// --- 옛 중계 분기가 다시 생기지 않는다 ---

test('interview api never relays a raw Gemini request, even with the old proxy headers', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  const fetchMock = vi.spyOn(globalThis, 'fetch');

  const response = await invoke(interviewHandler as ApiHandler, {
    method: 'POST',
    body: { contents: [{ role: 'user', parts: [{ text: '아무 질문이나 대신 물어봐 줘' }] }] },
    headers: { origin: SITE, host: 'site.example.test', 'x-gemini-proxy': 'true', 'x-gemini-model': 'gemini-2.5-pro' },
  });

  expect(response.statusCode).toBe(400);
  expect(response.body.error).toBe('invalid_request');
  expect(fetchMock).not.toHaveBeenCalled();
});

// --- worker ---

function workerEnv(overrides: Record<string, unknown> = {}) {
  return {
    ALLOWED_ORIGINS: 'https://allowed.example.test',
    AI: { run: async () => ({ response: '[가상 페르소나 시뮬레이션]\n짧게 답합니다.' }) },
    RATE_KV: { get: async () => null, put: async () => undefined },
    ...overrides,
  };
}

test('worker persona-search route also requires an allowed Origin', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test/persona-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ province: '서울', limit: 5 }),
    }),
    workerEnv() as never,
  );

  expect(response.status).toBe(403);
});

test('worker cuts an over-long latest question and chat history before building the prompt', async () => {
  const longLatest = 'a'.repeat(5_000);
  const longHistoryText = 'h'.repeat(4_000);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: `[가상 페르소나 시뮬레이션]\n${'충분히 긴 답변입니다. '.repeat(30)}` }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );

  const response = await worker.fetch(
    new Request('https://worker.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.test' },
      body: JSON.stringify(chatBody({ latest: longLatest, history: [{ role: 'student', text: longHistoryText }] })),
    }),
    workerEnv({ GEMINI_API_KEY: 'test-key' }) as never,
  );

  expect(response.status).toBe(200);
  const sent = String(fetchMock.mock.calls[0][1]?.body);
  expect(sent).toContain('a'.repeat(1_000));
  expect(sent).not.toContain('a'.repeat(1_001));
  expect(sent).not.toContain('h'.repeat(1_501));
});

test('worker never returns upstream error bodies or exception messages to the client', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('SECRET_UPSTREAM_BODY quota project-123', { status: 400 })));

  const response = await worker.fetch(
    new Request('https://worker.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.test' },
      body: JSON.stringify(chatBody()),
    }),
    workerEnv({ GEMINI_API_KEY: 'test-key' }) as never,
  );
  const text = await response.text();

  expect(text).not.toContain('SECRET_UPSTREAM_BODY');
  expect(text).not.toContain('project-123');
  expect(JSON.parse(text).providerErrors).toContain('gemini-3-flash-preview:400');
});

test('worker has no side route that forwards a Gemini request for the caller', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch');

  const response = await worker.fetch(
    new Request('https://worker.test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://allowed.example.test',
        'x-gemini-proxy': 'true',
        'x-gemini-model': 'gemini-2.5-pro',
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: '대신 물어봐 줘' }] }] }),
    }),
    workerEnv({ GEMINI_API_KEY: 'test-key' }) as never,
  );

  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
