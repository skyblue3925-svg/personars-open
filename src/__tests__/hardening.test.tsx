import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import App from '../App';
import { guard } from '../../api/_lib/guard';
import { PRIVACY_NOTICE_TEXT } from '../components/PrivacyNotice';
import { SimulationNotice } from '../components/SimulationNotice';
import worker from '../../worker/src/index';

declare const process: { env: Record<string, string | undefined> };

const ORIGIN = 'https://allowed.example.test';

beforeEach(() => {
  window.localStorage.clear();
});

// --- 화면: 개인정보 고지 ---

test('the activity setup screen warns against entering personal data', () => {
  render(<App />);

  expect(screen.getByText(PRIVACY_NOTICE_TEXT)).toBeTruthy();
});

test('the simulation notice used on every interview screen also carries the privacy warning', () => {
  render(<SimulationNotice />);

  expect(screen.getByText(PRIVACY_NOTICE_TEXT)).toBeTruthy();
  expect(PRIVACY_NOTICE_TEXT).toContain('개인정보');
  expect(PRIVACY_NOTICE_TEXT).toContain('외부 AI 서비스');
});

// --- 워커: 검색 경로 제한과 입력 검증 ---

function searchRequest(body: string, origin: string | null = ORIGIN) {
  return new Request('https://worker.test/persona-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body,
  });
}

function searchEnv(kvValue: string | null = null) {
  return {
    ALLOWED_ORIGINS: ORIGIN,
    AI: { run: async () => '' },
    RATE_KV: { get: async () => kvValue, put: async () => undefined },
    PERSONA_SEARCH: { get: async () => null },
  };
}

test('worker persona-search enforces a per-IP daily limit', async () => {
  const response = await worker.fetch(searchRequest(JSON.stringify({ province: '서울', limit: 5 })), searchEnv('3000') as never);

  expect(response.status).toBe(429);
});

test('worker persona-search rejects oversized bodies', async () => {
  const response = await worker.fetch(searchRequest(JSON.stringify({ province: 'x'.repeat(11_000) })), searchEnv() as never);

  expect(response.status).toBe(413);
});

test('worker answers 400, not a crash, when latest is not a string', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        personaId: 'p',
        topic: 't',
        researchQuestion: 'q',
        latest: 12345,
        persona: { label: 'L', background: 'b', perspective: 'p', voice: 'v', livedExperiences: [], concerns: [], tensions: [] },
      }),
    }),
    searchEnv() as never,
  );

  expect(response.status).toBe(400);
});

// --- api 가드: 서로 다른 IP가 많아도 메모리가 무한정 늘지 않고 계속 동작 ---

test('api guard keeps working when many distinct IPs call in one day', () => {
  process.env.ALLOWED_ORIGINS = ORIGIN;
  const call = (ip: string) => {
    let status = 0;
    const blocked = guard(
      { method: 'POST', body: {}, headers: { origin: ORIGIN, host: 'site.example.test', 'x-forwarded-for': ip } },
      { setHeader: () => undefined, status: (s: number) => ((status = s), { json: () => undefined }) },
    );
    return { blocked, status };
  };

  for (let i = 0; i < 5_200; i += 1) expect(call(`10.0.${Math.floor(i / 250)}.${i % 250}`).blocked).toBe(false);

  expect(call('203.0.113.9').blocked).toBe(false);
  delete process.env.ALLOWED_ORIGINS;
});
