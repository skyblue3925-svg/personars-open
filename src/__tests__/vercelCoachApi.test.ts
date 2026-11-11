import { afterEach, expect, test, vi } from 'vitest';
import handler from '../../api/coach';

declare const process: {
  env: Record<string, string | undefined>;
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
});

test('vercel coach api asks Gemini for structured interview coaching feedback', async () => {
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
                    score: 84,
                    tags: ['좋은 후속 질문', '장면 탐색'],
                    summary: '직전 답변을 잘 이어받았습니다.',
                    suggestion: '상황을 더 구체적으로 물어보세요.',
                    revisedQuestion: '그때 실제로 어떤 일이 있었나요?',
                    coverage: {
                      lifeScene: true,
                      emotionTension: false,
                      relationship: false,
                      conditionConstraint: true,
                      unknownBoundary: false,
                    },
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 260, candidatesTokenCount: 110 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );

  const response = await invokeApi(buildBody());

  expect(response.statusCode).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]?.toString()).toContain('gemini-3-flash-preview:generateContent');
  const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
  expect(payload.generationConfig.responseMimeType).toBe('application/json');
  expect(response.body.score).toBe(84);
  expect(response.body.modelId).toBe('gemini-3-flash-preview');
  expect(response.body.usage.tokensIn).toBe(260);
});

test('vercel coach api rejects requests when no Gemini key is configured', async () => {
  const response = await invokeApi(buildBody());

  expect(response.statusCode).toBe(503);
  expect(response.body.error).toBe('coach_unavailable');
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

  return { statusCode, headers, body: payload as Record<string, any> };
}

function buildBody() {
  return {
    personaId: 'p-005',
    topic: '청소년 스마트폰 사용과 수면',
    researchQuestion: '청소년의 스마트폰 사용은 수면에 어떤 영향을 미치는가?',
    latest: '왜 그렇게 생각하세요?',
    history: [{ role: 'persona', text: '밤에 알림 때문에 자주 깹니다.' }],
    persona: {
      label: '고등학생',
      ageGroup: '10대',
      region: '경기',
      occupation: '학생',
      background: '시험을 준비하는 학생',
      perspective: '수면 부족을 체감한다',
      voice: '조심스럽게 말한다',
      livedExperiences: ['밤에 스마트폰 알림을 자주 확인한다'],
      concerns: ['수면 부족'],
      tensions: ['친구 관계와 휴식 사이의 긴장'],
    },
    character: {
      lifeContext: '시험 기간에 스마트폰 알림과 수면 부족을 함께 겪는다.',
      canSpeakTo: ['밤 시간 스마트폰 사용 경험'],
      cannotSpeakTo: ['의학적 진단'],
      concreteScenes: [
        {
          id: 'scene-1',
          setting: '잠들기 전 침대',
          people: ['본인'],
          action: '알림을 확인한다',
          pressure: '답장을 해야 한다는 압박',
          feeling: '피곤함',
          consequence: '잠드는 시간이 늦어진다',
          quoteSeed: '잠깐만 보려다가 시간이 지나요.',
        },
      ],
      recurringTensions: ['관계 유지와 수면 사이의 긴장'],
    },
  };
}
