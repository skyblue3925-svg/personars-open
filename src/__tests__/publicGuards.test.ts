import { afterEach, beforeEach, expect, test } from 'vitest';
import { guard, MAX_BODY_CHARS } from '../../api/_lib/guard';
import worker from '../../worker/src/index';

declare const process: { env: Record<string, string | undefined> };

type Headers = Record<string, string>;

function invokeGuard(req: { method?: string; body?: unknown; headers?: Headers }) {
  const headers: Headers = {};
  let statusCode = 0;
  let payload: unknown;
  const blocked = guard(req, {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    status: (status: number) => {
      statusCode = status;
      return { json: (value: unknown) => (payload = value) };
    },
  });
  return { blocked, statusCode, headers, payload: payload as Record<string, unknown> | undefined };
}

beforeEach(() => {
  process.env.ALLOWED_ORIGINS = 'https://allowed.example.test';
  delete process.env.API_DAILY_LIMIT;
});

afterEach(() => {
  delete process.env.ALLOWED_ORIGINS;
  delete process.env.API_DAILY_LIMIT;
});

test('api guard rejects requests without an Origin header', () => {
  const result = invokeGuard({ method: 'POST', body: {}, headers: { host: 'site.example.test' } });

  expect(result.blocked).toBe(true);
  expect(result.statusCode).toBe(403);
  expect(result.headers['Access-Control-Allow-Origin']).toBeUndefined();
});

test('api guard rejects an origin that is not on the allow list and not the same site', () => {
  const result = invokeGuard({ method: 'POST', body: {}, headers: { origin: 'https://evil.example.test', host: 'site.example.test' } });

  expect(result.blocked).toBe(true);
  expect(result.statusCode).toBe(403);
  expect(result.headers['Access-Control-Allow-Origin']).toBeUndefined();
});

test('api guard allows the same site and allow-listed origins and echoes only those', () => {
  const same = invokeGuard({ method: 'POST', body: {}, headers: { origin: 'https://site.example.test', host: 'site.example.test' } });
  const listed = invokeGuard({ method: 'POST', body: {}, headers: { origin: 'https://allowed.example.test', host: 'site.example.test' } });

  expect(same.blocked).toBe(false);
  expect(same.headers['Access-Control-Allow-Origin']).toBe('https://site.example.test');
  expect(listed.blocked).toBe(false);
  expect(listed.headers['Access-Control-Allow-Origin']).toBe('https://allowed.example.test');
  expect(listed.headers['Access-Control-Allow-Headers']).toContain('x-session-id');
});

test('api guard answers preflight and rejects other methods', () => {
  const headers = { origin: 'https://allowed.example.test', host: 'site.example.test' };

  expect(invokeGuard({ method: 'OPTIONS', headers }).statusCode).toBe(204);
  expect(invokeGuard({ method: 'GET', headers }).statusCode).toBe(405);
});

test('api guard rejects oversized bodies', () => {
  const result = invokeGuard({
    method: 'POST',
    body: { latest: 'x'.repeat(MAX_BODY_CHARS + 1) },
    headers: { origin: 'https://allowed.example.test', host: 'site.example.test' },
  });

  expect(result.blocked).toBe(true);
  expect(result.statusCode).toBe(413);
});

test('api guard limits calls per IP per day', () => {
  process.env.API_DAILY_LIMIT = '2';
  const req = { method: 'POST', body: {}, headers: { origin: 'https://allowed.example.test', host: 'site.example.test', 'x-forwarded-for': '9.9.9.9' } };

  expect(invokeGuard(req).blocked).toBe(false);
  expect(invokeGuard(req).blocked).toBe(false);
  const third = invokeGuard(req);

  expect(third.blocked).toBe(true);
  expect(third.statusCode).toBe(429);
});

const workerEnv = {
  ALLOWED_ORIGINS: 'https://allowed.example.test',
  AI: { run: async () => '' },
  RATE_KV: { get: async () => null, put: async () => undefined },
};

test('worker rejects a chat request that has no Origin header', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    workerEnv as never,
  );

  expect(response.status).toBe(403);
});

test('worker rejects oversized bodies before parsing them', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://allowed.example.test' },
      body: JSON.stringify({ latest: 'x'.repeat(70_000) }),
    }),
    workerEnv as never,
  );

  expect(response.status).toBe(413);
});

test('worker preflight allows the x-session-id header the client sends', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test', { method: 'OPTIONS', headers: { origin: 'https://allowed.example.test' } }),
    workerEnv as never,
  );

  expect(response.headers.get('Access-Control-Allow-Headers')).toContain('x-session-id');
});
