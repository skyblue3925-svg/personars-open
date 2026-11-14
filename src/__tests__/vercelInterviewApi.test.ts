import { afterEach, expect, test, vi } from 'vitest';
import handler from '../../api/interview';

process.env.ALLOWED_ORIGINS = 'https://example.test';

declare const process: {
  env: Record<string, string | undefined>;
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.CLOUDFLARE_PERSONA_API_URL;
  delete process.env.PUBLIC_SITE_ORIGIN;
});

test('vercel interview api calls Gemini 3 Flash first', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '그 말에 동의하는 부분이 있어요. 아이가 미디어에서 보는 외모 기준을 집까지 가져오면, 부모 입장에서는 그냥 넘기기 어렵더라고요. 다만 매번 깊게 이야기할 시간이 부족해서 조심스럽습니다.',
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );

  const response = await invokeApi(buildBody());

  expect(response.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]?.toString()).toContain('gemini-3-flash-preview:generateContent');
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).generationConfig.maxOutputTokens).toBe(1800);
  expect(response.body.modelId).toBe('gemini-3-flash-preview');
  expect(response.body.text).toContain('미디어에서 보는 외모 기준');
});

test('vercel interview api falls back to Cloudflare Worker when Gemini is unavailable', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.CLOUDFLARE_PERSONA_API_URL = 'https://worker.example.test';
  process.env.PUBLIC_SITE_ORIGIN = 'https://site.example.test';
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('region blocked', { status: 400 }))
    .mockResolvedValueOnce(new Response('region blocked', { status: 400 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: '[가상 페르소나 시뮬레이션]\n미디어 책임이라는 말에는 동의하지만, 집에서는 아이와 대화할 시간이 부족하다는 점도 같이 느껴요.',
          modelId: '@cf/openai/gpt-oss-20b',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

  const response = await invokeApi(buildBody());

  expect(response.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2][0]).toBe('https://worker.example.test');
  expect((fetchMock.mock.calls[2][1]?.headers as Record<string, string>).origin).toBe('https://site.example.test');
  expect(response.body.modelId).toBe('@cf/openai/gpt-oss-20b');
  expect(response.body.providerErrors).toContain('gemini-3-flash-preview:400');
  expect(response.body.text).toContain('미디어 책임');
});

test('vercel interview api returns structured Korean evidence from Gemini JSON', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    text: '자기 전 알림을 확인하다가 잠드는 시간이 늦어졌습니다.',
                    evidence: [{ kind: 'lifeScene', label: '생활 장면 근거', text: '침실 장면을 바탕으로 한 답변입니다.' }],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );

  const response = await invokeApi(buildBody());
  const requestPayload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

  expect(response.statusCode).toBe(200);
  expect(requestPayload.generationConfig.responseMimeType).toBe('application/json');
  expect(response.body.text).toContain('자기 전 알림');
  expect(response.body.evidence).toEqual([
    { kind: 'lifeScene', label: '생활 장면 근거', text: '침실 장면을 바탕으로 한 답변입니다.' },
  ]);
});

test('vercel interview api rejects non-post methods', async () => {
  const response = await invokeApi(buildBody(), 'GET');

  expect(response.statusCode).toBe(405);
  expect(response.body.error).toBe('method_not_allowed');
});

async function invokeApi(body: unknown, method = 'POST') {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let payload: unknown;

  await handler(
    {
      method,
      body,
      headers: { origin: 'https://example.test' },
    },
    {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
      status: (status: number) => {
        statusCode = status;
        return {
          json: (value: unknown) => {
            payload = value;
          },
        };
      },
      json: (value: unknown) => {
        payload = value;
      },
    },
  );

  return { statusCode, headers, body: payload as Record<string, string | string[]> };
}

function buildBody() {
  return {
    personaId: 'p-005',
    topic: '외모지상주의와 미디어의 관계. 청소년을 중심으로.',
    researchQuestion: '외모지상주의와 미디어의 관계는 청소년에게 어떤 영향을 미치는가?',
    latest: '요즘은 미디어의 책임으로 돌리던데요.',
    history: [],
    persona: {
      label: '맞벌이 학부모',
      background: '40대 영남권 회사원',
      perspective: '가정과 학교의 지원을 함께 본다',
      voice: '조심스럽게 말한다',
      livedExperiences: ['퇴근 후 자녀 이야기를 듣고 학교 안내를 챙기는 시간이 부족하다'],
      concerns: ['가정의 시간과 돌봄 부담'],
      tensions: ['자녀 자율성과 부모 개입'],
    },
  };
}
